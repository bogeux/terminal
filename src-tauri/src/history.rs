use std::fs::OpenOptions;
use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;

// Bash-history-style file at %USERPROFILE%\.terminal_history
// Format: one command per line, UTF-8. Simple and grep-friendly.
fn history_path() -> Option<PathBuf> {
    dirs::home_dir().map(|h| h.join(".terminal_history"))
}

#[tauri::command]
pub fn history_append(entry: String) -> Result<(), String> {
    let entry = entry.trim();
    if entry.is_empty() {
        return Ok(());
    }
    let path = history_path().ok_or_else(|| "no home dir".to_string())?;
    let mut f = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .map_err(|e| e.to_string())?;
    writeln!(f, "{entry}").map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn history_read(limit: Option<usize>) -> Result<Vec<String>, String> {
    let path = match history_path() {
        Some(p) => p,
        None => return Ok(vec![]),
    };
    if !path.exists() {
        return Ok(vec![]);
    }
    let f = std::fs::File::open(&path).map_err(|e| e.to_string())?;
    let lines: Vec<String> = BufReader::new(f)
        .lines()
        .map_while(Result::ok)
        .collect();
    let take = limit.unwrap_or(lines.len()).min(lines.len());
    Ok(lines[lines.len() - take..].to_vec())
}
