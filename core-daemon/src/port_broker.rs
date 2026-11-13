use std::collections::{HashMap, HashSet};
use std::fs;
use std::net::TcpListener;
use std::path::Path;
use std::sync::{Arc, Mutex};
use anyhow::{bail, Context, Result};
use serde::{Deserialize, Serialize};

pub const DEFAULT_BASE_WEB: u16 = 3000;
pub const DEFAULT_BASE_BACKEND: u16 = 8000;
pub const DEFAULT_BASE_VITE: u16 = 5173;
pub const DEFAULT_MAX_SLOTS: u16 = 64;

/// Allocated port bundle for an isolated workspace/worktree.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PortAllocation {
    pub slot: u16,
    pub web_port: u16,
    pub backend_port: u16,
    pub vite_port: u16,
    pub extra_ports: HashMap<String, u16>,
}

#[derive(Debug, Clone)]
pub struct PortBroker {
    base_web: u16,
    base_backend: u16,
    base_vite: u16,
    max_slots: u16,
    // Workspace ID -> PortAllocation
    allocations: Arc<Mutex<HashMap<String, PortAllocation>>>,
}

impl Default for PortBroker {
    fn default() -> Self {
        Self::new(
            DEFAULT_BASE_WEB,
            DEFAULT_BASE_BACKEND,
            DEFAULT_BASE_VITE,
            DEFAULT_MAX_SLOTS,
        )
    }
}

impl PortBroker {
    pub fn new(base_web: u16, base_backend: u16, base_vite: u16, max_slots: u16) -> Self {
        Self {
            base_web,
            base_backend,
            base_vite,
            max_slots,
            allocations: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    /// Check if a specific TCP port is open and bindable on localhost.
    pub fn is_port_available(port: u16) -> bool {
        match TcpListener::bind(("127.0.0.1", port)) {
            Ok(listener) => {
                drop(listener);
                true
            }
            Err(_) => false,
        }
    }

    /// Find an available port starting at `start_port` searching sequentially.
    pub fn find_available_port(start_port: u16, max_offset: u16) -> Option<u16> {
        for offset in 0..max_offset {
            let port = start_port.saturating_add(offset);
            if Self::is_port_available(port) {
                return Some(port);
            }
        }
        None
    }

    /// Allocates an isolated port slot for the given workspace ID.
    pub fn allocate(&self, workspace_id: &str) -> Result<PortAllocation> {
        let mut map = self.allocations.lock().unwrap();

        // If already allocated for this workspace, return existing
        if let Some(existing) = map.get(workspace_id) {
            return Ok(existing.clone());
        }

        // Collect currently allocated slots
        let used_slots: HashSet<u16> = map.values().map(|a| a.slot).collect();

        // Find next free slot where all 3 ports (web, backend, vite) are available
        for slot in 0..self.max_slots {
            if used_slots.contains(&slot) {
                continue;
            }

            let candidate_web = self.base_web.saturating_add(slot);
            let candidate_backend = self.base_backend.saturating_add(slot);
            let candidate_vite = self.base_vite.saturating_add(slot);

            if Self::is_port_available(candidate_web)
                && Self::is_port_available(candidate_backend)
                && Self::is_port_available(candidate_vite)
            {
                let alloc = PortAllocation {
                    slot,
                    web_port: candidate_web,
                    backend_port: candidate_backend,
                    vite_port: candidate_vite,
                    extra_ports: HashMap::new(),
                };
                map.insert(workspace_id.to_string(), alloc.clone());
                return Ok(alloc);
            }
        }

        bail!(
            "Failed to allocate port bundle: All {} slots are either occupied or blocked by host services",
            self.max_slots
        );
    }

    /// Release ports allocated to a workspace.
    pub fn release(&self, workspace_id: &str) -> Option<PortAllocation> {
        let mut map = self.allocations.lock().unwrap();
        map.remove(workspace_id)
    }

    /// Query current allocation for a workspace.
    pub fn get(&self, workspace_id: &str) -> Option<PortAllocation> {
        let map = self.allocations.lock().unwrap();
        map.get(workspace_id).cloned()
    }

    /// List all active allocations.
    pub fn list_allocations(&self) -> HashMap<String, PortAllocation> {
        let map = self.allocations.lock().unwrap();
        map.clone()
    }

    /// Injects allocated ports into the `.env.local` file of a target worktree.
    /// Preserves existing unrelated environment variables.
    pub fn inject_env_local(worktree_path: &Path, alloc: &PortAllocation) -> Result<()> {
        let env_file = worktree_path.join(".env.local");
        let mut lines = Vec::new();
        let mut keys_present = HashSet::new();

        if env_file.exists() {
            let existing_content = fs::read_to_string(&env_file)
                .with_context(|| format!("Failed to read {}", env_file.display()))?;

            for line in existing_content.lines() {
                let trimmed = line.trim();
                if trimmed.starts_with('#') || trimmed.is_empty() {
                    lines.push(line.to_string());
                    continue;
                }

                if let Some((k, _)) = trimmed.split_once('=') {
                    let key = k.trim();
                    keys_present.insert(key.to_string());
                    // Replace SwarmHerd managed port keys
                    match key {
                        "PORT" => lines.push(format!("PORT={}", alloc.web_port)),
                        "BACKEND_PORT" => lines.push(format!("BACKEND_PORT={}", alloc.backend_port)),
                        "VITE_PORT" => lines.push(format!("VITE_PORT={}", alloc.vite_port)),
                        "NEXT_PUBLIC_PORT" => lines.push(format!("NEXT_PUBLIC_PORT={}", alloc.web_port)),
                        "NEXT_PUBLIC_API_URL" => {
                            lines.push(format!("NEXT_PUBLIC_API_URL=http://localhost:{}", alloc.backend_port))
                        }
                        "SWARMHERD_PORT_SLOT" => {
                            lines.push(format!("SWARMHERD_PORT_SLOT={}", alloc.slot))
                        }
                        _ => lines.push(line.to_string()),
                    }
                } else {
                    lines.push(line.to_string());
                }
            }
        }

        // Add missing SwarmHerd port variables if not present
        if !keys_present.contains("PORT") {
            lines.push(format!("PORT={}", alloc.web_port));
        }
        if !keys_present.contains("BACKEND_PORT") {
            lines.push(format!("BACKEND_PORT={}", alloc.backend_port));
        }
        if !keys_present.contains("VITE_PORT") {
            lines.push(format!("VITE_PORT={}", alloc.vite_port));
        }
        if !keys_present.contains("NEXT_PUBLIC_PORT") {
            lines.push(format!("NEXT_PUBLIC_PORT={}", alloc.web_port));
        }
        if !keys_present.contains("NEXT_PUBLIC_API_URL") {
            lines.push(format!("NEXT_PUBLIC_API_URL=http://localhost:{}", alloc.backend_port));
        }
        if !keys_present.contains("SWARMHERD_PORT_SLOT") {
            lines.push(format!("SWARMHERD_PORT_SLOT={}", alloc.slot));
        }

        let new_content = lines.join("\n") + "\n";
        fs::write(&env_file, new_content)
            .with_context(|| format!("Failed to write {}", env_file.display()))?;

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn test_allocate_and_release() {
        let broker = PortBroker::new(19000, 19100, 19200, 10);
        let alloc = broker.allocate("ws-1").expect("Should allocate");
        assert_eq!(alloc.slot, 0);
        assert_eq!(alloc.web_port, 19000);
        assert_eq!(alloc.backend_port, 19100);
        assert_eq!(alloc.vite_port, 19200);

        let alloc2 = broker.allocate("ws-2").expect("Should allocate ws-2");
        assert_eq!(alloc2.slot, 1);
        assert_eq!(alloc2.web_port, 19001);

        // Idempotent allocation for ws-1
        let alloc1_again = broker.allocate("ws-1").unwrap();
        assert_eq!(alloc1_again.slot, 0);

        // Release ws-1
        let released = broker.release("ws-1");
        assert!(released.is_some());
        assert_eq!(released.unwrap().slot, 0);

        // Next allocation should reuse slot 0
        let alloc3 = broker.allocate("ws-3").unwrap();
        assert_eq!(alloc3.slot, 0);
    }

    #[test]
    fn test_inject_env_local() {
        let dir = tempdir().unwrap();
        let alloc = PortAllocation {
            slot: 3,
            web_port: 3003,
            backend_port: 8003,
            vite_port: 5176,
            extra_ports: HashMap::new(),
        };

        // Prepopulate .env.local with custom setting
        let env_file = dir.path().join(".env.local");
        fs::write(&env_file, "DATABASE_URL=postgres://localhost/test\nPORT=9999\n").unwrap();

        PortBroker::inject_env_local(dir.path(), &alloc).expect("Injection should succeed");

        let content = fs::read_to_string(&env_file).unwrap();
        assert!(content.contains("DATABASE_URL=postgres://localhost/test"));
        assert!(content.contains("PORT=3003"));
        assert!(content.contains("BACKEND_PORT=8003"));
        assert!(content.contains("VITE_PORT=5176"));
        assert!(content.contains("SWARMHERD_PORT_SLOT=3"));
    }
}
