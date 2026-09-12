fn main() {
    // Stage transcribe-cpp's shared runtime libraries for the installer
    stage_transcribe_runtime_libs();

    tauri_build::build()
}

/// Stage transcribe-cpp's shared runtime libraries into `transcribe-libs/` so the
/// installer can ship them next to the executable.
///
/// Source dirs arrive as `DEP_TRANSCRIBE_CPP_*`: the sys crate emits its install
/// dirs and the wrapper forwards them one hop to us.
fn stage_transcribe_runtime_libs() {
    use std::collections::BTreeSet;
    use std::path::PathBuf;

    println!("cargo:rerun-if-env-changed=DEP_TRANSCRIBE_CPP_RUNTIME_DIR");
    println!("cargo:rerun-if-env-changed=DEP_TRANSCRIBE_CPP_MODULE_DIR");

    // Present only in a shared posture. A static build has nothing to ship.
    let Some(runtime_dir) = std::env::var_os("DEP_TRANSCRIBE_CPP_RUNTIME_DIR") else {
        return;
    };

    // Collect both RUNTIME_DIR and MODULE_DIR (may be the same directory)
    let mut dirs = BTreeSet::new();
    dirs.insert(PathBuf::from(runtime_dir));
    if let Some(module_dir) = std::env::var_os("DEP_TRANSCRIBE_CPP_MODULE_DIR") {
        dirs.insert(PathBuf::from(module_dir));
    }

    let dest = PathBuf::from(std::env::var("CARGO_MANIFEST_DIR").unwrap()).join("transcribe-libs");
    // Recreate clean so renamed/dropped modules don't linger
    let _ = std::fs::remove_dir_all(&dest);
    std::fs::create_dir_all(&dest).expect("create transcribe-libs staging dir");

    let mut copied = 0usize;
    for dir in &dirs {
        println!("cargo:rerun-if-changed={}", dir.display());
        for entry in std::fs::read_dir(dir)
            .unwrap_or_else(|e| panic!("read {}: {e}", dir.display()))
            .flatten()
        {
            let src = entry.path();
            let name = src.file_name().and_then(|s| s.to_str()).unwrap_or("");
            // Match by NAME, not extension: handles .dll, .so, .dylib
            let is_lib = name.ends_with(".dll")
                || name.ends_with(".dylib")
                || name.ends_with(".so")
                || name.contains(".so.");
            if is_lib {
                std::fs::copy(&src, dest.join(name))
                    .unwrap_or_else(|e| panic!("copy {}: {e}", src.display()));
                copied += 1;
            }
        }
    }
    if copied == 0 {
        println!(
            "cargo:warning=no transcribe-cpp runtime libraries found under {dirs:?}"
        );
    } else {
        println!("cargo:warning=Staged {copied} transcribe-cpp runtime library file(s)");
    }
}