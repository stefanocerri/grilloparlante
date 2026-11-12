import { app, BrowserWindow, nativeTheme, screen, shell } from "electron";
import path from "node:path";

/** Pannello che si apre sotto l'icona nella barra dei menu (come Sniffa). */
export const POPOVER_WIDTH = 380;
export const POPOVER_HEIGHT = 600;

let popover: BrowserWindow | null = null;

/** Stesso colore di sfondo dell'interfaccia (tema chiaro o scuro del Mac), per non vedere lampi all'apertura. */
export function popoverBackground() {
  return nativeTheme.shouldUseDarkColors ? "#0a0a0a" : "#ebebeb";
}
let hideTimer: NodeJS.Timeout | null = null;
/** Mentre e aperto un dialogo (scelta file, conferma) il pannello non deve chiudersi. */
let keepOpen = 0;

function cancelHide() {
  if (hideTimer) clearTimeout(hideTimer);
  hideTimer = null;
}

export function getPopover(): BrowserWindow {
  if (popover && !popover.isDestroyed()) return popover;

  popover = new BrowserWindow({
    width: POPOVER_WIDTH,
    height: POPOVER_HEIGHT,
    show: false,
    frame: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    roundedCorners: true,
    backgroundColor: popoverBackground(),
    ...(process.platform === "darwin" ? { type: "panel" as const } : {}),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      // Il saluto del Grillo alla prima apertura parte da solo, senza aspettare un clic.
      autoplayPolicy: "no-user-gesture-required"
    }
  });
  popover.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  // Link esterni (es. l'articolo originale) nel browser, non in una finestra dell'app.
  popover.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url);
    return { action: "deny" };
  });

  if (app.isPackaged) {
    void popover.loadFile(path.join(app.getAppPath(), "dist", "index.html"));
  } else {
    void popover.loadURL(process.env.GRILLO_RENDERER_URL || "http://127.0.0.1:5173");
  }

  popover.on("focus", cancelHide);
  popover.on("blur", () => {
    if (keepOpen > 0 || popover?.webContents.isDevToolsOpened()) return;
    cancelHide();
    // Piccolo ritardo: un clic sull'icona della barra non deve chiudere e riaprire subito.
    hideTimer = setTimeout(() => {
      hideTimer = null;
      if (popover && !popover.isDestroyed() && !popover.isFocused()) popover.hide();
    }, 250);
  });
  popover.on("closed", () => {
    popover = null;
  });

  return popover;
}

/** Posiziona il pannello centrato sotto l'icona, dentro lo schermo. */
export function showPopover(trayBounds?: Electron.Rectangle) {
  const win = getPopover();
  if (trayBounds && (trayBounds.width || trayBounds.height)) {
    const { width, height } = win.getBounds();
    const display = screen.getDisplayNearestPoint({ x: trayBounds.x, y: trayBounds.y });
    const area = display.workArea;
    const margin = 6;
    let x = Math.round(trayBounds.x + trayBounds.width / 2 - width / 2);
    let y = Math.round(trayBounds.y + trayBounds.height + 4);
    x = Math.min(Math.max(x, area.x + margin), area.x + area.width - width - margin);
    if (y + height > area.y + area.height - margin) y = Math.round(trayBounds.y - height - 4);
    win.setPosition(x, Math.max(y, area.y + margin), false);
  }
  win.show();
  win.focus();
}

export function hidePopover() {
  cancelHide();
  if (popover && !popover.isDestroyed()) popover.hide();
}

export function popoverVisible() {
  return Boolean(popover && !popover.isDestroyed() && popover.isVisible());
}

/**
 * Esegue un'azione con un dialogo di sistema (scelta file, conferma) e poi riapre il pannello.
 * Il pannello sta sempre in primo piano: durante il dialogo si toglie di mezzo, altrimenti il dialogo si apre sotto
 * e non si riesce a cliccarlo. L'app va portata davanti, perché un'app della barra dei menu spesso non è attiva.
 */
export async function withPopoverPinned<T>(action: () => Promise<T>): Promise<T> {
  keepOpen += 1;
  const win = popover && !popover.isDestroyed() ? popover : null;
  if (win) {
    win.setAlwaysOnTop(false);
    win.hide();
  }
  if (process.platform === "darwin") app.focus({ steal: true });
  try {
    return await action();
  } finally {
    keepOpen -= 1;
    if (popover && !popover.isDestroyed()) {
      popover.setAlwaysOnTop(true);
      popover.show();
      popover.focus();
    }
  }
}
