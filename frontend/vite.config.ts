import fs from "node:fs";
import path from "node:path";
import { defineConfig, Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";

/**
 * Solo sviluppo: con GRILLO_DEMO_LIBRARY=<cartella libreria> l'interfaccia si apre anche in un browser
 * normale (senza Electron), leggendo i libri veri da quella cartella. Serve per le anteprime.
 */
function demoLibrary(): Plugin | null {
  const library = process.env.GRILLO_DEMO_LIBRARY;
  if (!library) return null;
  const voices = path.resolve(__dirname, "../backend/voices");
  const books = path.join(library, "books");

  return {
    name: "grillo-demo-library",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = decodeURIComponent((req.url ?? "").split("?")[0]);
        if (url === "/__demo/books.json") {
          const list = fs.existsSync(books)
            ? fs.readdirSync(books).flatMap((id) => {
                const file = path.join(books, id, "book.json");
                return fs.existsSync(file) ? [JSON.parse(fs.readFileSync(file, "utf8"))] : [];
              })
            : [];
          const voiceList = JSON.parse(fs.readFileSync(path.join(voices, "voices.json"), "utf8"));
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ books: list, voices: voiceList, library }));
          return;
        }
        const match = /^\/__demo\/(library|voices)\/(.+)$/.exec(url);
        if (!match) return next();
        const root = match[1] === "voices" ? voices : books;
        const file = path.resolve(root, match[2]);
        if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) {
          res.statusCode = 404;
          res.end();
          return;
        }
        const type = file.endsWith(".mp3") ? "audio/mpeg" : file.endsWith(".png") ? "image/png" : "image/jpeg";
        res.setHeader("Content-Type", type);
        fs.createReadStream(file).pipe(res);
      });
    }
  };
}

export default defineConfig({
  root: path.resolve(__dirname),
  plugins: [react(), demoLibrary()],
  define: { __DEMO_MODE__: JSON.stringify(Boolean(process.env.GRILLO_DEMO_LIBRARY)) },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@shared": path.resolve(__dirname, "../shared")
    }
  },
  build: {
    outDir: path.resolve(__dirname, "../dist"),
    emptyOutDir: true
  },
  server: {
    host: process.env.GRILLO_DEMO_LIBRARY ? "0.0.0.0" : "127.0.0.1",
    port: 5173,
    strictPort: true
  }
});
