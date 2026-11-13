use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use anyhow::{bail, Result};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sysinfo::{Pid, System};
use tracing::{error, info};

use crate::git_worktree::{DiffSummary, GitWorktreeManager, MergeResult};
use crate::osc::AgentStatus;
use crate::port_broker::PortBroker;
use crate::pty::PtySessionManager;
use crate::session_store::{SessionPersistenceManager, WorkspaceMetadata};

/// Standard JSON-RPC 2.0 Request object
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RpcRequest {
    pub jsonrpc: String,
    pub id: Option<Value>,
    pub method: String,
    #[serde(default)]
    pub params: Value,
}

/// Standard JSON-RPC 2.0 Response object
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RpcResponse {
    pub jsonrpc: String,
    pub id: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub result: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<RpcError>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RpcError {
    pub code: i32,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<Value>,
}

/// Standard JSON-RPC 2.0 Notification object (server to client)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RpcNotification {
    pub jsonrpc: String,
    pub method: String,
    pub params: Value,
}

impl RpcResponse {
    pub fn ok(id: Option<Value>, result: Value) -> Self {
        Self {
            jsonrpc: "2.0".to_string(),
            id,
            result: Some(result),
            error: None,
        }
    }

    pub fn err(id: Option<Value>, code: i32, message: impl Into<String>, data: Option<Value>) -> Self {
        Self {
            jsonrpc: "2.0".to_string(),
            id,
            result: None,
            error: Some(RpcError {
                code,
                message: message.into(),
                data,
            }),
        }
    }
}

pub struct DaemonContext {
    pub pty_manager: PtySessionManager,
    pub git_manager: GitWorktreeManager,
    pub port_broker: PortBroker,
    pub session_store: SessionPersistenceManager,
}

#[derive(Clone)]
pub struct RpcDispatcher {
    ctx: Arc<DaemonContext>,
}

impl RpcDispatcher {
    pub fn new(ctx: Arc<DaemonContext>) -> Self {
        Self { ctx }
    }

    /// Dispatches an incoming JSON-RPC string message and returns response JSON string.
    pub async fn dispatch_raw(&self, raw: &str) -> Option<String> {
        let req: RpcRequest = match serde_json::from_str(raw) {
            Ok(r) => r,
            Err(e) => {
                let err_resp = RpcResponse::err(
                    None,
                    -32700,
                    format!("Parse error: {}", e),
                    None,
                );
                return serde_json::to_string(&err_resp).ok();
            }
        };

        let id = req.id.clone();
        let resp = self.dispatch(req).await;

        // If request has no id, it's a notification, no response required
        if id.is_none() {
            return None;
        }

        serde_json::to_string(&resp).ok()
    }

    /// Dispatches a structured RpcRequest.
    pub async fn dispatch(&self, req: RpcRequest) -> RpcResponse {
        let id = req.id.clone();
        let method = req.method.as_str();

        match method {
            "workspace.create" => self.handle_workspace_create(id, req.params).await,
            "workspace.list" => self.handle_workspace_list(id).await,
            "workspace.get" => self.handle_workspace_get(id, req.params).await,
            "workspace.remove" | "workspace.delete" => self.handle_workspace_remove(id, req.params).await,

            "pty.spawn" => self.handle_pty_spawn(id, req.params).await,
            "pty.write" => self.handle_pty_write(id, req.params).await,
            "pty.resize" => self.handle_pty_resize(id, req.params).await,
            "pty.kill" => self.handle_pty_kill(id, req.params).await,
            "pty.scrollback" => self.handle_pty_scrollback(id, req.params).await,

            "git.diff" | "workspace.diff" => self.handle_git_diff(id, req.params).await,
            "git.merge" | "workspace.merge" => self.handle_git_merge(id, req.params).await,
            "git.discard" | "workspace.discard" => self.handle_git_discard(id, req.params).await,

            "system.metrics" => self.handle_system_metrics(id, req.params).await,
            "system.ping" => RpcResponse::ok(id, json!({
                "status": "ok",
                "version": "0.1.0",
                "timestamp_ms": std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .map(|d| d.as_millis() as u64)
                    .unwrap_or(0),
            })),

            _ => RpcResponse::err(id, -32601, format!("Method not found: {}", method), None),
        }
    }

    // --- Workspace Handlers ---

    async fn handle_workspace_create(&self, id: Option<Value>, params: Value) -> RpcResponse {
        let repo_path_str = match params.get("repo_path").and_then(|v| v.as_str()) {
            Some(p) => p,
            None => return RpcResponse::err(id, -32602, "Missing parameter 'repo_path'", None),
        };
        let branch = match params.get("branch").and_then(|v| v.as_str()) {
            Some(b) => b,
            None => return RpcResponse::err(id, -32602, "Missing parameter 'branch'", None),
        };
        let base_branch = params
            .get("base_branch")
            .and_then(|v| v.as_str())
            .unwrap_or("main");

        let name = params
            .get("name")
            .and_then(|v| v.as_str())
            .unwrap_or(branch);

        let repo_path = PathBuf::from(repo_path_str);
        if !repo_path.exists() {
            return RpcResponse::err(id, -32000, format!("Repo path does not exist: {}", repo_path.display()), None);
        }

        // Generate workspace ID (slug or UUID)
        let ws_id = format!("ws-{}", uuid::Uuid::new_v4().to_string()[..8].to_string());

        // Determine worktree directory: default repo_root/.worktrees/<branch>
        let worktree_dir = if let Some(custom) = params.get("worktree_path").and_then(|v| v.as_str()) {
            PathBuf::from(custom)
        } else {
            repo_path.join(".worktrees").join(branch)
        };

        if let Some(parent) = worktree_dir.parent() {
            let _ = std::fs::create_dir_all(parent);
        }

        // 1. Allocate isolated ports
        let ports = match self.ctx.port_broker.allocate(&ws_id) {
            Ok(p) => p,
            Err(e) => return RpcResponse::err(id, -32001, format!("Port allocation failed: {}", e), None),
        };

        // 2. Add git worktree
        if let Err(e) = self.ctx.git_manager.add_worktree(
            &repo_path,
            &worktree_dir,
            branch,
            Some(base_branch),
        ) {
            self.ctx.port_broker.release(&ws_id);
            return RpcResponse::err(id, -32002, format!("Git worktree add failed: {}", e), None);
        }

        // 3. Inject .env.local
        let _ = PortBroker::inject_env_local(&worktree_dir, &ports);

        // 4. Save metadata
        let now_ms = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);

        let meta = WorkspaceMetadata {
            id: ws_id.clone(),
            name: name.to_string(),
            repo_path,
            worktree_path: worktree_dir,
            branch: branch.to_string(),
            base_branch: base_branch.to_string(),
            port_slot: ports.slot,
            ports,
            created_at_ms: now_ms,
            updated_at_ms: now_ms,
            status: AgentStatus::Idle,
            status_message: "Workspace created".to_string(),
            pid: None,
            is_active: false,
        };

        if let Err(e) = self.ctx.session_store.save_workspace(meta.clone()) {
            return RpcResponse::err(id, -32003, format!("Failed to persist workspace: {}", e), None);
        }

        RpcResponse::ok(id, serde_json::to_value(&meta).unwrap_or(Value::Null))
    }

    async fn handle_workspace_list(&self, id: Option<Value>) -> RpcResponse {
        let list = self.ctx.session_store.list_workspaces();
        RpcResponse::ok(id, serde_json::to_value(list).unwrap_or(Value::Null))
    }

    async fn handle_workspace_get(&self, id: Option<Value>, params: Value) -> RpcResponse {
        let ws_id = match params.get("id").and_then(|v| v.as_str()) {
            Some(i) => i,
            None => return RpcResponse::err(id, -32602, "Missing parameter 'id'", None),
        };

        if let Some(meta) = self.ctx.session_store.get_workspace(ws_id) {
            RpcResponse::ok(id, serde_json::to_value(meta).unwrap_or(Value::Null))
        } else {
            RpcResponse::err(id, -32004, format!("Workspace '{}' not found", ws_id), None)
        }
    }

    async fn handle_workspace_remove(&self, id: Option<Value>, params: Value) -> RpcResponse {
        let ws_id = match params.get("id").and_then(|v| v.as_str()) {
            Some(i) => i,
            None => return RpcResponse::err(id, -32602, "Missing parameter 'id'", None),
        };
        let delete_branch = params
            .get("delete_branch")
            .and_then(|v| v.as_bool())
            .unwrap_or(false);
        let force = params.get("force").and_then(|v| v.as_bool()).unwrap_or(true);

        let meta = match self.ctx.session_store.get_workspace(ws_id) {
            Some(m) => m,
            None => return RpcResponse::err(id, -32004, format!("Workspace '{}' not found", ws_id), None),
        };

        // 1. Kill any active session
        let _ = self.ctx.pty_manager.kill_session(ws_id);

        // 2. Release port
        self.ctx.port_broker.release(ws_id);

        // 3. Remove git worktree
        let _ = self.ctx.git_manager.remove_worktree(
            &meta.repo_path,
            &meta.worktree_path,
            force,
            delete_branch,
            Some(&meta.branch),
        );

        // 4. Delete session store
        let _ = self.ctx.session_store.delete_workspace(ws_id);

        RpcResponse::ok(id, json!({ "success": true, "id": ws_id }))
    }

    // --- PTY Handlers ---

    async fn handle_pty_spawn(&self, id: Option<Value>, params: Value) -> RpcResponse {
        let ws_id = match params.get("workspace_id").and_then(|v| v.as_str()) {
            Some(i) => i,
            None => return RpcResponse::err(id, -32602, "Missing parameter 'workspace_id'", None),
        };

        let meta = match self.ctx.session_store.get_workspace(ws_id) {
            Some(m) => m,
            None => return RpcResponse::err(id, -32004, format!("Workspace '{}' not found", ws_id), None),
        };

        // Default shell on platform
        let default_shell = if cfg!(windows) {
            "powershell.exe".to_string()
        } else {
            "/bin/bash".to_string()
        };

        let command = params
            .get("command")
            .and_then(|v| v.as_str())
            .unwrap_or(&default_shell);

        let args: Vec<String> = params
            .get("args")
            .and_then(|v| v.as_array())
            .map(|arr| arr.iter().filter_map(|x| x.as_str().map(|s| s.to_string())).collect())
            .unwrap_or_default();

        let rows = params.get("rows").and_then(|v| v.as_u64()).unwrap_or(24) as u16;
        let cols = params.get("cols").and_then(|v| v.as_u64()).unwrap_or(80) as u16;

        // Build environment variables
        let mut env_vars: HashMap<String, String> = HashMap::new();
        env_vars.insert("SWARMHERD_WORKSPACE_ID".to_string(), ws_id.to_string());
        env_vars.insert("SWARMHERD_PORT_SLOT".to_string(), meta.port_slot.to_string());
        env_vars.insert("PORT".to_string(), meta.ports.web_port.to_string());
        env_vars.insert("BACKEND_PORT".to_string(), meta.ports.backend_port.to_string());
        env_vars.insert("VITE_PORT".to_string(), meta.ports.vite_port.to_string());
        env_vars.insert("NEXT_PUBLIC_PORT".to_string(), meta.ports.web_port.to_string());
        env_vars.insert(
            "NEXT_PUBLIC_API_URL".to_string(),
            format!("http://localhost:{}", meta.ports.backend_port),
        );

        if let Some(user_env) = params.get("env").and_then(|v| v.as_object()) {
            for (k, v) in user_env {
                if let Some(val_str) = v.as_str() {
                    env_vars.insert(k.clone(), val_str.to_string());
                }
            }
        }

        match self.ctx.pty_manager.spawn_session(
            ws_id,
            &meta.worktree_path,
            command,
            &args,
            &env_vars,
            rows,
            cols,
            Some(self.ctx.session_store.clone()),
        ) {
            Ok(pid) => {
                let mut updated_meta = meta;
                updated_meta.is_active = true;
                updated_meta.pid = Some(pid);
                updated_meta.status = AgentStatus::Working;
                updated_meta.status_message = format!("Running {}", command);
                let _ = self.ctx.session_store.save_workspace(updated_meta);

                RpcResponse::ok(id, json!({
                    "workspace_id": ws_id,
                    "pid": pid,
                    "command": command,
                }))
            }
            Err(e) => RpcResponse::err(id, -32005, format!("Failed to spawn PTY: {}", e), None),
        }
    }

    async fn handle_pty_write(&self, id: Option<Value>, params: Value) -> RpcResponse {
        let ws_id = match params.get("workspace_id").and_then(|v| v.as_str()) {
            Some(i) => i,
            None => return RpcResponse::err(id, -32602, "Missing parameter 'workspace_id'", None),
        };
        let data = match params.get("data").and_then(|v| v.as_str()) {
            Some(d) => d,
            None => return RpcResponse::err(id, -32602, "Missing parameter 'data'", None),
        };

        if let Err(e) = self.ctx.pty_manager.write_input(ws_id, data.as_bytes()) {
            return RpcResponse::err(id, -32006, format!("PTY write failed: {}", e), None);
        }

        RpcResponse::ok(id, json!({ "success": true, "bytes_written": data.len() }))
    }

    async fn handle_pty_resize(&self, id: Option<Value>, params: Value) -> RpcResponse {
        let ws_id = match params.get("workspace_id").and_then(|v| v.as_str()) {
            Some(i) => i,
            None => return RpcResponse::err(id, -32602, "Missing parameter 'workspace_id'", None),
        };
        let rows = params.get("rows").and_then(|v| v.as_u64()).unwrap_or(24) as u16;
        let cols = params.get("cols").and_then(|v| v.as_u64()).unwrap_or(80) as u16;

        if let Err(e) = self.ctx.pty_manager.resize(ws_id, rows, cols) {
            return RpcResponse::err(id, -32007, format!("PTY resize failed: {}", e), None);
        }

        RpcResponse::ok(id, json!({ "success": true, "rows": rows, "cols": cols }))
    }

    async fn handle_pty_kill(&self, id: Option<Value>, params: Value) -> RpcResponse {
        let ws_id = match params.get("workspace_id").and_then(|v| v.as_str()) {
            Some(i) => i,
            None => return RpcResponse::err(id, -32602, "Missing parameter 'workspace_id'", None),
        };

        let _ = self.ctx.pty_manager.kill_session(ws_id);

        if let Some(mut meta) = self.ctx.session_store.get_workspace(ws_id) {
            meta.is_active = false;
            meta.pid = None;
            meta.status = AgentStatus::Idle;
            meta.status_message = "Process killed".to_string();
            let _ = self.ctx.session_store.save_workspace(meta);
        }

        RpcResponse::ok(id, json!({ "success": true, "workspace_id": ws_id }))
    }

    async fn handle_pty_scrollback(&self, id: Option<Value>, params: Value) -> RpcResponse {
        let ws_id = match params.get("workspace_id").and_then(|v| v.as_str()) {
            Some(i) => i,
            None => return RpcResponse::err(id, -32602, "Missing parameter 'workspace_id'", None),
        };
        let tail_bytes = params.get("tail_bytes").and_then(|v| v.as_u64()).map(|u| u as usize);

        match self.ctx.session_store.read_scrollback(ws_id, tail_bytes) {
            Ok(bytes) => {
                // Return string with UTF-8 lossy conversion for direct xterm.write
                let text = String::from_utf8_lossy(&bytes).to_string();
                RpcResponse::ok(id, json!({
                    "workspace_id": ws_id,
                    "data": text,
                    "bytes_count": bytes.len(),
                }))
            }
            Err(e) => RpcResponse::err(id, -32008, format!("Failed to read scrollback: {}", e), None),
        }
    }

    // --- Git Handlers ---

    async fn handle_git_diff(&self, id: Option<Value>, params: Value) -> RpcResponse {
        let ws_id = match params.get("workspace_id").and_then(|v| v.as_str()) {
            Some(i) => i,
            None => return RpcResponse::err(id, -32602, "Missing parameter 'workspace_id'", None),
        };

        let meta = match self.ctx.session_store.get_workspace(ws_id) {
            Some(m) => m,
            None => return RpcResponse::err(id, -32004, format!("Workspace '{}' not found", ws_id), None),
        };

        let base_branch = params
            .get("base_branch")
            .and_then(|v| v.as_str())
            .unwrap_or(&meta.base_branch);

        match self.ctx.git_manager.get_diff(&meta.worktree_path, base_branch, &meta.branch) {
            Ok(diff) => RpcResponse::ok(id, serde_json::to_value(diff).unwrap_or(Value::Null)),
            Err(e) => RpcResponse::err(id, -32009, format!("Git diff failed: {}", e), None),
        }
    }

    async fn handle_git_merge(&self, id: Option<Value>, params: Value) -> RpcResponse {
        let ws_id = match params.get("workspace_id").and_then(|v| v.as_str()) {
            Some(i) => i,
            None => return RpcResponse::err(id, -32602, "Missing parameter 'workspace_id'", None),
        };

        let meta = match self.ctx.session_store.get_workspace(ws_id) {
            Some(m) => m,
            None => return RpcResponse::err(id, -32004, format!("Workspace '{}' not found", ws_id), None),
        };

        let target_branch = params
            .get("target_branch")
            .and_then(|v| v.as_str())
            .unwrap_or(&meta.base_branch);

        let strategy = params
            .get("strategy")
            .and_then(|v| v.as_str())
            .unwrap_or("merge");

        let commit_msg = params.get("commit_msg").and_then(|v| v.as_str());

        match self.ctx.git_manager.merge(
            &meta.repo_path,
            &meta.branch,
            target_branch,
            strategy,
            commit_msg,
        ) {
            Ok(result) => RpcResponse::ok(id, serde_json::to_value(result).unwrap_or(Value::Null)),
            Err(e) => RpcResponse::err(id, -32010, format!("Git merge failed: {}", e), None),
        }
    }

    async fn handle_git_discard(&self, id: Option<Value>, params: Value) -> RpcResponse {
        let ws_id = match params.get("workspace_id").and_then(|v| v.as_str()) {
            Some(i) => i,
            None => return RpcResponse::err(id, -32602, "Missing parameter 'workspace_id'", None),
        };

        let meta = match self.ctx.session_store.get_workspace(ws_id) {
            Some(m) => m,
            None => return RpcResponse::err(id, -32004, format!("Workspace '{}' not found", ws_id), None),
        };

        match self.ctx.git_manager.discard(&meta.worktree_path) {
            Ok(()) => RpcResponse::ok(id, json!({ "success": true, "workspace_id": ws_id })),
            Err(e) => RpcResponse::err(id, -32011, format!("Git discard failed: {}", e), None),
        }
    }

    // --- System Handlers ---

    async fn handle_system_metrics(&self, id: Option<Value>, params: Value) -> RpcResponse {
        let mut sys = System::new_all();
        sys.refresh_all();

        let global_cpu = sys.global_cpu_info().cpu_usage();
        let total_mem = sys.total_memory();
        let used_mem = sys.used_memory();

        let mut ws_cpu: Option<f32> = None;
        let mut ws_mem: Option<u64> = None;
        let mut ws_pid: Option<u32> = None;

        if let Some(ws_id) = params.get("workspace_id").and_then(|v| v.as_str()) {
            if let Some(pid) = self.ctx.pty_manager.get_pid(ws_id) {
                ws_pid = Some(pid);
                let sys_pid = Pid::from_u32(pid);
                if let Some(proc) = sys.process(sys_pid) {
                    ws_cpu = Some(proc.cpu_usage());
                    ws_mem = Some(proc.memory());
                }
            }
        }

        RpcResponse::ok(id, json!({
            "system_cpu_percent": global_cpu,
            "total_memory_bytes": total_mem,
            "used_memory_bytes": used_mem,
            "workspace_pid": ws_pid,
            "workspace_cpu_percent": ws_cpu,
            "workspace_memory_bytes": ws_mem,
        }))
    }
}
