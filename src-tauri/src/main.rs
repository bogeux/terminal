#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod pty;
mod shell;
mod ssh;
mod history;

use pty::PtyRegistry;

fn main() {
    tauri::Builder::default()
        .manage(PtyRegistry::new())
        .invoke_handler(tauri::generate_handler![
            shell::list_shells,
            ssh::list_ssh_hosts,
            pty::pty_spawn,
            pty::pty_write,
            pty::pty_resize,
            pty::pty_kill,
            history::history_append,
            history::history_read,
        ])
        .run(tauri::generate_context!())
        .expect("error while running terminal app");
}
