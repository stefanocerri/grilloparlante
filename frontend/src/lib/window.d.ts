import type {
  ConversionSettings,
  InputFileMeta,
  JobEvent,
  RuntimeEvent,
  RuntimeStatus
} from "@shared/contracts";

declare global {
  interface Window {
    grillo: {
      selectFile: () => Promise<InputFileMeta | null>;
      selectReferenceFile: () => Promise<string | null>;
      importFileBuffer: (name: string, bytes: ArrayBuffer) => Promise<InputFileMeta>;
      startConversion: (
        file: InputFileMeta,
        settings: ConversionSettings
      ) => Promise<{ ok: true }>;
      cancelConversion: () => Promise<{ ok: true }>;
      openOutputFolder: (targetPath: string) => Promise<void>;
      getRuntimeStatus: () => Promise<RuntimeStatus>;
      installRuntime: () => Promise<RuntimeStatus>;
      repairRuntime: () => Promise<RuntimeStatus>;
      removeRuntime: () => Promise<RuntimeStatus>;
      minimizeWindow: () => Promise<void>;
      toggleFullscreen: () => Promise<void>;
      closeWindow: () => Promise<void>;
      openDevTools: () => Promise<void>;
      fileUrl: (targetPath: string) => string;
      onJobEvent: (listener: (event: JobEvent) => void) => () => void;
      onRuntimeEvent: (listener: (event: RuntimeEvent) => void) => () => void;
    };
  }
}

export {};
