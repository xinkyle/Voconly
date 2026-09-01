const COMMANDS: &[&str] = &["start_listen", "stop_listen", "is_listening", "set_shortcut_block", "clear_block_rule"];

fn main() {
    tauri_plugin::Builder::new(COMMANDS).build();
}