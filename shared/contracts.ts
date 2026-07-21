export type SupportedFileType = "pdf" | "epub" | "txt" | "unknown";

export type ConversionStage =
  | "idle"
  | "ingest"
  | "extract"
  | "chaptering"
  | "chunking"
  | "tts"
  | "merge"
  | "finalize"
  | "completed"
  | "error"
  | "cancelled";

export interface InputFileMeta {
  name: string;
  path: string;
  type: SupportedFileType;
  size?: number;
}

export interface TtsSettings {
  engine: string;
  language: string;
  voiceMode: "standard" | "reference";
  voiceName: string;
  speakingSpeed: number;
  // Supertonic: built-in preset voice (F1..F5, M1..M5)
  voiceStyle?: string;
  // Supertonic: optional custom voice JSON from Voice Builder
  voiceStylePath?: string;
  // Supertonic: synthesis steps, quality vs speed (4-16, default 8)
  qualitySteps?: number;
  // Qwen: reference voice sample
  referenceAudioPath?: string;
  referenceText?: string;
}

export type RuntimeState =
  | "checking"
  | "missing"
  | "installing"
  | "ready"
  | "error"
  | "removing";

export interface RuntimeManifestSummary {
  runtimeId: string;
  runtimeVersion: string;
  mode: "managed" | "development";
  revision?: string;
  pythonPath?: string;
  defaultReferencePath?: string;
  source?: string;
}

export interface RuntimeStatus {
  runtimeId: string;
  runtimeVersion: string;
  mode: "managed" | "development";
  state: RuntimeState;
  isPackaged: boolean;
  arch: string;
  appVersion: string;
  runtimeDir: string;
  metadataPath: string;
  message: string;
  detail?: string;
  installHint?: string;
  source?: string;
  revision?: string;
  pythonPath?: string;
  defaultReferencePath?: string;
  conversionBlocked: boolean;
  installRequired: boolean;
  fallbackAllowed: boolean;
  fallbackActive: boolean;
  canInstall: boolean;
  canRepair: boolean;
  canRemove: boolean;
}

export interface RuntimeProgress {
  state: RuntimeState;
  step: string;
  message: string;
  progress?: number;
  detail?: string;
}

export interface RuntimeEventMap {
  status: RuntimeStatus;
  progress: RuntimeProgress;
}

export type RuntimeEventType = keyof RuntimeEventMap;

export interface RuntimeEvent<T extends RuntimeEventType = RuntimeEventType> {
  type: T;
  payload: RuntimeEventMap[T];
  timestamp: string;
}

export interface ConversionSettings {
  outputDir: string;
  chunkSize: number;
  mergeByChapter: boolean;
  keepTempFiles: boolean;
  preferredAudioFormat: "mp3" | "wav";
  tts: TtsSettings;
}

export interface ChapterSummary {
  id: string;
  title: string;
  chunkCount: number;
  textLength: number;
  outputPath?: string;
  previewUrl?: string;
}

export interface JobStats {
  chaptersFound: number;
  chunksCreated: number;
  audioChunksGenerated: number;
  elapsedMs: number;
  currentStage: ConversionStage;
  fileType?: SupportedFileType;
  ocrUsed?: boolean;
  chapterMode?: "toc" | "heading" | "fallback";
}

export interface ManifestSummary {
  title: string;
  sourceFile: string;
  sourceType: SupportedFileType;
  convertedAt: string;
  coverPath?: string;
  warnings: string[];
  settings: ConversionSettings;
  runtime?: RuntimeManifestSummary;
}

export interface ConversionResult {
  jobId: string;
  outputDir: string;
  manifestPath: string;
  rawTextPath: string;
  chaptersPath: string;
  chunksPath: string;
  manifest: ManifestSummary;
  chapters: ChapterSummary[];
  finalAudioFiles: string[];
  previewFile?: string;
  previewUrl?: string;
  coverPath?: string;
  coverUrl?: string;
}

export interface JobEventMap {
  ready: {
    jobId: string;
    file: InputFileMeta;
  };
  stage: {
    stage: ConversionStage;
    label: string;
    message: string;
  };
  progress: {
    stage: ConversionStage;
    progress: number;
    label?: string;
  };
  log: {
    level: "info" | "warning" | "error";
    message: string;
    detail?: string;
  };
  stats: Partial<JobStats>;
  result: ConversionResult;
  error: {
    message: string;
    detail?: string;
  };
  warning: {
    message: string;
  };
  cancelled: {
    jobId: string;
  };
}

export type JobEventType = keyof JobEventMap;

export interface JobEvent<T extends JobEventType = JobEventType> {
  type: T;
  payload: JobEventMap[T];
  timestamp: string;
}
