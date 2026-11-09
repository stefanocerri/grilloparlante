// Tipi condivisi tra processo principale Electron, preload e interfaccia.

export interface VoiceInfo {
  id: string;
  name: string;
  gender: "uomo" | "donna";
  description: string;
  previewUrl?: string;
}

export type ChapterStatus = "pending" | "converting" | "ready";

export interface ChapterEntry {
  index: number;
  title: string;
  status: ChapterStatus;
  file: string | null;
  duration: number | null;
  chars: number;
  estimatedMinutes: number;
  size?: number;
  /** Solo per articoli/notizie da JSON: fonte, link, sezione, data. */
  meta?: { section?: string; source?: string; url?: string; author?: string; publishedAt?: string };
}

export type ContentKind = "libro" | "documentazione" | "articolo" | "notiziario";

/** Contenuto di books/<id>/book.json scritto dal backend Python. */
export interface Book {
  id: string;
  title: string;
  author: string;
  /** Assente nei libri importati prima di questo campo: vale "libro". */
  kind?: ContentKind;
  /** false per articoli/notizie: il titolo del capitolo non viene letto. */
  readTitles?: boolean;
  publishedAt?: string;
  expiresAt?: string;
  source?: string;
  url?: string;
  voice: { id: string; name: string };
  speed: number;
  sourceFile: string;
  cover: string | null;
  createdAt: string;
  updatedAt: string;
  status: "new" | "partial" | "ready";
  readyChapters: number;
  totalDuration: number;
  chapters: ChapterEntry[];
}

export type SyncState = "off" | "idle" | "uploading" | "error";

export interface BookView extends Book {
  coverUrl?: string;
  chapterUrls: Record<number, string>;
  uploadedChapters: number[];
  queuedChapters: number[];
}

export interface JobProgress {
  bookId: string;
  progress: number;
  label: string;
  chapterIndex?: number;
  chapterProgress?: number;
  etaSeconds?: number;
}

export interface QueueItem {
  bookId: string;
  chapters: number[];
}

export interface QueueState {
  running: QueueItem | null;
  pending: QueueItem[];
  progress: JobProgress | null;
  importing: string | null;
  lastError: string | null;
}

export type RuntimeState = "checking" | "missing" | "installing" | "ready" | "error";

export interface RuntimeStatus {
  state: RuntimeState;
  message: string;
  detail?: string;
  progress?: number;
  device?: string;
  canInstall: boolean;
  installHint?: string;
}

export interface TursoSettings {
  url: string;
  /** Resta sul Mac: serve per caricare. */
  writeToken: string;
  /** Da dare alle app di ascolto: possono solo leggere. Va nei QR, mai il token di scrittura. */
  readToken: string;
  /** App di ascolto per il telefono (ilmatta, fomo...): una per QR. */
  apps: ListeningApp[];
}

export interface ListeningApp {
  id: string;
  name: string;
  /** Dove è pubblicata (es. su Vercel). Vuoto: il QR non compare. */
  url: string;
}

export interface AppQr {
  id: string;
  name: string;
  link: string;
  image: string;
}

export interface TursoOrgChoice {
  slug: string;
  name: string;
  type: string;
}

/** Esito di "Configura": fatto, oppure serve scegliere l'organizzazione. */
export type TursoSetupOutcome =
  | { status: "choose-org"; orgs: TursoOrgChoice[] }
  | { status: "done"; message: string };

export interface SyncStatus {
  state: SyncState;
  message: string;
}

/** Controllo del Mac per la configurazione guidata. */
export interface SystemCheck {
  /** "arm64" (chip Apple) o "x64" (Intel). */
  arch: string;
  macosVersion: string | null;
  python: { ok: boolean; version: string | null; path: string | null };
  homebrew: { ok: boolean; path: string | null };
  /** Spazio libero nel disco dell'utente, in GB (null se non si riesce a leggerlo). */
  freeDiskGb: number | null;
  /** Spazio che serve per il motore voce, in GB. */
  requiredDiskGb: number;
}

export interface AppSnapshot {
  /** false finché l'utente non ha completato (o saltato) la configurazione guidata. */
  onboarded: boolean;
  runtime: RuntimeStatus;
  voices: VoiceInfo[];
  books: BookView[];
  queue: QueueState;
  turso: TursoSettings;
  sync: SyncStatus;
  libraryDir: string;
}

export interface ImportRequest {
  filePath: string;
  voiceId: string;
  speed: number;
  /** Dopo l'importazione mette subito in coda tutti i capitoli. */
  convertAll?: boolean;
}
