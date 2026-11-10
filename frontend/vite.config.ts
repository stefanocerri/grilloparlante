import fs from "node:fs";
import path from "node:path";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";

/**
 * `import data from "./file.glb?base64"`: il file finisce dentro il bundle come stringa base64.
 * Serve al modello 3D: l'app impacchettata gira da file://, dove fetch di un file non funziona.
 */
function base64Files(): Plugin {
  return {
    name: "base64-files",
    enforce: "pre",
    load(id) {
      if (!id.endsWith("?base64")) return null;
      const file = id.slice(0, -"?base64".length);
      this.addWatchFile(file);
      return `export default ${JSON.stringify(fs.readFileSync(file).toString("base64"))};`;
    }
  };
}

export default defineConfig({
  root: path.resolve(__dirname),
  // Percorsi relativi: l'app impacchettata carica index.html da disco (file://).
  base: "./",
  plugins: [react(), base64Files()],
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
