use serde::Serialize;
use std::fs;

#[derive(Serialize, Clone)]
pub struct SshHost {
    pub alias: String,
    pub hostname: Option<String>,
    pub user: Option<String>,
    pub port: Option<String>,
}

// Parses ~/.ssh/config and returns configured hosts. Wildcard-only Host
// blocks (e.g. `Host *`) are skipped because they're not directly
// connectable. Include/Match directives are not followed (VS Code does;
// add it later if you need it).
#[tauri::command]
pub fn list_ssh_hosts() -> Vec<SshHost> {
    let path = match dirs::home_dir() {
        Some(h) => h.join(".ssh").join("config"),
        None => return vec![],
    };
    let content = match fs::read_to_string(&path) {
        Ok(c) => c,
        Err(_) => return vec![],
    };
    parse(&content)
}

fn parse(content: &str) -> Vec<SshHost> {
    let mut out = Vec::new();
    let mut current: Option<SshHost> = None;

    for raw in content.lines() {
        let line = raw.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        let mut parts = line.splitn(2, char::is_whitespace);
        let key = parts.next().unwrap_or("").to_ascii_lowercase();
        let value = parts
            .next()
            .unwrap_or("")
            .trim()
            .trim_start_matches('=')
            .trim()
            .trim_matches('"');

        match key.as_str() {
            "host" => {
                if let Some(h) = current.take() {
                    out.push(h);
                }
                let alias = value
                    .split_whitespace()
                    .find(|p| !p.contains('*') && !p.contains('?'));
                current = alias.map(|a| SshHost {
                    alias: a.to_string(),
                    hostname: None,
                    user: None,
                    port: None,
                });
            }
            "hostname" => {
                if let Some(h) = current.as_mut() {
                    h.hostname = Some(value.to_string());
                }
            }
            "user" => {
                if let Some(h) = current.as_mut() {
                    h.user = Some(value.to_string());
                }
            }
            "port" => {
                if let Some(h) = current.as_mut() {
                    h.port = Some(value.to_string());
                }
            }
            _ => {}
        }
    }
    if let Some(h) = current {
        out.push(h);
    }
    out
}
