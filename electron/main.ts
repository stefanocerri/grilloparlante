import { app, dialog, ipcMain, protocol, shell } from "electron";
import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import QRCode from "qrcode";
import type { AppSnapshot, ImportRequest, TursoSettings, VoiceInfo } from "../shared/contracts";
import { bookDir, deleteBook, listBooks, readBook, toView } from "./library";
import { backendRoot, libraryDir, readJson, userDataFile, writeJson } from "./paths";
import { getPopover, hidePopover, withPopoverPinned } from "./popover";
import { ConversionQueue } from "./queue";
import { RuntimeManager } from "./runtime";
import { TursoSync } from "./sync";
import { createTray, updateTray } from "./tray";

protocol.registerSchemesAsPrivileged([
  { scheme: "grillo", privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }
]);

const SUPPORTED = new Set([".pdf", ".epub", ".txt", ".md", ".json"]);
const SYNC_EVERY_MS = 60 * 60 * 1000;
const settingsFile = () => userDataFile("settings.json");
const DEFAULT_PWA_URL = "https://grilloparlante.vercel.app";

function loadTurso(): TursoSettings {
  const stored = readJson<{ turso?: Partial<TursoSettings> }>(settingsFile(), {}).turso ?? {};
  return {
    url: stored.url ?? "",
    writeToken: stored.writeToken ?? "",
    readToken: stored.readToken ?? "",
    pwaUrl: stored.pwaUrl || DEFAULT_PWA_URL
  };
}

let turso = loadTurso();
let broadcastTimer: NodeJS.Timeout | null = null;

const runtime = new RuntimeManager(broadcast);
const sync = new TursoSync(() => turso, broadcast);
const queue = new ConversionQueue({
  python: () => runtime.python,
  onChange: broadcast,
  onBookChanged: (bookId) => {
    broadcast();
    sync.syncBook(bookId);
  },
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
        uploaded: sync.uploadedChapters(book.id),
        queued: queue.queuedChapters(book.id),
        running: queue.runningChapters(book.id)
      })
    ),
    queue: queue.state(),
    turso,
    sync: sync.status,
    libraryDir: libraryDir()
  };
}

function broadcast() {
  if (broadcastTimer) return;
  broadcastTimer = setTimeout(() => {
    broadcastTimer = null;
    const current = snapshot();
    updateTray(current);
    const popover = getPopover();
    if (!popover.isDestroyed()) popover.webContents.send("app:snapshot", current);
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

function sendDroppedFile(files: string[]) {
  const file = files.find((item) => SUPPORTED.has(path.extname(item).toLowerCase()));
  if (!file) return;
  const popover = getPopover();
  const send = () => popover.webContents.send("file:dropped", file);
  if (popover.webContents.isLoading()) popover.webContents.once("did-finish-load", send);
  else send();
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.whenReady().then(() => {
    // App da barra dei menu: niente icona nel Dock (vedi anche LSUIElement nel package.json).
    if (process.platform === "darwin") app.dock?.hide();
    protocol.handle("grillo", serveFile);
    getPopover();
    createTray({ onFilesDropped: sendDroppedFile, onQuit: () => app.quit() });
    void runtime.refresh();
    sync.syncAll();
    setInterval(() => sync.syncAll(), SYNC_EVERY_MS);
    broadcast();
  });
}

// Chiudere il pannello non chiude l'app: resta nella barra dei menu.
app.on("window-all-closed", () => undefined);

app.on("before-quit", () => queue.dispose());

// --- IPC ---------------------------------------------------------------------

ipcMain.handle("app:snapshot", () => snapshot());

ipcMain.handle("app:hide", () => hidePopover());

ipcMain.handle("app:quit", () => app.quit());

ipcMain.handle("runtime:install", () => runtime.install());

ipcMain.handle("dialog:pick-book", () =>
  withPopoverPinned(async () => {
    const result = await dialog.showOpenDialog({
      properties: ["openFile"],
      filters: [{ name: "Libri e articoli", extensions: ["pdf", "epub", "txt", "md", "json"] }]
    });
    return result.canceled ? null : result.filePaths[0];
  })
);

ipcMain.handle("dialog:confirm", (_event, message: string, detail?: string) =>
  withPopoverPinned(async () => {
    const result = await dialog.showMessageBox({
      type: "warning",
      buttons: ["Elimina", "Annulla"],
      defaultId: 1,
      cancelId: 1,
      message,
      detail
    });
    return result.response === 0;
  })
);

ipcMain.handle("book:import", async (_event, request: ImportRequest) => {
  const bookId = await queue.importBook(request);
  if (request.convertAll) {
    const book = readBook(bookId);
    const pending = (book?.chapters ?? []).filter((chapter) => chapter.status !== "ready").map((chapter) => chapter.index);
    queue.enqueue(bookId, pending);
  }
  return bookId;
});

ipcMain.handle("book:convert", (_event, bookId: string, chapters: number[]) => queue.enqueue(bookId, chapters));

ipcMain.handle("queue:cancel", () => queue.cancelAll());

ipcMain.handle("book:reveal", (_event, bookId: string) => shell.openPath(bookDir(bookId)));

ipcMain.handle("library:reveal", () => shell.openPath(libraryDir()));

ipcMain.handle("book:delete", async (_event, bookId: string) => {
  queue.dequeueBook(bookId);
  deleteBook(bookId);
  broadcast();
  await sync.deleteBook(bookId).catch(() => undefined);
});

ipcMain.handle("turso:save", (_event, next: TursoSettings) => {
  const clean = {
    url: next.url.trim(),
    writeToken: next.writeToken.trim(),
    readToken: next.readToken.trim(),
    pwaUrl: next.pwaUrl?.trim() || DEFAULT_PWA_URL
  };
  const changedTarget = clean.url !== turso.url || clean.writeToken !== turso.writeToken;
  turso = clean;
  const stored = readJson<Record<string, unknown>>(settingsFile(), {});
  writeJson(settingsFile(), { ...stored, turso });
  if (changedTarget) sync.reset();
  broadcast();
});

ipcMain.handle("turso:test", () => sync.testConnection());

ipcMain.handle("turso:sync", () => sync.syncAll());

/** QR per collegare la PWA: indirizzo e chiave di sola lettura viaggiano nel frammento #, mai al server. */
ipcMain.handle("turso:qr", async () => {
  if (!turso.url || !turso.readToken) return null;
  const params = new URLSearchParams({ db: turso.url, token: turso.readToken });
  const link = `${turso.pwaUrl.replace(/\/+$/, "")}/#setup?${params.toString()}`;
  return { link, image: await QRCode.toDataURL(link, { margin: 1, width: 280 }) };
});
