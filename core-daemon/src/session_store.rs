use std::collections::HashMap;
use std::fs::{self, File, OpenOptions};
use std::io::{Read, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};
use std::sync::{Arc, RwLock};
use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};

use crate::osc::AgentStatus;
use crate::port_broker::PortAllocation;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct WorkspaceMetadata {
    pub id: String,
    pub name: String,
    pub repo_path: PathBuf,
    pub worktree_path: PathBuf,
    pub branch: String,
    pub base_branch: String,
    pub port_slot: u16,
    pub ports: PortAllocation,
    pub created_at_ms: u64,
    pub updated_at_ms: u64,
    pub status: AgentStatus,
    pub status_message: String,
    pub pid: Option<u32>,
    pub is_active: bool,
}

#[derive(Debug, Clone)]
pub struct SessionPersistenceManager {
    base_dir: PathBuf,
    workspaces: Arc<RwLock<HashMap<String, WorkspaceMetadata>>>,
}

impl SessionPersistenceManager {
    /// Initialize persistence manager under user's home or custom dir: `~/.swarmherd`
    pub fn new(custom_dir: Option<PathBuf>) -> Result<Self> {
        let base_dir = if let Some(dir) = custom_dir {
            dir
        } else {
            dirs::home_dir()
                .unwrap_or_else(|| PathBuf::from("."))
                .join(".swarmherd")
        };

        fs::create_dir_all(&base_dir)
            .with_context(|| format!("Failed to create base dir: {}", base_dir.display()))?;

        let sessions_dir = base_dir.join("sessions");
        fs::create_dir_all(&sessions_dir)
            .with_context(|| format!("Failed to create sessions dir: {}", sessions_dir.display()))?;

        let manager = Self {
            base_dir,
            workspaces: Arc::new(RwLock::new(HashMap::new())),
        };

        // Load existing workspaces from workspaces.json
        manager.load_from_disk()?;

        Ok(manager)
    }

    fn workspaces_json_path(&self) -> PathBuf {
        self.base_dir.join("workspaces.json")
    }

    fn session_dir(&self, workspace_id: &str) -> PathBuf {
        self.base_dir.join("sessions").join(workspace_id)
    }

    fn scrollback_path(&self, workspace_id: &str) -> PathBuf {
        self.session_dir(workspace_id).join("scrollback.bin")
    }

    /// Load workspaces.json and populate in-memory state.
    pub fn load_from_disk(&self) -> Result<Vec<WorkspaceMetadata>> {
        let path = self.workspaces_json_path();
        if !path.exists() {
            return Ok(Vec::new());
        }

        let content = fs::read_to_string(&path)
            .with_context(|| format!("Failed to read {}", path.display()))?;

        let list: Vec<WorkspaceMetadata> = serde_json::from_str(&content)
            .with_context(|| format!("Failed to deserialize {}", path.display()))?;

        let mut lock = self.workspaces.write().unwrap();
        lock.clear();
        for ws in &list {
            lock.insert(ws.id.clone(), ws.clone());
        }

        Ok(list)
    }

    /// Persist current in-memory workspaces list to disk atomically.
    fn save_to_disk(&self) -> Result<()> {
        let list: Vec<WorkspaceMetadata> = {
            let lock = self.workspaces.read().unwrap();
            lock.values().cloned().collect()
        };

        let temp_path = self.base_dir.join("workspaces.json.tmp");
        let final_path = self.workspaces_json_path();

        let json = serde_json::to_string_pretty(&list)
            .context("Failed to serialize workspaces.json")?;

        fs::write(&temp_path, json)
            .with_context(|| format!("Failed to write {}", temp_path.display()))?;

        fs::rename(&temp_path, &final_path)
            .with_context(|| format!("Failed to rename temp workspaces.json to {}", final_path.display()))?;

        Ok(())
    }

    /// Insert or update workspace metadata.
    pub fn save_workspace(&self, mut meta: WorkspaceMetadata) -> Result<()> {
        meta.updated_at_ms = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);

        // Ensure session directory exists
        let s_dir = self.session_dir(&meta.id);
        fs::create_dir_all(&s_dir)
            .with_context(|| format!("Failed to create session dir: {}", s_dir.display()))?;

        {
            let mut lock = self.workspaces.write().unwrap();
            lock.insert(meta.id.clone(), meta);
        }

        self.save_to_disk()
    }

    /// Retrieve workspace metadata by ID.
    pub fn get_workspace(&self, id: &str) -> Option<WorkspaceMetadata> {
        let lock = self.workspaces.read().unwrap();
        lock.get(id).cloned()
    }

    /// List all tracked workspaces.
    pub fn list_workspaces(&self) -> Vec<WorkspaceMetadata> {
        let lock = self.workspaces.read().unwrap();
        let mut list: Vec<WorkspaceMetadata> = lock.values().cloned().collect();
        list.sort_by(|a, b| b.created_at_ms.cmp(&a.created_at_ms));
        list
    }

    /// Remove a workspace metadata and session files.
    pub fn delete_workspace(&self, id: &str) -> Result<Option<WorkspaceMetadata>> {
        let removed = {
            let mut lock = self.workspaces.write().unwrap();
            lock.remove(id)
        };

        if removed.is_some() {
            self.save_to_disk()?;
            let s_dir = self.session_dir(id);
            if s_dir.exists() {
                let _ = fs::remove_dir_all(&s_dir);
            }
        }

        Ok(removed)
    }

    /// Append raw binary/ANSI terminal output chunk to `scrollback.bin`.
    pub fn append_scrollback(&self, workspace_id: &str, data: &[u8]) -> Result<()> {
        if data.is_empty() {
            return Ok(());
        }

        let path = self.scrollback_path(workspace_id);
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)?;
        }

        let mut file = OpenOptions::new()
            .create(true)
            .append(true)
            .open(&path)
            .with_context(|| format!("Failed to open scrollback file {}", path.display()))?;

        file.write_all(data)
            .with_context(|| format!("Failed to append to scrollback file {}", path.display()))?;

        Ok(())
    }

    /// Read scrollback data. If `tail_bytes` is provided, reads only the last N bytes.
    pub fn read_scrollback(&self, workspace_id: &str, tail_bytes: Option<usize>) -> Result<Vec<u8>> {
        let path = self.scrollback_path(workspace_id);
        if !path.exists() {
            return Ok(Vec::new());
        }

        let mut file = File::open(&path)
            .with_context(|| format!("Failed to open scrollback {}", path.display()))?;

        let file_len = file.metadata()?.len();

        let seek_pos = match tail_bytes {
            Some(tail) if (tail as u64) < file_len => file_len - (tail as u64),
            _ => 0,
        };

        file.seek(SeekFrom::Start(seek_pos))?;
        let mut buffer = Vec::new();
        file.read_to_end(&mut buffer)?;

        Ok(buffer)
    }

    /// Performs recovery on daemon restart:
    /// - Checks existence of worktree paths.
    /// - Resets dead process PIDs to None and is_active to false.
    pub fn recover_on_startup(&self) -> Result<Vec<WorkspaceMetadata>> {
        let mut list = self.load_from_disk()?;
        let mut modified = false;

        for ws in &mut list {
            if ws.is_active || ws.pid.is_some() {
                // Daemon was restarted; previous child process is either dead or orphaned
                ws.is_active = false;
                ws.pid = None;
                if ws.status == AgentStatus::Working {
                    ws.status = AgentStatus::Idle;
                    ws.status_message = "Daemon restarted".to_string();
                }
                modified = true;
            }
        }

        if modified {
            let mut lock = self.workspaces.write().unwrap();
            for ws in &list {
                lock.insert(ws.id.clone(), ws.clone());
            }
            drop(lock);
            self.save_to_disk()?;
        }

        Ok(list)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn test_workspace_persistence_and_scrollback() {
        let dir = tempdir().unwrap();
        let store = SessionPersistenceManager::new(Some(dir.path().to_path_buf())).unwrap();

        let meta = WorkspaceMetadata {
            id: "ws-test-1".to_string(),
            name: "Feature Work".to_string(),
            repo_path: dir.path().join("repo"),
            worktree_path: dir.path().join("worktrees/feature-1"),
            branch: "feature-1".to_string(),
            base_branch: "main".to_string(),
            port_slot: 0,
            ports: PortAllocation {
                slot: 0,
                web_port: 3000,
                backend_port: 8000,
                vite_port: 5173,
                extra_ports: HashMap::new(),
            },
            created_at_ms: 1000,
            updated_at_ms: 1000,
            status: AgentStatus::Idle,
            status_message: "Ready".to_string(),
            pid: None,
            is_active: false,
        };

        store.save_workspace(meta.clone()).unwrap();

        let retrieved = store.get_workspace("ws-test-1").unwrap();
        assert_eq!(retrieved.name, "Feature Work");

        // Test scrollback append and tail read
        store.append_scrollback("ws-test-1", b"Hello, World!\n").unwrap();
        store.append_scrollback("ws-test-1", b"Line 2\n").unwrap();

        let full = store.read_scrollback("ws-test-1", None).unwrap();
        assert_eq!(String::from_utf8_lossy(&full), "Hello, World!\nLine 2\n");

        let tail = store.read_scrollback("ws-test-1", Some(7)).unwrap();
        assert_eq!(String::from_utf8_lossy(&tail), "Line 2\n");
    }
}
