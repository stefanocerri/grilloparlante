import { contextBridge, ipcRenderer, webUtils } from "electron";
import type { AppSnapshot, ImportRequest, TursoSettings } from "../shared/contracts";

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
  syncTurso: () => ipcRenderer.invoke("turso:sync") as Promise<void>
};

export type GrilloApi = typeof api;

contextBridge.exposeInMainWorld("grillo", api);
