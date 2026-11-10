import { contextBridge, ipcRenderer, webUtils } from "electron";
import type { AppQr, AppSnapshot, ThemeChoice, VoiceCreateRequest, ImportRequest, SystemCheck, TursoSetupOutcome } from "../shared/contracts";

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
  pickVoiceSample: () => ipcRenderer.invoke("voice:pick-sample") as Promise<string | null>,
  createVoice: (request: VoiceCreateRequest) => ipcRenderer.invoke("voice:create", request) as Promise<string>,
  cancelVoice: () => ipcRenderer.invoke("voice:cancel") as Promise<void>,
  dismissVoiceJob: () => ipcRenderer.invoke("voice:dismiss") as Promise<void>,
  deleteVoice: (voiceId: string) => ipcRenderer.invoke("voice:delete", voiceId) as Promise<void>,
  importBook: (request: ImportRequest) => ipcRenderer.invoke("book:import", request) as Promise<string>,
  convert: (bookId: string, chapters: number[]) => ipcRenderer.invoke("book:convert", bookId, chapters) as Promise<void>,
  cancelQueue: () => ipcRenderer.invoke("queue:cancel") as Promise<void>,
  revealBook: (bookId: string) => ipcRenderer.invoke("book:reveal", bookId) as Promise<void>,
  /** Apre la finestra Libreria (archivio, lettura e ascolto), facoltativamente su un libro. */
  openLibrary: (bookId?: string) => ipcRenderer.invoke("library:open", bookId) as Promise<void>,
  onLibraryShow: (listener: (bookId: string) => void) => subscribe("library:show", listener),
  revealLibrary: () => ipcRenderer.invoke("library:reveal") as Promise<void>,
  deleteBook: (bookId: string) => ipcRenderer.invoke("book:delete", bookId) as Promise<void>,
  setTargets: (bookId: string, targets: string[]) => ipcRenderer.invoke("book:targets", bookId, targets) as Promise<void>,
  addChannel: (name: string, appUrl: string) => ipcRenderer.invoke("channel:add", name, appUrl) as Promise<string>,
  updateChannel: (id: string, patch: { name?: string; appUrl?: string }) =>
    ipcRenderer.invoke("channel:update", id, patch) as Promise<void>,
  removeChannel: (id: string) => ipcRenderer.invoke("channel:remove", id) as Promise<void>,
  hasPlatformToken: () => ipcRenderer.invoke("channel:has-token") as Promise<boolean>,
  /** Il Platform API token passa solo da qui al processo principale: resta in memoria, mai su disco. */
  connectChannels: (ids: string[], platformToken?: string, org?: string) =>
    ipcRenderer.invoke("channel:connect", ids, platformToken, org) as Promise<TursoSetupOutcome>,
  connectManual: (id: string, db: { url: string; token: string; appToken?: string }) =>
    ipcRenderer.invoke("channel:manual", id, db) as Promise<string>,
  testChannel: (id: string) => ipcRenderer.invoke("channel:test", id) as Promise<string>,
  syncChannels: () => ipcRenderer.invoke("channel:sync") as Promise<void>,
  channelQrs: () => ipcRenderer.invoke("channel:qr") as Promise<AppQr[]>
};

export type GrilloApi = typeof api;

contextBridge.exposeInMainWorld("grillo", api);
