// Protocollo tra Grillo (app Mac) e le app di ascolto ("canali").
// Ogni app collegata ha il suo database Turso: Grillo ci carica i libri destinati a lei (tabelle in turso.ts),
// ci scrive il suo stato ogni 30 secondi (grillo_status) e ci legge i PDF che l'app gli manda (requests).
// Questo file è copiato identico nel kit delle app (skal: src/grillo/channel.ts): se lo cambi, cambialo anche lì.

import type { SqlStatement } from "./turso";

export const CHANNEL_PROTOCOL_VERSION = 1;

/** Grillo scrive il suo stato ogni HEARTBEAT_MS; l'app lo considera spento dopo OFFLINE_AFTER_MS. */
export const HEARTBEAT_MS = 30_000;
export const OFFLINE_AFTER_MS = 3 * 60_000;

/** Pezzi dei file caricati dall'app (come l'audio: una riga per pezzo). */
export const REQUEST_PART_BYTES = 512 * 1024;

export const CHANNEL_SCHEMA: SqlStatement[] = [
  {
    sql: `CREATE TABLE IF NOT EXISTS grillo_status (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      seen_at TEXT NOT NULL,
      json TEXT NOT NULL
    )`
  },
  {
    sql: `CREATE TABLE IF NOT EXISTS requests (
      id TEXT PRIMARY KEY,
      file_name TEXT NOT NULL,
      mime TEXT,
      size INTEGER NOT NULL,
      parts INTEGER NOT NULL,
      status TEXT NOT NULL,
      options TEXT,
      chapters TEXT,
      selection TEXT,
      book_id TEXT,
      message TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`
  },
  {
    sql: `CREATE TABLE IF NOT EXISTS request_parts (
      request_id TEXT NOT NULL,
      part INTEGER NOT NULL,
      data BLOB NOT NULL,
      PRIMARY KEY (request_id, part)
    )`
  }
];

/** Contenuto di grillo_status.json. */
export interface GrilloStatus {
  version: number;
  /** "ready": può ricevere e convertire; "busy": sta convertendo; "no-narrator": manca il narratore. */
  state: "ready" | "busy" | "no-narrator";
  channel: { id: string; name: string };
  voices: { id: string; name: string; gender: string }[];
  defaultVoiceId: string | null;
  queue: { title: string | null; progress: number | null; pendingChapters: number };
}

/**
 * Ciclo di vita di una richiesta (un file mandato dall'app):
 *   uploading  l'app sta caricando i pezzi
 *   uploaded   pezzi completi: Grillo lo prenderà al prossimo giro
 *   importing  Grillo lo sta leggendo e cerca i capitoli
 *   choose     capitoli in `chapters`: l'app (o il Mac) sceglie quali convertire
 *   queued     l'app ha scritto `selection` (indici) e aspetta che Grillo li metta in coda
 *   converting in coda o in conversione; i capitoli compaiono in `books` man mano
 *   done       tutti i capitoli scelti sono su Turso
 *   error      `message` spiega cosa non va
 */
export type RequestStatus = "uploading" | "uploaded" | "importing" | "choose" | "queued" | "converting" | "done" | "error";

export interface RequestOptions {
  voiceId?: string;
  speed?: number;
  /** Salta la scelta: converte subito tutti i capitoli. */
  convertAll?: boolean;
}

export interface RequestChapter {
  index: number;
  title: string;
  estimatedMinutes: number;
}

/** Stato dal battito di Grillo, come lo mostra il semaforo dell'app. */
export function grilloLight(seenAt: string | null | undefined, status: GrilloStatus | null, now = Date.now()) {
  const age = seenAt ? now - Date.parse(seenAt) : Infinity;
  if (!(age < OFFLINE_AFTER_MS) || !status) return "red" as const;
  if (status.state === "ready") return "green" as const;
  return "yellow" as const;
}
