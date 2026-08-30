import { defineConfig } from "vite";

export default defineConfig({
  server: {
    port: 5173,
    host: true,
    open: false,
  },
  preview: {
    port: 4173,
  },
  build: {
    target: "es2022",
    sourcemap: true,
  },
  optimizeDeps: {
    exclude: ["@mediapipe/tasks-vision"],
  },
});
