import { TursoClient } from "@shared/turso";
import { Connection, resolveDbUrl } from "./config";

export interface RemoteChapter {
  index: number;
  title: string;
  estimatedMinutes: number;
  status: "ready" | "pending";
  duration: number | null;
  size: number | null;
  parts: number;
  meta?: { section?: string; source?: string; url?: string; author?: string; publishedAt?: string };
}

export type ContentKind = "libro" | "documentazione" | "articolo" | "notiziario";

export const KIND_LABEL: Record<ContentKind, string> = {
  libro: "Libro",
  documentazione: "Documento",
  articolo: "Articolo",
  notiziario: "Notiziario"
};

export interface RemoteBook {
  id: string;
  title: string;
  author: string;
  kind?: ContentKind;
  source?: string;
  publishedAt?: string;
  expiresAt?: string;
  voice: { id: string; name: string };
  readyChapters: number;
  totalDuration: number;
  updatedAt: string;
  chapters: RemoteChapter[];
  hasCover: boolean;
  coverSize: number;
}

const AUDIO_CACHE = "grillo-audio-v1";
const COVER_CACHE = "grillo-covers-v1";
const BOOKS_KEY = "grillo:books";
const PARTS_PER_REQUEST = 4;

function client(connection: Connection) {
  return new TursoClient(resolveDbUrl(connection.db), connection.token);
}

export function cachedBooks(): RemoteBook[] {
  try {
    return JSON.parse(localStorage.getItem(BOOKS_KEY) ?? "[]") as RemoteBook[];
  } catch {
    return [];
  }
}

export async function fetchBooks(connection: Connection): Promise<RemoteBook[]> {
  const rows = await client(connection).query(
    "SELECT json, length(cover) AS cover_size FROM books ORDER BY updated_at DESC"
  );
  const now = Date.now();
  const books = rows.map((row) => {
    const book = JSON.parse(String(row.json)) as RemoteBook;
    book.coverSize = Number(row.cover_size ?? 0);
    book.hasCover = book.coverSize > 0;
    return book;
  }).filter((book) => !book.expiresAt || !(Date.parse(book.expiresAt) <= now)); // notizie scadute: nascoste
  localStorage.setItem(BOOKS_KEY, JSON.stringify(books));
  return books;
}

const coverUrls = new Map<string, string>();

export async function coverUrl(connection: Connection, book: RemoteBook): Promise<string | null> {
  if (!book.hasCover) return null;
  const key = `https://grillo.local/cover/${encodeURIComponent(book.id)}?size=${book.coverSize}`;
  if (coverUrls.has(key)) return coverUrls.get(key)!;

  const cache = await caches.open(COVER_CACHE);
  let response = await cache.match(key);
  if (!response) {
    const rows = await client(connection).query("SELECT cover, cover_mime FROM books WHERE id = ?", [book.id]);
    const data = rows[0]?.cover;
    if (!(data instanceof Uint8Array)) return null;
    response = new Response(new Blob([data as Uint8Array<ArrayBuffer>], { type: String(rows[0].cover_mime || "image/jpeg") }));
    await cache.put(key, response.clone());
  }
  const url = URL.createObjectURL(await response.blob());
  coverUrls.set(key, url);
  return url;
}

function audioKey(bookId: string, chapter: RemoteChapter) {
  return `https://grillo.local/audio/${encodeURIComponent(bookId)}/${chapter.index}?size=${chapter.size ?? 0}`;
}

export async function isDownloaded(bookId: string, chapter: RemoteChapter): Promise<boolean> {
  const cache = await caches.open(AUDIO_CACHE);
  return Boolean(await cache.match(audioKey(bookId, chapter)));
}

const inflight = new Map<string, Promise<Blob>>();

/** Scarica (o prende dalla cache) l'MP3 di un capitolo, ricomponendo i pezzi salvati su Turso. */
export function chapterAudio(
  connection: Connection,
  bookId: string,
  chapter: RemoteChapter,
  onProgress?: (fraction: number) => void
): Promise<Blob> {
  const key = audioKey(bookId, chapter);
  const running = inflight.get(key);
  if (running) return running;

  const job = (async () => {
    const cache = await caches.open(AUDIO_CACHE);
    const cached = await cache.match(key);
    if (cached) return cached.blob();

    const parts: Uint8Array<ArrayBuffer>[] = [];
    for (let start = 0; start < chapter.parts; start += PARTS_PER_REQUEST) {
      const rows = await client(connection).query(
        "SELECT data FROM chapter_audio WHERE book_id = ? AND idx = ? AND part >= ? AND part < ? ORDER BY part",
        [bookId, chapter.index, start, start + PARTS_PER_REQUEST]
      );
      for (const row of rows) parts.push(row.data as Uint8Array<ArrayBuffer>);
      onProgress?.(Math.min(1, (start + PARTS_PER_REQUEST) / chapter.parts));
    }
    const blob = new Blob(parts, { type: "audio/mpeg" });
    await cache.put(key, new Response(blob, { headers: { "Content-Type": "audio/mpeg" } }));
    return blob;
  })().finally(() => inflight.delete(key));

  inflight.set(key, job);
  return job;
}

export async function removeDownloads(bookId: string) {
  const cache = await caches.open(AUDIO_CACHE);
  const prefix = `https://grillo.local/audio/${encodeURIComponent(bookId)}/`;
  for (const request of await cache.keys()) {
    if (request.url.startsWith(prefix)) await cache.delete(request);
  }
}
