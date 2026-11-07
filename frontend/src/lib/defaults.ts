import type {
  ConversionSettings,
  ConversionStage,
  InputFileMeta,
  SupportedFileType
} from "@shared/contracts";

export const DEFAULT_SETTINGS: ConversionSettings = {
  outputDir: "",
  chunkSize: 1200,
  mergeByChapter: true,
  keepTempFiles: false,
  preferredAudioFormat: "mp3",
  tts: {
    engine: "supertonic",
    language: "auto",
    voiceMode: "standard",
    voiceName: "Voce preset",
    voiceStyle: "F1",
    voiceStylePath: "",
    qualitySteps: 8,
    speakingSpeed: 1,
    referenceText: ""
  }
};

export const STAGE_TITLES: Record<ConversionStage, string> = {
  idle: "In attesa",
  ingest: "Caricamento file",
  extract: "Estrazione testo",
  chaptering: "Rilevamento capitoli",
  chunking: "Suddivisione chunk",
  tts: "Generazione voce",
  merge: "Unione audio",
  finalize: "Scrittura output",
  completed: "Completato",
  error: "Errore",
  cancelled: "Annullato"
};

export function detectFileType(filePath: string): SupportedFileType {
  const ext = filePath.split(".").pop()?.toLowerCase();

  if (ext === "pdf") {
    return "pdf";
  }

  if (ext === "epub") {
    return "epub";
  }

  if (ext === "txt" || ext === "md") {
    return "txt";
  }

  if (ext === "json") {
    return "json";
  }

  return "unknown";
}

export function metaFromPath(filePath: string, size?: number): InputFileMeta {
  return {
    name: filePath.split("/").pop() ?? filePath,
    path: filePath,
    type: detectFileType(filePath),
    size
  };
}

export function formatBytes(value?: number) {
  if (!value) {
    return "unknown size";
  }

  const units = ["B", "KB", "MB", "GB"];
  let current = value;
  let index = 0;

  while (current > 1024 && index < units.length - 1) {
    current /= 1024;
    index += 1;
  }

  return `${current.toFixed(current >= 10 ? 0 : 1)} ${units[index]}`;
}

export function formatElapsed(ms: number) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes.toString().padStart(2, "0")}:${remainingSeconds
    .toString()
    .padStart(2, "0")}`;
}
