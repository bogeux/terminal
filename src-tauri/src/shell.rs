use serde::Serialize;
use std::path::PathBuf;
use std::process::Command;

#[derive(Serialize, Clone)]
pub struct ShellEntry {
    pub name: String,
    pub command: Vec<String>,
}

#[tauri::command]
pub fn list_shells() -> Vec<ShellEntry> {
    let mut out: Vec<ShellEntry> = Vec::new();

    // PowerShell 7 (pwsh.exe) — preferred if available.
    if let Some(p) = which("pwsh.exe") {
        out.push(ShellEntry {
            name: "PowerShell 7".into(),
            command: vec![p.to_string_lossy().to_string()],
        });
    }

    // Windows PowerShell 5.1
    if let Some(p) = which("powershell.exe") {
        out.push(ShellEntry {
            name: "Windows PowerShell".into(),
            command: vec![p.to_string_lossy().to_string()],
        });
    }

    // cmd.exe — always present on Windows.
    if let Some(p) = which("cmd.exe") {
        out.push(ShellEntry {
            name: "Command Prompt".into(),
            command: vec![p.to_string_lossy().to_string()],
        });
    }

    // Git Bash — typical install path.
    for candidate in [
        r"C:\Program Files\Git\bin\bash.exe",
        r"C:\Program Files (x86)\Git\bin\bash.exe",
    ] {
        if PathBuf::from(candidate).exists() {
            out.push(ShellEntry {
                name: "Git Bash".into(),
                command: vec![candidate.into(), "--login".into(), "-i".into()],
            });
            break;
        }
    }

    // WSL distributions via `wsl.exe -l -q`.
    if let Some(wsl) = which("wsl.exe") {
        if let Ok(output) = Command::new(&wsl).args(["-l", "-q"]).output() {
            let text = decode_utf16_lossy(&output.stdout);
            for line in text.lines() {
                let name = line.trim().trim_end_matches('\0');
                if !name.is_empty() {
                    out.push(ShellEntry {
                        name: format!("WSL: {}", name),
                        command: vec![
                            wsl.to_string_lossy().to_string(),
                            "-d".into(),
                            name.into(),
                        ],
                    });
                }
            }
        }
    }

    out
}

fn which(binary: &str) -> Option<PathBuf> {
    let path_var = std::env::var_os("PATH")?;
    for dir in std::env::split_paths(&path_var) {
        let candidate = dir.join(binary);
        if candidate.is_file() {
            return Some(candidate);
        }
    }
    None
}

// `wsl.exe` emits UTF-16LE. Decode leniently.
fn decode_utf16_lossy(bytes: &[u8]) -> String {
    if bytes.len() < 2 {
        return String::new();
    }
    let u16s: Vec<u16> = bytes
        .chunks_exact(2)
        .map(|c| u16::from_le_bytes([c[0], c[1]]))
        .collect();
    String::from_utf16_lossy(&u16s)
}
