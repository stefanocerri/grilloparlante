import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";

// GRILLO_TURSO_PROXY (solo sviluppo): inoltra /turso a un database di prova sullo stesso indirizzo dell'app.
const tursoProxy = process.env.GRILLO_TURSO_PROXY;

export default defineConfig({
  root: path.resolve(__dirname),
  plugins: [react()],
  define: { __TURSO_PROXY__: JSON.stringify(Boolean(tursoProxy)) },
  resolve: {
    alias: { "@shared": path.resolve(__dirname, "../shared") }
  },
  build: {
    outDir: path.resolve(__dirname, "../dist-pwa"),
    emptyOutDir: true
  },
  server: {
    host: "0.0.0.0",
    port: 5174,
    proxy: tursoProxy
      ? { "/turso": { target: tursoProxy, changeOrigin: true, rewrite: (url) => url.replace(/^\/turso/, "") } }
      : undefined
  }
});
