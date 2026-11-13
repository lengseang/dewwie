use std::collections::HashMap;
use std::io::Read;
use std::path::Path;
use std::sync::{Arc, Mutex};
use std::thread;
use anyhow::{bail, Context, Result};
use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use tokio::sync::broadcast;
use tracing::{error, info, warn};

use crate::osc::{AgentStatus, OscEvent, OscParser};
use crate::session_store::SessionPersistenceManager;

/// Broadcast event emitted by active PTY sessions.
#[derive(Debug, Clone)]
pub enum PtyOutputEvent {
    Data {
        workspace_id: String,
        data: Vec<u8>,
    },
    Osc {
        workspace_id: String,
        event: OscEvent,
    },
    Exited {
        workspace_id: String,
        exit_code: Option<u32>,
    },
}

pub struct ActiveSession {
    pub workspace_id: String,
    pub pid: Option<u32>,
    writer: Arc<Mutex<Box<dyn std::io::Write + Send>>>,
    master: Arc<Mutex<Box<dyn MasterPty + Send>>>,
    child: Arc<Mutex<Box<dyn Child + Send + Sync>>>,
}

#[derive(Clone)]
pub struct PtySessionManager {
    sessions: Arc<Mutex<HashMap<String, ActiveSession>>>,
    tx_events: broadcast::Sender<PtyOutputEvent>,
}

impl Default for PtySessionManager {
    fn default() -> Self {
        Self::new()
    }
}

impl PtySessionManager {
    pub fn new() -> Self {
        let (tx_events, _) = broadcast::channel(1024);
        Self {
            sessions: Arc::new(Mutex::new(HashMap::new())),
            tx_events,
        }
    }

    /// Subscribe to real-time PTY output and OSC state updates.
    pub fn subscribe(&self) -> broadcast::Receiver<PtyOutputEvent> {
        self.tx_events.subscribe()
    }

    /// Spawns a background persistent terminal process attached to a virtual PTY.
    pub fn spawn_session(
        &self,
        workspace_id: &str,
        cwd: &Path,
        command: &str,
        args: &[String],
        env_vars: &HashMap<String, String>,
        rows: u16,
        cols: u16,
        store: Option<SessionPersistenceManager>,
    ) -> Result<u32> {
        // If a session already exists for this workspace, kill it first
        let _ = self.kill_session(workspace_id);

        let pty_system = native_pty_system();
        let pair = pty_system
            .openpty(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .context("Failed to open native PTY pair")?;

        let mut cmd = CommandBuilder::new(command);
        cmd.args(args);
        cmd.cwd(cwd);

        // Standard terminal environment
        cmd.env("TERM", "xterm-256color");
        cmd.env("COLORTERM", "truecolor");
        for (k, v) in env_vars {
            cmd.env(k, v);
        }

        let child = pair
            .slave
            .spawn_command(cmd)
            .with_context(|| format!("Failed to spawn command '{}' in {}", command, cwd.display()))?;

        let pid = child.process_id();
        let writer = pair
            .master
            .take_writer()
            .context("Failed to take PTY writer")?;

        let master_reader = pair
            .master
            .try_clone_reader()
            .context("Failed to clone PTY reader")?;

        let master_box = pair.master;
        let arc_writer = Arc::new(Mutex::new(writer));
        let arc_master = Arc::new(Mutex::new(master_box));
        let arc_child = Arc::new(Mutex::new(child));

        let session = ActiveSession {
            workspace_id: workspace_id.to_string(),
            pid,
            writer: arc_writer,
            master: arc_master,
            child: arc_child.clone(),
        };

        {
            let mut map = self.sessions.lock().unwrap();
            map.insert(workspace_id.to_string(), session);
        }

        // Spawn background reader thread
        let ws_id = workspace_id.to_string();
        let tx = self.tx_events.clone();
        let sessions_map = self.sessions.clone();

        thread::Builder::new()
            .name(format!("pty-reader-{}", workspace_id))
            .spawn(move || {
                let mut reader = master_reader;
                let mut osc_parser = OscParser::new(true);
                let mut buf = [0u8; 8192];

                loop {
                    match reader.read(&mut buf) {
                        Ok(0) => {
                            // EOF received
                            break;
                        }
                        Ok(n) => {
                            let chunk = &buf[..n];
                            let (events, clean_data) = osc_parser.feed(chunk);

                            // Append raw stream to persistence storage
                            if let Some(ref st) = store {
                                let _ = st.append_scrollback(&ws_id, &clean_data);
                            }

                            // Emit data event
                            let _ = tx.send(PtyOutputEvent::Data {
                                workspace_id: ws_id.clone(),
                                data: clean_data,
                            });

                            // Handle parsed OSC 7501 events
                            for event in events {
                                info!(
                                    workspace = %ws_id,
                                    state = %event.state,
                                    msg = %event.message,
                                    "Agent OSC 7501 transition"
                                );

                                if let Some(ref st) = store {
                                    if let Some(mut meta) = st.get_workspace(&ws_id) {
                                        meta.status = event.state.clone();
                                        meta.status_message = event.message.clone();
                                        let _ = st.save_workspace(meta);
                                    }
                                }

                                let _ = tx.send(PtyOutputEvent::Osc {
                                    workspace_id: ws_id.clone(),
                                    event,
                                });
                            }
                        }
                        Err(e) => {
                            // Process closed or broken pipe
                            warn!(workspace = %ws_id, "PTY read ended: {}", e);
                            break;
                        }
                    }
                }

                // Child process exited: inspect exit code
                let mut exit_code = None;
                if let Ok(mut child_guard) = arc_child.lock() {
                    if let Ok(status) = child_guard.wait() {
                        exit_code = status.exit_code();
                    }
                }

                // Cleanup active session
                {
                    let mut map = sessions_map.lock().unwrap();
                    map.remove(&ws_id);
                }

                // Update metadata in store
                if let Some(ref st) = store {
                    if let Some(mut meta) = st.get_workspace(&ws_id) {
                        meta.is_active = false;
                        meta.pid = None;
                        if meta.status == AgentStatus::Working {
                            meta.status = AgentStatus::Done;
                            meta.status_message = "Process exited".to_string();
                        }
                        let _ = st.save_workspace(meta);
                    }
                }

                let _ = tx.send(PtyOutputEvent::Exited {
                    workspace_id: ws_id,
                    exit_code,
                });
            })
            .context("Failed to spawn PTY reader thread")?;

        Ok(pid.unwrap_or(0))
    }

    /// Write raw keyboard input or command into the terminal PTY.
    pub fn write_input(&self, workspace_id: &str, data: &[u8]) -> Result<()> {
        let map = self.sessions.lock().unwrap();
        if let Some(sess) = map.get(workspace_id) {
            let mut writer = sess.writer.lock().unwrap();
            writer.write_all(data).context("Failed to write to PTY")?;
            writer.flush().context("Failed to flush PTY writer")?;
            Ok(())
        } else {
            bail!("No active PTY session found for workspace '{}'", workspace_id);
        }
    }

    /// Resize terminal dimensions.
    pub fn resize(&self, workspace_id: &str, rows: u16, cols: u16) -> Result<()> {
        let map = self.sessions.lock().unwrap();
        if let Some(sess) = map.get(workspace_id) {
            let master = sess.master.lock().unwrap();
            master
                .resize(PtySize {
                    rows,
                    cols,
                    pixel_width: 0,
                    pixel_height: 0,
                })
                .context("Failed to resize PTY")?;
            Ok(())
        } else {
            bail!("No active PTY session found for workspace '{}'", workspace_id);
        }
    }

    /// Gracefully terminate or force kill process in workspace.
    pub fn kill_session(&self, workspace_id: &str) -> Result<()> {
        let mut map = self.sessions.lock().unwrap();
        if let Some(sess) = map.remove(workspace_id) {
            let mut child = sess.child.lock().unwrap();
            let _ = child.kill();
        }
        Ok(())
    }

    /// Checks if a session is currently running.
    pub fn is_running(&self, workspace_id: &str) -> bool {
        let map = self.sessions.lock().unwrap();
        map.contains_key(workspace_id)
    }

    /// Get PID of running session.
    pub fn get_pid(&self, workspace_id: &str) -> Option<u32> {
        let map = self.sessions.lock().unwrap();
        map.get(workspace_id).and_then(|s| s.pid)
    }
}
