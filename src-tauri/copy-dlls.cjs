// 复制 DLL 文件的脚本
// 在 Tauri 编译完成后、打包前执行

const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, 'target', 'release');
const destDir = path.join(__dirname, 'resources');

const dlls = [
  'ggml.dll',
  'ggml-base.dll',
  'ggml-cpu-alderlake.dll',
  'ggml-cpu-cannonlake.dll',
  'ggml-cpu-cascadelake.dll',
  'ggml-cpu-haswell.dll',
  'ggml-cpu-icelake.dll',
  'ggml-cpu-sandybridge.dll',
  'ggml-cpu-skylakex.dll',
  'ggml-cpu-sse42.dll',
  'ggml-cpu-x64.dll',
  'ggml-vulkan.dll',
  'transcribe.dll',
];

// 确保 resources 目录存在
if (!fs.existsSync(destDir)) {
  fs.mkdirSync(destDir, { recursive: true });
}

let copied = 0;
for (const dll of dlls) {
  const src = path.join(srcDir, dll);
  const dest = path.join(destDir, dll);

  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
    console.log(`Copied: ${dll}`);
    copied++;
  } else {
    console.log(`Not found: ${dll}`);
  }
}

console.log(`Total copied: ${copied} DLL files`);