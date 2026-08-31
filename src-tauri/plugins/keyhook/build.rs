const COMMANDS: &[&str] = &["start_listen", "stop_listen", "is_listening"];

fn main() {
    tauri_plugin::Builder::new(COMMANDS).build();
}