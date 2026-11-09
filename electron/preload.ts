import { contextBridge, ipcRenderer, webUtils } from "electron";
import type { AppQr, AppSnapshot, ThemeChoice, ImportRequest, SystemCheck, TursoSettings, TursoSetupOutcome } from "../shared/contracts";

function subscribe<T>(channel: string, listener: (payload: T) => void) {
  const wrapped = (_event: unknown, payload: T) => listener(payload);
  ipcRenderer.on(channel, wrapped);
  return () => {
    ipcRenderer.removeListener(channel, wrapped);
  };
}

const api = {
  snapshot: () => ipcRenderer.invoke("app:snapshot") as Promise<AppSnapshot>,
  onSnapshot: (listener: (snapshot: AppSnapshot) => void) => subscribe("app:snapshot", listener),
  /** File trascinato sull'icona nella barra dei menu. */
  onFileDropped: (listener: (filePath: string) => void) => subscribe("file:dropped", listener),
  hide: () => ipcRenderer.invoke("app:hide") as Promise<void>,
  quit: () => ipcRenderer.invoke("app:quit") as Promise<void>,
  installRuntime: () => ipcRenderer.invoke("runtime:install") as Promise<void>,
  refreshRuntime: () => ipcRenderer.invoke("runtime:refresh") as Promise<void>,
  checkSystem: () => ipcRenderer.invoke("system:check") as Promise<SystemCheck>,
  finishOnboarding: () => ipcRenderer.invoke("onboarding:finish") as Promise<void>,
  setTheme: (theme: ThemeChoice) => ipcRenderer.invoke("theme:set", theme) as Promise<void>,
  restartOnboarding: () => ipcRenderer.invoke("onboarding:restart") as Promise<void>,
  openTerminal: () => ipcRenderer.invoke("app:open-terminal") as Promise<string>,
  copy: (text: string) => ipcRenderer.invoke("clipboard:write", text) as Promise<void>,
  pickBook: () => ipcRenderer.invoke("dialog:pick-book") as Promise<string | null>,
  confirm: (message: string, detail?: string) => ipcRenderer.invoke("dialog:confirm", message, detail) as Promise<boolean>,
  pathForFile: (file: File) => webUtils.getPathForFile(file),
  importBook: (request: ImportRequest) => ipcRenderer.invoke("book:import", request) as Promise<string>,
  convert: (bookId: string, chapters: number[]) => ipcRenderer.invoke("book:convert", bookId, chapters) as Promise<void>,
  cancelQueue: () => ipcRenderer.invoke("queue:cancel") as Promise<void>,
  revealBook: (bookId: string) => ipcRenderer.invoke("book:reveal", bookId) as Promise<void>,
  revealLibrary: () => ipcRenderer.invoke("library:reveal") as Promise<void>,
  deleteBook: (bookId: string) => ipcRenderer.invoke("book:delete", bookId) as Promise<void>,
  saveTurso: (settings: TursoSettings) => ipcRenderer.invoke("turso:save", settings) as Promise<void>,
  testTurso: () => ipcRenderer.invoke("turso:test") as Promise<string>,
  syncTurso: () => ipcRenderer.invoke("turso:sync") as Promise<void>,
  /** Il Platform API token passa solo da qui al processo principale: non viene salvato. */
  setupTurso: (platformToken: string, org?: string) =>
    ipcRenderer.invoke("turso:setup", platformToken, org) as Promise<TursoSetupOutcome>,
  tursoQr: () => ipcRenderer.invoke("turso:qr") as Promise<AppQr[]>
};

export type GrilloApi = typeof api;

contextBridge.exposeInMainWorld("grillo", api);
