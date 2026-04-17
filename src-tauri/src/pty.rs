use anyhow::{anyhow, Result};
use parking_lot::Mutex;
use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use serde::Serialize;
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, State};

pub struct PtySession {
    writer: Box<dyn Write + Send>,
    master: Box<dyn portable_pty::MasterPty + Send>,
    child: Box<dyn portable_pty::Child + Send + Sync>,
}

pub struct PtyRegistry {
    inner: Arc<Mutex<HashMap<String, PtySession>>>,
}

impl PtyRegistry {
    pub fn new() -> Self {
        Self { inner: Arc::new(Mutex::new(HashMap::new())) }
    }
}

#[derive(Serialize, Clone)]
struct ExitPayload {
    code: Option<i32>,
}

#[tauri::command]
pub fn pty_spawn(
    app: AppHandle,
    registry: State<'_, PtyRegistry>,
    id: String,
    shell: Vec<String>,
) -> Result<(), String> {
    spawn_inner(app, registry, id, shell).map_err(|e| e.to_string())
}

fn spawn_inner(
    app: AppHandle,
    registry: State<'_, PtyRegistry>,
    id: String,
    shell: Vec<String>,
) -> Result<()> {
    if shell.is_empty() {
        return Err(anyhow!("empty shell command"));
    }

    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize { rows: 24, cols: 80, pixel_width: 0, pixel_height: 0 })
        .map_err(|e| anyhow!("openpty: {e}"))?;

    let mut cmd = CommandBuilder::new(&shell[0]);
    for arg in &shell[1..] {
        cmd.arg(arg);
    }
    if let Some(home) = dirs::home_dir() {
        cmd.cwd(home);
    }

    let child = pair.slave.spawn_command(cmd).map_err(|e| anyhow!("spawn: {e}"))?;
    let writer = pair.master.take_writer().map_err(|e| anyhow!("writer: {e}"))?;
    let mut reader = pair.master.try_clone_reader().map_err(|e| anyhow!("reader: {e}"))?;

    // Reader thread -> emits chunks as `pty://<id>` events.
    {
        let app = app.clone();
        let id = id.clone();
        std::thread::spawn(move || {
            let mut buf = [0u8; 4096];
            loop {
                match reader.read(&mut buf) {
                    Ok(0) => break,
                    Ok(n) => {
                        let chunk = String::from_utf8_lossy(&buf[..n]).to_string();
                        let _ = app.emit(&format!("pty://{id}"), chunk);
                    }
                    Err(_) => break,
                }
            }
            let _ = app.emit(&format!("pty-exit://{id}"), ExitPayload { code: None });
        });
    }

    registry.inner.lock().insert(
        id,
        PtySession { writer, master: pair.master, child },
    );
    // slave is dropped; its fd remains owned by the spawned child.
    drop(pair.slave);
    Ok(())
}

#[tauri::command]
pub fn pty_write(
    registry: State<'_, PtyRegistry>,
    id: String,
    data: String,
) -> Result<(), String> {
    let mut map = registry.inner.lock();
    let session = map.get_mut(&id).ok_or_else(|| "unknown pty id".to_string())?;
    session.writer.write_all(data.as_bytes()).map_err(|e| e.to_string())?;
    session.writer.flush().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn pty_resize(
    registry: State<'_, PtyRegistry>,
    id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    let map = registry.inner.lock();
    let session = map.get(&id).ok_or_else(|| "unknown pty id".to_string())?;
    session
        .master
        .resize(PtySize { rows, cols, pixel_width: 0, pixel_height: 0 })
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn pty_kill(registry: State<'_, PtyRegistry>, id: String) -> Result<(), String> {
    let mut map = registry.inner.lock();
    if let Some(mut session) = map.remove(&id) {
        let _ = session.child.kill();
        let _ = session.child.wait();
    }
    Ok(())
}
