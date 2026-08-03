use std::fs;
use std::path::Path;

/// 只在源文件和目标文件不同时才复制，避免更新时间戳触发无限重编译
fn smart_copy(src: &Path, dest: &Path) -> bool {
    // 目标不存在，直接复制
    if !dest.exists() {
        fs::copy(src, dest).expect(&format!("Failed to copy {:?}", src));
        return true;
    }

    // 比较文件大小
    let src_len = fs::metadata(src).map(|m| m.len()).unwrap_or(0);
    let dest_len = fs::metadata(dest).map(|m| m.len()).unwrap_or(0);

    if src_len != dest_len {
        fs::copy(src, dest).expect(&format!("Failed to copy {:?}", src));
        return true;
    }

    // 内容相同，不复制（避免更新时间戳）
    false
}

fn copy_transcribe_dlls() {
    let src_dir = Path::new("transcribe-native-windows-x86_64-cpu-vulkan");
    let dest_dir = Path::new("resources");

    if !src_dir.exists() {
        println!("cargo:warning=Transcribe DLL source directory not found: {:?}", src_dir);
        return;
    }

    // Ensure resources directory exists
    if !dest_dir.exists() {
        fs::create_dir_all(dest_dir).expect("Failed to create resources directory");
    }

    // Copy DLL files only when content differs
    let mut copied = 0;
    let mut skipped = 0;
    for entry in fs::read_dir(src_dir).expect("Failed to read source directory") {
        let entry = entry.expect("Failed to read entry");
        let path = entry.path();

        if path.extension().map_or(false, |ext| ext == "dll") {
            let dest = dest_dir.join(path.file_name().unwrap());
            if smart_copy(&path, &dest) {
                copied += 1;
            } else {
                skipped += 1;
            }
        }
    }

    if copied > 0 {
        println!("cargo:warning=Copied {} DLL files to resources/ ({} skipped, identical)", copied, skipped);
    }

    // Rerun if source DLLs change
    println!("cargo:rerun-if-changed=transcribe-native-windows-x86_64-cpu-vulkan");
}

fn main() {
    copy_transcribe_dlls();
    tauri_build::build()
}
