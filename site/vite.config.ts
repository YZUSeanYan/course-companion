import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import { inspectAttr } from 'kimi-plugin-inspect-react'

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  base: './',
  plugins: [
    // 检查插件只在本地开发时启用：它会给元素加 code-path 属性并注入调试浮层，
    // 不该出现在线上页面里。
    ...(command === 'serve' ? [inspectAttr()] : []),
    react(),
  ],
  server: {
    port: 3000,
    proxy: {
      '/api/trial': {
        target: 'http://127.0.0.1:8765',
        changeOrigin: true,
        rewrite: (targetPath) => targetPath.replace(/^\/api\/trial/, '/v1/trial'),
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
