import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import type { OpenDialogOptions } from "electron";
import fs from "node:fs";
import path from "node:path";
import { PythonJobBridge } from "./backendBridge";
import { ManagedRuntimeManager } from "./runtimeManager";
import type {
  ConversionSettings,
  InputFileMeta,
  JobEvent,
  RuntimeEvent
} from "../shared/contracts";

let mainWindow: BrowserWindow | null = null;
const bridge = new PythonJobBridge();
const runtimeManager = new ManagedRuntimeManager(emitRuntimeToRenderer);
const hasSingleInstanceLock = app.requestSingleInstanceLock();

function sanitizeImportedFileName(name: string) {
  const base = path.basename(name);
  return base.replace(/[^a-zA-Z0-9._-]+/g, "-");
}

function detectFileType(filePath: string): InputFileMeta["type"] {
  const extension = path.extname(filePath).toLowerCase();

  if (extension === ".pdf") {
    return "pdf";
  }

  if (extension === ".epub") {
    return "epub";
  }

  if (extension === ".txt" || extension === ".md") {
    return "txt";
  }

  return "unknown";
}

function emitToRenderer(event: JobEvent) {
  mainWindow?.webContents.send("job:event", event);
}

function emitRuntimeToRenderer(event: RuntimeEvent) {
  mainWindow?.webContents.send("runtime:event", event);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1460,
    height: 980,
    minWidth: 1180,
    minHeight: 860,
    backgroundColor: "#111111",
    titleBarStyle: "hiddenInset",
    roundedCorners: false,
    trafficLightPosition: {
      x: 16,
      y: 16
    },
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true
    }
  });

  if (app.isPackaged) {
    mainWindow.loadFile(path.join(app.getAppPath(), "dist", "index.html"));
  } else {
    mainWindow.loadURL("http://127.0.0.1:5173");

    mainWindow.webContents.on("context-menu", (_event, params) => {
      mainWindow?.webContents.inspectElement(params.x, params.y);

      if (!mainWindow?.webContents.isDevToolsOpened()) {
        mainWindow?.webContents.openDevTools({ mode: "detach" });
      }
    });

    mainWindow.webContents.on("before-input-event", (event, input) => {
      const openInspector =
        input.type === "keyDown" &&
        input.key.toLowerCase() === "i" &&
        input.meta &&
        input.alt;

      if (!openInspector) {
        return;
      }

      event.preventDefault();

      if (!mainWindow?.webContents.isDevToolsOpened()) {
        mainWindow?.webContents.openDevTools({ mode: "detach" });
      } else {
        mainWindow?.webContents.focus();
      }
    });
  }

  mainWindow.on("closed", () => {
    bridge.dispose();
    runtimeManager.dispose();
    mainWindow = null;
  });
}

if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow) {
      return;
    }

    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }

    mainWindow.focus();
  });

  app.whenReady().then(() => {
    createWindow();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  });
}

app.on("window-all-closed", () => {
  bridge.dispose();
  runtimeManager.dispose();
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  bridge.dispose();
  runtimeManager.dispose();
});

ipcMain.handle("dialog:select-file", async () => {
  console.log("[grillo] dialog:select-file invoked");
  const window =
    BrowserWindow.getFocusedWindow() ??
    (mainWindow && !mainWindow.isDestroyed() ? mainWindow : undefined);
  const options: OpenDialogOptions = {
    properties: ["openFile"],
    filters: [
      { name: "Supported files", extensions: ["pdf", "epub", "txt", "md"] },
      { name: "PDF", extensions: ["pdf"] },
      { name: "EPUB", extensions: ["epub"] },
      { name: "Text", extensions: ["txt", "md"] }
    ]
  };

  if (window) {
    if (window.isMinimized()) {
      window.restore();
    }

    window.focus();
  }

  let response;

  try {
    response = window
      ? await dialog.showOpenDialog(window, options)
      : await dialog.showOpenDialog(options);
  } catch (error) {
    response = await dialog.showOpenDialog(options);

    if (!response.canceled) {
      console.warn("Dialogo file aperto con fallback senza parent window.", error);
    }
  }

  if (response.canceled || response.filePaths.length === 0) {
    return null;
  }

  const filePath = response.filePaths[0];
  const stats = fs.statSync(filePath);
  console.log("[grillo] dialog:select-file picked", { filePath, size: stats.size });

  return {
    name: path.basename(filePath),
    path: filePath,
    type: detectFileType(filePath),
    size: stats.size
  } satisfies InputFileMeta;
});

ipcMain.handle("dialog:select-reference-file", async () => {
  const window =
    BrowserWindow.getFocusedWindow() ??
    (mainWindow && !mainWindow.isDestroyed() ? mainWindow : undefined);
  const options: OpenDialogOptions = {
    properties: ["openFile"],
    filters: [
      { name: "Audio reference", extensions: ["wav", "mp3", "m4a", "aiff", "aif", "flac", "ogg"] },
      { name: "WAV", extensions: ["wav"] },
      { name: "MP3", extensions: ["mp3"] },
      { name: "M4A", extensions: ["m4a"] },
      { name: "AIFF", extensions: ["aiff", "aif"] }
    ]
  };

  if (window) {
    if (window.isMinimized()) {
      window.restore();
    }

    window.focus();
  }

  let response;

  try {
    response = window
      ? await dialog.showOpenDialog(window, options)
      : await dialog.showOpenDialog(options);
  } catch {
    response = await dialog.showOpenDialog(options);
  }

  if (response.canceled || response.filePaths.length === 0) {
    return null;
  }

  return response.filePaths[0];
});

ipcMain.handle(
  "file:cache-import",
  async (_event, payload: { name: string; bytes: number[] }) => {
    const tempDir = path.join(app.getPath("temp"), "grillo-imports");
    fs.mkdirSync(tempDir, { recursive: true });

    const safeName = sanitizeImportedFileName(payload.name);
    const tempPath = path.join(tempDir, `${Date.now()}-${safeName}`);
    const buffer = Buffer.from(payload.bytes);
    fs.writeFileSync(tempPath, buffer);

    console.log("[grillo] file:cache-import stored temp file", {
      originalName: payload.name,
      tempPath,
      size: buffer.byteLength
    });

    return {
      name: safeName,
      path: tempPath,
      type: detectFileType(tempPath),
      size: buffer.byteLength
    } satisfies InputFileMeta;
  }
);

ipcMain.handle(
  "job:start",
  async (_event, payload: { file: InputFileMeta; settings: ConversionSettings }) => {
    const engine = payload.settings?.tts?.engine;
    const launchContext = await runtimeManager.buildLaunchContext({ engine });
    const requiresManagedRuntime = engine === "qwen";

    if (requiresManagedRuntime && launchContext.runtimeStatus.conversionBlocked) {
      throw new Error(
        launchContext.runtimeStatus.detail ??
          launchContext.runtimeStatus.message ??
          "Il runtime voce non e pronto."
      );
    }

    bridge.start(payload.file, payload.settings, emitToRenderer, {
      pythonCommand: launchContext.pythonCommand,
      env: launchContext.env
    });
    return { ok: true };
  }
);

ipcMain.handle("job:cancel", async () => {
  bridge.cancel(emitToRenderer);
  return { ok: true };
});

ipcMain.handle("shell:open-path", async (_event, targetPath: string) => {
  await shell.openPath(targetPath);
});

ipcMain.handle("runtime:status", async () => {
  return runtimeManager.getStatus(true);
});

ipcMain.handle("runtime:install", async () => {
  return runtimeManager.install("install");
});

ipcMain.handle("runtime:repair", async () => {
  return runtimeManager.install("repair");
});

ipcMain.handle("runtime:remove", async () => {
  return runtimeManager.remove();
});

ipcMain.handle("window:minimize", async () => {
  const window = BrowserWindow.getFocusedWindow() ?? mainWindow;
  window?.minimize();
});

ipcMain.handle("window:toggle-fullscreen", async () => {
  const window = BrowserWindow.getFocusedWindow() ?? mainWindow;

  if (!window) {
    return;
  }

  window.setFullScreen(!window.isFullScreen());
});

ipcMain.handle("window:close", async () => {
  const window = BrowserWindow.getFocusedWindow() ?? mainWindow;
  window?.close();
});

ipcMain.handle("devtools:open", async () => {
  if (app.isPackaged) {
    return;
  }

  const window = BrowserWindow.getFocusedWindow() ?? mainWindow;

  if (!window) {
    return;
  }

  const { width, height } = window.getContentBounds();
  const x = Math.max(0, Math.floor(width / 2));
  const y = Math.max(0, Math.floor(height / 2));
  const { webContents } = window;

  // Come il click destro → Ispeziona: attiva il pannello Elementi su un nodo reale.
  webContents.inspectElement(x, y);

  if (!webContents.isDevToolsOpened()) {
    webContents.openDevTools({ mode: "detach" });
  } else {
    webContents.devToolsWebContents?.focus();
  }
});
