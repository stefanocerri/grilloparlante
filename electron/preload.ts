import { contextBridge, ipcRenderer, webUtils } from "electron";
import { pathToFileURL } from "node:url";
import type {
  ConversionSettings,
  InputFileMeta,
  JobEvent,
  NewVoiceInput,
  RuntimeEvent,
  SavedVoice,
  RuntimeStatus
} from "../shared/contracts";

function detectFileType(filePath: string): InputFileMeta["type"] {
  const extension = filePath.split(".").pop()?.toLowerCase();

  if (extension === "pdf") {
    return "pdf";
  }

  if (extension === "epub") {
    return "epub";
  }

  if (extension === "txt" || extension === "md") {
    return "txt";
  }

  return "unknown";
}

function openRendererFilePicker(): Promise<InputFileMeta | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".pdf,.epub,.txt,.md";
    input.style.position = "fixed";
    input.style.left = "-9999px";

    input.addEventListener(
      "change",
      () => {
        const file = input.files?.[0];
        input.remove();

        if (!file) {
          resolve(null);
          return;
        }

        const filePath = webUtils.getPathForFile(file);

        if (!filePath) {
          resolve(null);
          return;
        }

        resolve({
          name: file.name,
          path: filePath,
          type: detectFileType(filePath),
          size: file.size
        });
      },
      { once: true }
    );

    document.body.appendChild(input);
    input.click();
  });
}

function openRendererReferencePicker(): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".wav,.mp3,.m4a,.aiff,.aif,.flac,.ogg";
    input.style.position = "fixed";
    input.style.left = "-9999px";

    input.addEventListener(
      "change",
      () => {
        const file = input.files?.[0];
        input.remove();

        if (!file) {
          resolve(null);
          return;
        }

        const filePath = webUtils.getPathForFile(file);
        resolve(filePath || null);
      },
      { once: true }
    );

    document.body.appendChild(input);
    input.click();
  });
}

const api = {
  selectFile: async () => {
    try {
      console.log("[grillo] opening native file dialog");
      const result = await (ipcRenderer.invoke("dialog:select-file") as Promise<InputFileMeta | null>);
      console.log("[grillo] native file dialog result", result);
      return result;
    } catch {
      // Fall through to renderer-owned file input fallback.
    }

    console.warn("[grillo] native dialog failed, using renderer fallback");
    return openRendererFilePicker();
  },
  importFileBuffer: (name: string, bytes: ArrayBuffer) =>
    ipcRenderer.invoke("file:cache-import", {
      name,
      bytes: Array.from(new Uint8Array(bytes))
    }) as Promise<InputFileMeta>,
  selectReferenceFile: async () => {
    try {
      const result = await (ipcRenderer.invoke("dialog:select-reference-file") as Promise<string | null>);
      return result;
    } catch {
      // Fall through to renderer-owned file input fallback.
    }

    return openRendererReferencePicker();
  },
  selectVoiceStyleFile: () =>
    ipcRenderer.invoke("dialog:select-voice-style-file") as Promise<string | null>,
  listVoices: () => ipcRenderer.invoke("voices:list") as Promise<SavedVoice[]>,
  addVoice: (input: NewVoiceInput) =>
    ipcRenderer.invoke("voices:add", input) as Promise<SavedVoice>,
  renameVoice: (id: string, name: string) =>
    ipcRenderer.invoke("voices:rename", { id, name }) as Promise<SavedVoice>,
  removeVoice: (id: string) => ipcRenderer.invoke("voices:remove", id) as Promise<SavedVoice[]>,
  openVoicesFolder: () => ipcRenderer.invoke("voices:open-folder") as Promise<void>,
  requestMicrophoneAccess: () =>
    ipcRenderer.invoke("media:request-microphone") as Promise<boolean>,
  startConversion: (file: InputFileMeta, settings: ConversionSettings) =>
    ipcRenderer.invoke("job:start", { file, settings }) as Promise<{ ok: true }>,
  cancelConversion: () => ipcRenderer.invoke("job:cancel") as Promise<{ ok: true }>,
  openOutputFolder: (targetPath: string) =>
    ipcRenderer.invoke("shell:open-path", targetPath) as Promise<void>,
  getRuntimeStatus: () => ipcRenderer.invoke("runtime:status") as Promise<RuntimeStatus>,
  installRuntime: () => ipcRenderer.invoke("runtime:install") as Promise<RuntimeStatus>,
  repairRuntime: () => ipcRenderer.invoke("runtime:repair") as Promise<RuntimeStatus>,
  removeRuntime: () => ipcRenderer.invoke("runtime:remove") as Promise<RuntimeStatus>,
  minimizeWindow: () => ipcRenderer.invoke("window:minimize") as Promise<void>,
  toggleFullscreen: () =>
    ipcRenderer.invoke("window:toggle-fullscreen") as Promise<void>,
  closeWindow: () => ipcRenderer.invoke("window:close") as Promise<void>,
  openDevTools: () => ipcRenderer.invoke("devtools:open") as Promise<void>,
  fileUrl: (targetPath: string) => pathToFileURL(targetPath).toString(),
  onJobEvent: (listener: (event: JobEvent) => void) => {
    const wrapped = (_event: unknown, payload: JobEvent) => listener(payload);
    ipcRenderer.on("job:event", wrapped);
    return () => ipcRenderer.removeListener("job:event", wrapped);
  },
  onRuntimeEvent: (listener: (event: RuntimeEvent) => void) => {
    const wrapped = (_event: unknown, payload: RuntimeEvent) => listener(payload);
    ipcRenderer.on("runtime:event", wrapped);
    return () => ipcRenderer.removeListener("runtime:event", wrapped);
  }
};

contextBridge.exposeInMainWorld("grillo", api);
