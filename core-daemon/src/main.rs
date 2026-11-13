mod git_worktree;
mod osc;
mod port_broker;
mod pty;
mod rpc;
mod session_store;

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use anyhow::{Context, Result};
use clap::Parser;
use futures::{SinkExt, StreamExt};
use serde_json::json;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::net::TcpListener;
use tokio::sync::broadcast;
use tokio_util::codec::{Framed, LinesCodec};
use tracing::{error, info, warn};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

use crate::git_worktree::GitWorktreeManager;
use crate::osc::AgentStatus;
use crate::port_broker::PortBroker;
use crate::pty::{PtyOutputEvent, PtySessionManager};
use crate::rpc::{DaemonContext, RpcDispatcher, RpcNotification};
use crate::session_store::SessionPersistenceManager;

#[derive(Parser, Debug)]
#[command(
    name = "swarmherd-core-daemon",
    about = "Persistent PTY and Git Worktree daemon for SwarmHerd",
    version = "0.1.0"
)]
struct CliArgs {
    /// TCP listen port for JSON-RPC connections
    #[arg(short, long, default_value_t = 7500)]
    port: u16,

    /// Bind host for TCP listener
    #[arg(long, default_value = "127.0.0.1")]
    host: String,

    /// Named Pipe name on Windows (\\.\pipe\<name>)
    #[arg(long, default_value = "swarmherd-daemon")]
    pipe: String,

    /// Unix socket path on Linux/macOS
    #[arg(long)]
    socket: Option<PathBuf>,

    /// Custom base directory for session persistence
    #[arg(long)]
    data_dir: Option<PathBuf>,

    /// Disable TCP listener (serve only on Named Pipe or Unix Socket)
    #[arg(long, default_value_t = false)]
    no_tcp: bool,
}

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "swarmherd_core_daemon=info,info".into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    let args = CliArgs::parse();

    info!(
        "Initializing SwarmHerd Core Daemon v0.1.0 (PID: {})",
        std::process::id()
    );

    // Initialize core subsystems
    let session_store = SessionPersistenceManager::new(args.data_dir.clone())
        .context("Failed to initialize session persistence store")?;

    // Perform startup recovery
    match session_store.recover_on_startup() {
        Ok(recovered) => {
            info!("Recovered {} workspace session(s) from disk", recovered.len());
            for ws in recovered {
                info!("  - Workspace [{}]: branch={}, status={}", ws.id, ws.branch, ws.status);
            }
        }
        Err(e) => {
            warn!("Failed during session recovery: {}", e);
        }
    }

    let pty_manager = PtySessionManager::new();
    let git_manager = GitWorktreeManager::new();
    let port_broker = PortBroker::default();

    let ctx = Arc::new(DaemonContext {
        pty_manager: pty_manager.clone(),
        git_manager,
        port_broker,
        session_store,
    });

    let dispatcher = RpcDispatcher::new(ctx.clone());

    // Spawn TCP listener
    if !args.no_tcp {
        let addr = format!("{}:{}", args.host, args.port);
        let listener = TcpListener::bind(&addr)
            .await
            .with_context(|| format!("Failed to bind TCP listener to {}", addr))?;

        info!("JSON-RPC TCP server listening on http://{}", addr);

        let disp = dispatcher.clone();
        let pty_mgr = pty_manager.clone();

        tokio::spawn(async move {
            loop {
                match listener.accept().await {
                    Ok((socket, remote_addr)) => {
                        info!("New TCP connection from {}", remote_addr);
                        let client_disp = disp.clone();
                        let rx_events = pty_mgr.subscribe();

                        tokio::spawn(async move {
                            handle_client_connection(socket, client_disp, rx_events).await;
                        });
                    }
                    Err(e) => {
                        error!("TCP accept error: {}", e);
                    }
                }
            }
        });
    }

    // Spawn Windows Named Pipe Server
    #[cfg(windows)]
    {
        let pipe_name = format!(r"\\.\pipe\{}", args.pipe);
        info!("JSON-RPC Windows Named Pipe server listening on {}", pipe_name);

        let disp = dispatcher.clone();
        let pty_mgr = pty_manager.clone();
        let pipe_name_clone = pipe_name.clone();

        tokio::spawn(async move {
            use tokio::net::windows::named_pipe::ServerOptions;

            loop {
                let server = ServerOptions::new()
                    .first_pipe_instance(false)
                    .create(&pipe_name_clone);

                match server {
                    Ok(mut pipe_server) => {
                        if let Err(e) = pipe_server.connect().await {
                            warn!("Named pipe connection failed: {}", e);
                            continue;
                        }

                        info!("New client connected on Named Pipe {}", pipe_name_clone);
                        let client_disp = disp.clone();
                        let rx_events = pty_mgr.subscribe();

                        tokio::spawn(async move {
                            handle_client_connection(pipe_server, client_disp, rx_events).await;
                        });
                    }
                    Err(e) => {
                        error!("Failed to create Named Pipe instance: {}", e);
                        tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
                    }
                }
            }
        });
    }

    // Spawn Unix Domain Socket Server on non-Windows
    #[cfg(unix)]
    {
        let socket_path = args.socket.unwrap_or_else(|| {
            dirs::home_dir()
                .unwrap_or_else(|| PathBuf::from("."))
                .join(".swarmherd")
                .join("daemon.sock")
        });

        if let Some(parent) = socket_path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        let _ = std::fs::remove_file(&socket_path);

        match tokio::net::UnixListener::bind(&socket_path) {
            Ok(unix_listener) => {
                info!("JSON-RPC Unix Domain Socket listening on {}", socket_path.display());
                let disp = dispatcher.clone();
                let pty_mgr = pty_manager.clone();

                tokio::spawn(async move {
                    loop {
                        match unix_listener.accept().await {
                            Ok((stream, _)) => {
                                info!("New Unix domain socket connection");
                                let client_disp = disp.clone();
                                let rx_events = pty_mgr.subscribe();

                                tokio::spawn(async move {
                                    handle_client_connection(stream, client_disp, rx_events).await;
                                });
                            }
                            Err(e) => {
                                error!("Unix listener accept error: {}", e);
                            }
                        }
                    }
                });
            }
            Err(e) => {
                error!("Failed to bind Unix socket {}: {}", socket_path.display(), e);
            }
        }
    }

    info!("SwarmHerd Core Daemon running. Press Ctrl+C to terminate.");

    // Wait for shutdown signal
    tokio::signal::ctrl_c().await?;
    info!("Shutdown signal received. Terminating all active PTY sessions...");

    let _ = ctx.pty_manager.kill_session("*");
    info!("SwarmHerd Core Daemon shut down cleanly.");

    Ok(())
}

/// Generic connection handler for any AsyncRead + AsyncWrite stream (TCP, Named Pipe, Unix Socket).
async fn handle_client_connection<S>(
    stream: S,
    dispatcher: RpcDispatcher,
    mut rx_events: broadcast::Receiver<PtyOutputEvent>,
) where
    S: tokio::io::AsyncRead + tokio::io::AsyncWrite + Send + 'static,
{
    let framed = Framed::new(stream, LinesCodec::new());
    let (mut sink, mut reader) = framed.split();

    loop {
        tokio::select! {
            // Incoming RPC request from client
            line_result = reader.next() => {
                match line_result {
                    Some(Ok(line)) => {
                        let trimmed = line.trim();
                        if trimmed.is_empty() {
                            continue;
                        }

                        if let Some(resp_str) = dispatcher.dispatch_raw(trimmed).await {
                            if let Err(e) = sink.send(resp_str).await {
                                warn!("Failed to send RPC response: {}", e);
                                break;
                            }
                        }
                    }
                    Some(Err(e)) => {
                        warn!("Socket read error: {}", e);
                        break;
                    }
                    None => {
                        // Client disconnected
                        break;
                    }
                }
            }

            // Real-time broadcast events from running PTY processes
            event_result = rx_events.recv() => {
                match event_result {
                    Ok(event) => {
                        let notification = match event {
                            PtyOutputEvent::Data { workspace_id, data } => {
                                let text = String::from_utf8_lossy(&data).to_string();
                                RpcNotification {
                                    jsonrpc: "2.0".to_string(),
                                    method: "pty.output".to_string(),
                                    params: json!({
                                        "workspace_id": workspace_id,
                                        "data": text,
                                    }),
                                }
                            }
                            PtyOutputEvent::Osc { workspace_id, event } => {
                                RpcNotification {
                                    jsonrpc: "2.0".to_string(),
                                    method: "agent.status".to_string(),
                                    params: json!({
                                        "workspace_id": workspace_id,
                                        "state": event.state,
                                        "message": event.message,
                                        "metadata": event.metadata,
                                        "timestamp_ms": event.timestamp_ms,
                                    }),
                                }
                            }
                            PtyOutputEvent::Exited { workspace_id, exit_code } => {
                                RpcNotification {
                                    jsonrpc: "2.0".to_string(),
                                    method: "pty.exited".to_string(),
                                    params: json!({
                                        "workspace_id": workspace_id,
                                        "exit_code": exit_code,
                                    }),
                                }
                            }
                        };

                        if let Ok(json_str) = serde_json::to_string(&notification) {
                            if let Err(e) = sink.send(json_str).await {
                                warn!("Failed to send RPC notification: {}", e);
                                break;
                            }
                        }
                    }
                    Err(broadcast::error::RecvError::Lagged(skipped)) => {
                        warn!("Client lagged behind by {} broadcast events", skipped);
                    }
                    Err(broadcast::error::RecvError::Closed) => {
                        break;
                    }
                }
            }
        }
    }
}
