import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        // Docker Compose resolves service names on its internal network.
        target: "http://backend:8000",
        changeOrigin: true,
      },
    },
  },
});
