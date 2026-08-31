import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1421,
    strictPort: true,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
    // 预构建优化 - 减少首次加载时的编译时间
    optimizeDeps: {
      include: [
        'react',
        'react-dom',
        'react-i18next',
        'i18next',
        'i18next-browser-languagedetector',
        '@tauri-apps/api/core',
        '@tauri-apps/api/window',
        '@tauri-apps/api/event',
      ],
    },
  },
  build: {
    target: "esnext",
    minify: !process.env.TAURI_DEBUG ? "esbuild" : false,
    sourcemap: !!process.env.TAURI_DEBUG,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        float: resolve(__dirname, 'float.html'),
        preview: resolve(__dirname, 'preview.html'),
      },
    },
  },
  resolve: {
    alias: {
      "@tauri-keyhook": resolve(__dirname, "src-tauri/plugins/keyhook/js"),
    },
  },
});