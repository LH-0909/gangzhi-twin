import path from "path";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  // 部署到子路径（如 GitHub Pages 的 /gangzhi-twin/）时用 VITE_BASE 覆盖。
  base: process.env.VITE_BASE ?? "/",
  server: {
    host: "127.0.0.1",
    port: 5180,
    strictPort: true,
    proxy: { "/api": { target: "http://127.0.0.1:8011", changeOrigin: true } },
    hmr: {
      overlay: false,
    },
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  // Expose both VITE_* (Vite default) and EXPO_PUBLIC_* (Rork's cross-platform
  // public-env convention, written by tools like getOrCreateAuthConfig).
  envPrefix: ["VITE_", "EXPO_PUBLIC_"],
}));
