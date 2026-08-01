@echo off
REM ============================================================
REM Voconly CUDA 版本构建脚本
REM 使用 VS2022 + CUDA 13.0 编译 llama.cpp GPU 版本
REM ============================================================

REM 设置 VS2022 开发环境（必须先设置）
call "D:\ProgramFiles\visualstudio2022\Common7\Tools\VsDevCmd.bat" -arch=x64 -host_arch=x64

REM 设置 CUDA 路径
set CUDA_PATH=C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA\v13.0
set CUDACXX=%CUDA_PATH%\bin\nvcc.exe
set PATH=%CUDA_PATH%\bin;%PATH%

REM 设置 CUDA 架构（RTX 5080 = Blackwell, compute capability 12.0）
set CUDAARCHS=120

REM 清理之前的编译缓存
cd /d F:\projects\Voconly\src-tauri
cargo clean -p llama_cpp_sys

REM 编译 release 版本
echo 正在编译 llama.cpp CUDA 版本...
cargo build --features local_llm --release

if %ERRORLEVEL% equ 0 (
    echo.
    echo ========================================
    echo 编译成功！
    echo ========================================
) else (
    echo.
    echo ========================================
    echo 编译失败，请检查错误信息
    echo ========================================
)
pause