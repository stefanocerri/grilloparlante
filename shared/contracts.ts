// Tipi condivisi tra processo principale Electron, preload e interfaccia.

export interface VoiceInfo {
  id: string;
  name: string;
  gender: "uomo" | "donna" | "altro";
  description: string;
  previewUrl?: string;
  /** Creata dall'utente da un campione audio (si può eliminare). */
  custom?: boolean;
}

export interface VoiceCreateRequest {
  /** WAV, MP3, M4A o FLAC con una sola persona che parla. */
  filePath: string;
  name: string;
  gender: "uomo" | "donna" | "altro";
  /** Cosa dice il campione. Vuoto: lo trascrive Whisper. */
  transcript?: string;
}

export interface VoiceJob {
  state: "running" | "done" | "error";
  name: string;
  progress: number;
  label: string;
  voiceId?: string;
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
  /** Canali (app) a cui è destinato; sul Mac resta sempre. */
  targets: string[];
  /** Capitoli già caricati su tutte le destinazioni. */
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

/** Database Turso di un canale. */
export interface ChannelDb {
  /** Nome su Turso (es. grillo-ilmatta). */
  name: string;
  url: string;
  /** Chiave completa usata da Grillo: resta sul Mac. */
  token: string;
  /** Chiave che va all'app tramite il QR. */
  appToken: string;
  /** false se appToken è di sola lettura (collegamenti di prima): l'app non può mandare file a Grillo. */
  appCanWrite: boolean;
}

/** Un'app di ascolto collegata a Grillo ("canale"): ha il suo database e riceve solo i libri destinati a lei. */
export interface Channel {
  id: string;
  name: string;
  /** Dove è pubblicata l'app (es. https://ilmatta.vercel.app): serve per il QR. */
  appUrl: string;
  db: ChannelDb | null;
}

export interface ChannelView extends Channel {
  sync: SyncStatus;
}

/** File mandato a Grillo da un'app (casella "requests" del suo database). */
export interface InboxItem {
  channelId: string;
  channelName: string;
  requestId: string;
  fileName: string;
  status: string;
  bookId?: string;
  message?: string;
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
  /** Spazio che serve per il narratore, in GB. */
  requiredDiskGb: number;
}

/** Aspetto dell'interfaccia: "system" segue Impostazioni di Sistema → Aspetto. */
export type ThemeChoice = "system" | "light" | "dark";

export interface AppSnapshot {
  theme: ThemeChoice;
  /** false finché l'utente non ha completato (o saltato) la configurazione guidata. */
  onboarded: boolean;
  runtime: RuntimeStatus;
  voices: VoiceInfo[];
  /** Creazione di una voce da un campione, se in corso o appena finita. */
  voiceJob: VoiceJob | null;
  books: BookView[];
  queue: QueueState;
  channels: ChannelView[];
  /** File arrivati dalle app e non ancora finiti. */
  inbox: InboxItem[];
  defaultVoiceId: string | null;
  libraryDir: string;
}

export interface ImportRequest {
  filePath: string;
  voiceId: string;
  speed: number;
  /** Dopo l'importazione mette subito in coda tutti i capitoli. */
  convertAll?: boolean;
  /** Canali a cui mandarlo (oltre al Mac, dove resta sempre). */
  targets?: string[];
}
