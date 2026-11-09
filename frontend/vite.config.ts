import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";

export default defineConfig({
  root: path.resolve(__dirname),
  // Percorsi relativi: l'app impacchettata carica index.html da disco (file://).
  base: "./",
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@shared": path.resolve(__dirname, "../shared"),
      // File dei font Geist: il pacchetto npm non li esporta, li prendiamo dalla cartella.
      "@geist-fonts": path.resolve(__dirname, "../node_modules/geist/dist/fonts")
    }
  },
  build: {
    outDir: path.resolve(__dirname, "../dist"),
    emptyOutDir: true
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true
  }
});
