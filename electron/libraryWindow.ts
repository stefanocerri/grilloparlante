import { app, BrowserWindow, shell } from "electron";
import path from "node:path";
import { popoverBackground } from "./popover";

/** Finestra "Libreria": archivio dei libri sul Mac, lettura del testo e ascolto (più comoda del pannello). */
let win: BrowserWindow | null = null;

export function libraryWindow() {
  return win && !win.isDestroyed() ? win : null;
}

export function openLibraryWindow(bookId?: string) {
  const existing = libraryWindow();
  if (existing) {
    if (bookId) existing.webContents.send("library:show", bookId);
    existing.show();
    existing.focus();
    return;
  }

  win = new BrowserWindow({
    width: 1120,
    height: 760,
    minWidth: 780,
    minHeight: 520,
    title: "Libreria · Grillo parlante",
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 14, y: 16 },
    backgroundColor: popoverBackground(),
    show: false,
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true }
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  win.once("ready-to-show", () => win?.show());
  win.on("closed", () => {
    win = null;
  });

  const hash = `library${bookId ? `=${encodeURIComponent(bookId)}` : ""}`;
  if (app.isPackaged) void win.loadFile(path.join(app.getAppPath(), "dist", "index.html"), { hash });
  else void win.loadURL(`${process.env.GRILLO_RENDERER_URL || "http://127.0.0.1:5173"}/#${hash}`);
}
