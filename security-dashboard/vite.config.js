import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],

  server: {
    port: 5174,
  },

  preview: {
    port: 5174,
  },

  test: {
    environment: "jsdom",
    setupFiles: "./src/test/setup.js",
  },
})