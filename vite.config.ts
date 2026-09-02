import { defineConfig } from "vite";
import { matchPlugin } from "./server/matchPlugin";

export default defineConfig({
  appType: "spa",
  plugins: [matchPlugin()],
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
    include: ["mqtt"],
    exclude: ["@mediapipe/tasks-vision"],
  },
});
