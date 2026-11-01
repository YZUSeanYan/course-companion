/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// 构建产物使用相对路径，便于网关挂载在 /web/ 之类的子路径下。
export default defineConfig({
  plugins: [react()],
  base: "./",
  build: {
    outDir: "dist",
    sourcemap: false,
  },
  server: {
    port: 5174,
    proxy: {
      "/health": { target: "http://127.0.0.1:8765", changeOrigin: true },
      "/v1": { target: "http://127.0.0.1:8765", changeOrigin: true },
      "/v2": { target: "http://127.0.0.1:8765", ws: true, changeOrigin: true },
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    setupFiles: ["src/test-setup.ts"],
  },
});
