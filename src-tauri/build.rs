use std::fs;
use std::path::Path;

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

    // Copy all DLL files
    let mut copied = 0;
    for entry in fs::read_dir(src_dir).expect("Failed to read source directory") {
        let entry = entry.expect("Failed to read entry");
        let path = entry.path();

        if path.extension().map_or(false, |ext| ext == "dll") {
            let dest = dest_dir.join(path.file_name().unwrap());
            fs::copy(&path, &dest).expect(&format!("Failed to copy {:?}", path));
            copied += 1;
        }
    }

    println!("cargo:warning=Copied {} DLL files to resources/", copied);

    // Rerun if source DLLs change
    println!("cargo:rerun-if-changed=transcribe-native-windows-x86_64-cpu-vulkan");
}

fn main() {
    copy_transcribe_dlls();
    tauri_build::build()
}
