import { contextBridge, ipcRenderer, webUtils } from "electron";
import type { AppSnapshot, ImportRequest, TursoSettings } from "../shared/contracts";

const api = {
  snapshot: () => ipcRenderer.invoke("app:snapshot") as Promise<AppSnapshot>,
  onSnapshot: (listener: (snapshot: AppSnapshot) => void) => {
    const wrapped = (_event: unknown, payload: AppSnapshot) => listener(payload);
    ipcRenderer.on("app:snapshot", wrapped);
    return () => ipcRenderer.removeListener("app:snapshot", wrapped);
  },
  installRuntime: () => ipcRenderer.invoke("runtime:install") as Promise<void>,
  pickBook: () => ipcRenderer.invoke("dialog:pick-book") as Promise<string | null>,
  pathForFile: (file: File) => webUtils.getPathForFile(file),
  importBook: (request: ImportRequest) => ipcRenderer.invoke("book:import", request) as Promise<string>,
  convert: (bookId: string, chapters: number[]) => ipcRenderer.invoke("book:convert", bookId, chapters) as Promise<void>,
  cancelQueue: () => ipcRenderer.invoke("queue:cancel") as Promise<void>,
  revealBook: (bookId: string) => ipcRenderer.invoke("book:reveal", bookId) as Promise<void>,
  deleteBook: (bookId: string) => ipcRenderer.invoke("book:delete", bookId) as Promise<void>,
  saveTurso: (settings: TursoSettings) => ipcRenderer.invoke("turso:save", settings) as Promise<void>,
  testTurso: () => ipcRenderer.invoke("turso:test") as Promise<string>,
  syncTurso: () => ipcRenderer.invoke("turso:sync") as Promise<void>,
  tursoQr: () => ipcRenderer.invoke("turso:qr") as Promise<{ link: string; image: string } | null>
};

export type GrilloApi = typeof api;

contextBridge.exposeInMainWorld("grillo", api);
