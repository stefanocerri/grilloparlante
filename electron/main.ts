import { app, BrowserWindow, dialog, ipcMain, protocol, shell } from "electron";
import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import type { AppSnapshot, ImportRequest, VoiceInfo } from "../shared/contracts";
import { bookDir, deleteBook, listBooks, toView } from "./library";
import { backendRoot, libraryDir, readJson } from "./paths";
import { ConversionQueue } from "./queue";
import { RuntimeManager } from "./runtime";

protocol.registerSchemesAsPrivileged([
  { scheme: "grillo", privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }
]);

let mainWindow: BrowserWindow | null = null;
let broadcastTimer: NodeJS.Timeout | null = null;

const runtime = new RuntimeManager(broadcast);
const queue = new ConversionQueue({
  python: () => runtime.python,
  onChange: broadcast,
  onBookChanged: broadcast,
  log: (line) => {
    if (line.trim()) console.log(`[backend] ${line}`);
  }
});

function voices(): VoiceInfo[] {
  const entries = readJson<Omit<VoiceInfo, "previewUrl">[]>(path.join(backendRoot(), "voices", "voices.json"), []);
  return entries.map((voice) => ({
    ...voice,
    previewUrl: fs.existsSync(path.join(backendRoot(), "voices", `${voice.id}.preview.mp3`))
      ? `grillo://voices/${voice.id}.preview.mp3`
      : undefined
  }));
}

function snapshot(): AppSnapshot {
  return {
    runtime: runtime.status,
    voices: voices(),
    books: listBooks().map((book) =>
      toView(book, {
        queued: queue.queuedChapters(book.id),
        running: queue.runningChapters(book.id)
      })
    ),
    queue: queue.state(),
    libraryDir: libraryDir()
  };
}

function broadcast() {
  if (broadcastTimer) return;
  broadcastTimer = setTimeout(() => {
    broadcastTimer = null;
    mainWindow?.webContents.send("app:snapshot", snapshot());
  }, 120);
}

/** grillo://library/<bookId>/<file> e grillo://voices/<file>, con supporto Range per l'audio. */
function serveFile(request: Request): Response {
  const url = new URL(request.url);
  const parts = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
  const root = url.host === "voices" ? path.join(backendRoot(), "voices") : path.join(libraryDir(), "books");
  const file = path.resolve(root, ...parts);
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    return new Response("Non trovato", { status: 404 });
  }

  const size = fs.statSync(file).size;
  const ext = path.extname(file).toLowerCase();
  const type =
    ext === ".mp3" ? "audio/mpeg" : ext === ".png" ? "image/png" : ext === ".wav" ? "audio/wav" : "image/jpeg";
  const range = /bytes=(\d*)-(\d*)/.exec(request.headers.get("range") ?? "");

  if (range) {
    const start = range[1] ? Number(range[1]) : 0;
    const end = range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
    const stream = Readable.toWeb(fs.createReadStream(file, { start, end })) as ReadableStream;
    return new Response(stream, {
      status: 206,
      headers: {
        "Content-Type": type,
        "Content-Length": String(end - start + 1),
        "Content-Range": `bytes ${start}-${end}/${size}`,
        "Accept-Ranges": "bytes"
      }
    });
  }

  const stream = Readable.toWeb(fs.createReadStream(file)) as ReadableStream;
  return new Response(stream, {
    headers: { "Content-Type": type, "Content-Length": String(size), "Accept-Ranges": "bytes" }
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1240,
    height: 840,
    minWidth: 980,
    minHeight: 680,
    backgroundColor: "#f4f1eb",
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 18, y: 18 },
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true }
  });

  if (app.isPackaged) {
    void mainWindow.loadFile(path.join(app.getAppPath(), "dist", "index.html"));
  } else {
    void mainWindow.loadURL(process.env.GRILLO_RENDERER_URL || "http://127.0.0.1:5173");
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => mainWindow?.focus());
  app.whenReady().then(() => {
    protocol.handle("grillo", serveFile);
    createWindow();
    void runtime.refresh();
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => queue.dispose());

// --- IPC ---------------------------------------------------------------------

ipcMain.handle("app:snapshot", () => snapshot());

ipcMain.handle("runtime:install", () => runtime.install());

ipcMain.handle("dialog:pick-book", async () => {
  const window = BrowserWindow.getFocusedWindow() ?? mainWindow ?? undefined;
  const options = {
    properties: ["openFile" as const],
    filters: [{ name: "Libri", extensions: ["pdf", "epub", "txt"] }]
  };
  const result = window ? await dialog.showOpenDialog(window, options) : await dialog.showOpenDialog(options);
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle("book:import", (_event, request: ImportRequest) => queue.importBook(request));

ipcMain.handle("book:convert", (_event, bookId: string, chapters: number[]) => queue.enqueue(bookId, chapters));

ipcMain.handle("queue:cancel", () => queue.cancelAll());

ipcMain.handle("book:reveal", (_event, bookId: string) => shell.openPath(bookDir(bookId)));

ipcMain.handle("book:delete", (_event, bookId: string) => {
  queue.dequeueBook(bookId);
  deleteBook(bookId);
  broadcast();
});
