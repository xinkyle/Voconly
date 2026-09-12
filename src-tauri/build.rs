fn main() {
    // DLL 复制逻辑已移到 beforeBundleCommand (scripts/copy-dlls.js)
    // 避免 build.rs 中的复制触发 Tauri 文件监视导致循环编译
    tauri_build::build()
}
