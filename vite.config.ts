import path from "path"
const __dirname = import.meta.dirname
import react from "@vitejs/plugin-react"
import { defineConfig, loadEnv } from "vite"

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, "")
  // GitHub Pages 项目站点带子路径（用户名.github.io/仓库名/）。
  // 仓库名与 base 必须一致；本地开发用默认 "/"，部署前在 .env 里设 VITE_BASE_PATH=/仓库名/
  const base = env.VITE_BASE_PATH || "/"
  return {
    plugins: [react()],
    base,
    server: {
      port: 3000,
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
        "@contracts": path.resolve(__dirname, "./contracts"),
      },
    },
    envDir: path.resolve(__dirname),
    build: {
      outDir: path.resolve(__dirname, "dist"),
      emptyOutDir: true,
    },
  }
})
