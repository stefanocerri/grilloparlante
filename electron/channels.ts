import fs from "node:fs";
import path from "node:path";
import type { Book, Channel, ChannelDb, ChannelView, InboxItem, SyncStatus } from "../shared/contracts";
import {
  CHANNEL_PROTOCOL_VERSION,
  CHANNEL_SCHEMA,
  HEARTBEAT_MS,
  type GrilloStatus,
  type RequestChapter,
  type RequestOptions
} from "../shared/channel";
import { AUDIO_PART_BYTES, TURSO_SCHEMA, TursoClient } from "../shared/turso";
import { bookDir, listBooks, readBook } from "./library";
import { readJson, userDataFile, writeJson } from "./paths";

// --- Archivio dei canali -------------------------------------------------------

/** App di ascolto predefinite: pubblicate su Vercel, da collegare con un Platform API token. */
const DEFAULT_CHANNELS: Channel[] = [
  { id: "ilmatta", name: "ilmatta", appUrl: "https://ilmatta.vercel.app", db: null },
  { id: "fomo", name: "fomo", appUrl: "https://fomo.vercel.app", db: null }
];
const LEGACY_PWA_URL = "https://grilloparlante.vercel.app";

interface StoredSettings {
  channels?: Channel[];
  targets?: Record<string, string[]>;
  defaultVoiceId?: string;
  /** Prima dei canali: un solo database per tutte le app. */
  turso?: { url?: string; writeToken?: string; readToken?: string; pwaUrl?: string; apps?: { id: string; url: string }[] };
}

export function channelId(name: string) {
  return (
    name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "app"
  );
}

/**
 * Canali e destinazioni dei libri, in settings.json.
 * Migrazione: il vecchio database unico diventa il canale ilmatta (con la chiave di sola lettura per l'app)
 * e tutti i libri già presenti restano destinati a ilmatta, così non cambia nulla per chi lo usava.
 */
export class ChannelStore {
  channels: Channel[];

  targets: Record<string, string[]>;

  defaultVoiceId: string | null;

  constructor(private readonly file: string) {
    const stored = readJson<StoredSettings>(file, {});
    this.defaultVoiceId = stored.defaultVoiceId ?? null;
    if (stored.channels) {
      this.channels = stored.channels;
      this.targets = stored.targets ?? {};
      return;
    }
    this.channels = DEFAULT_CHANNELS.map((channel) => ({ ...channel }));
    this.targets = {};
    const legacy = stored.turso;
    if (legacy?.url && legacy.writeToken) {
      const ilmatta = this.channels[0];
      ilmatta.db = {
        name: "grillo",
        url: legacy.url,
        token: legacy.writeToken,
        appToken: legacy.readToken || legacy.writeToken,
        appCanWrite: !legacy.readToken
      };
      const oldUrl = legacy.apps?.find((app) => app.id === "ilmatta")?.url || legacy.pwaUrl;
      if (oldUrl && oldUrl.replace(/\/+$/, "") !== LEGACY_PWA_URL) ilmatta.appUrl = oldUrl;
      for (const book of listBooks()) this.targets[book.id] = ["ilmatta"];
      // Il registro dei caricamenti del database unico vale per ilmatta: niente da ricaricare.
      const oldLedger = userDataFile("turso-sync.json");
      const newLedger = userDataFile("channel-ilmatta-sync.json");
      if (fs.existsSync(oldLedger) && !fs.existsSync(newLedger)) fs.copyFileSync(oldLedger, newLedger);
    }
    this.save();
  }

  save() {
    const stored = readJson<Record<string, unknown>>(this.file, {});
    writeJson(this.file, { ...stored, channels: this.channels, targets: this.targets, defaultVoiceId: this.defaultVoiceId });
  }

  get(id: string) {
    return this.channels.find((channel) => channel.id === id);
  }

  add(name: string, appUrl: string): Channel {
    const base = channelId(name);
    let id = base;
    for (let n = 2; this.get(id); n += 1) id = `${base}-${n}`;
    const channel: Channel = { id, name: name.trim() || id, appUrl: appUrl.trim(), db: null };
    this.channels.push(channel);
    this.save();
    return channel;
  }

  update(id: string, patch: Partial<Pick<Channel, "name" | "appUrl" | "db">>) {
    const channel = this.get(id);
    if (!channel) throw new Error("App non trovata.");
    if (patch.name !== undefined) channel.name = patch.name.trim() || channel.name;
    if (patch.appUrl !== undefined) channel.appUrl = patch.appUrl.trim();
    if (patch.db !== undefined) channel.db = patch.db;
    this.save();
    return channel;
  }

  remove(id: string) {
    this.channels = this.channels.filter((channel) => channel.id !== id);
    for (const bookId of Object.keys(this.targets)) this.targets[bookId] = this.targets[bookId].filter((t) => t !== id);
    this.save();
  }

  targetsOf(bookId: string) {
    return (this.targets[bookId] ?? []).filter((id) => this.get(id));
  }

  setTargets(bookId: string, targets: string[]) {
    this.targets[bookId] = [...new Set(targets)].filter((id) => this.get(id));
    this.save();
  }

  forgetBook(bookId: string) {
    delete this.targets[bookId];
    this.save();
  }
}

// --- Caricamento dei libri nel database di un canale -----------------------------

interface BookSyncRecord {
  chapters: Record<string, number>; // indice -> dimensione MP3 caricata
  coverUploaded: boolean;
  metaUpdatedAt: string;
}

type SyncLedger = Record<string, BookSyncRecord>;

const RETRY_MS = 5 * 60 * 1000;

/** Articoli e notizie con `expiresAt` passato non restano su Turso. */
export function isExpired(book: Book, now = Date.now()): boolean {
  const expires = book.expiresAt ? Date.parse(book.expiresAt) : NaN;
  return Number.isFinite(expires) && expires <= now;
}

/**
 * Carica nel database del canale i libri destinati a lui (capitoli pronti, poi la scheda) e toglie quelli
 * non più destinati. Le app leggono solo la scheda: un capitolo compare quando il suo audio è già tutto su.
 */
export class ChannelSync {
  status: SyncStatus = { state: "off", message: "Da collegare" };

  private readonly ledgerFile: string;

  private ledger: SyncLedger;

  private schemaReady = false;

  private queue = new Set<string>();

  private working = false;

  private retryTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly channel: () => Channel | undefined,
    private readonly wants: (bookId: string) => boolean,
    private readonly onChange: () => void
  ) {
    this.ledgerFile = userDataFile(`channel-${channel()?.id ?? "x"}-sync.json`);
    this.ledger = readJson<SyncLedger>(this.ledgerFile, {});
  }

  db(): ChannelDb | null {
    return this.channel()?.db ?? null;
  }

  client() {
    const db = this.db();
    if (!db) throw new Error("App non collegata.");
    return new TursoClient(db.url, db.token);
  }

  uploadedChapters(bookId: string): number[] {
    return Object.keys(this.ledger[bookId]?.chapters ?? {}).map(Number);
  }

  /** Da chiamare dopo aver cambiato database. */
  reset() {
    this.schemaReady = false;
    this.ledger = {};
    writeJson(this.ledgerFile, this.ledger);
    this.syncAll();
  }

  /** Il canale è stato rimosso: dimentica il registro locale (il database su Turso resta). */
  dispose() {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    fs.rmSync(this.ledgerFile, { force: true });
  }

  syncAll() {
    for (const book of listBooks()) this.queue.add(book.id);
    for (const bookId of Object.keys(this.ledger)) this.queue.add(bookId);
    void this.drain();
  }

  syncBook(bookId: string) {
    this.queue.add(bookId);
    void this.drain();
  }

  async ensureSchema() {
    if (this.schemaReady) return;
    await this.client().batch([...TURSO_SCHEMA, ...CHANNEL_SCHEMA]);
    this.schemaReady = true;
  }

  async testConnection(): Promise<string> {
    await this.ensureSchema();
    const rows = await this.client().query("SELECT COUNT(*) AS n FROM books");
    const count = Number(rows[0]?.n ?? 0);
    return `Collegata: ${count} ${count === 1 ? "libro" : "libri"} nel suo database.`;
  }

  async removeRemote(bookId: string) {
    delete this.ledger[bookId];
    writeJson(this.ledgerFile, this.ledger);
    if (!this.db()) return;
    await this.client().batch([
      { sql: "DELETE FROM chapter_audio WHERE book_id = ?", args: [bookId] },
      { sql: "DELETE FROM books WHERE id = ?", args: [bookId] }
    ]);
  }

  private setStatus(status: SyncStatus) {
    this.status = status;
    this.onChange();
  }

  private async drain() {
    if (this.working) return;
    if (!this.db()) {
      this.queue.clear();
      this.setStatus({ state: "off", message: "Da collegare" });
      return;
    }

    this.working = true;
    try {
      await this.ensureSchema();
      while (this.queue.size) {
        const bookId = this.queue.values().next().value as string;
        this.queue.delete(bookId);
        const book = readBook(bookId);
        if (!book || !this.wants(bookId) || isExpired(book)) {
          // Non più destinato a quest'app, eliminato o notizia scaduta: via dal suo database.
          if (this.ledger[bookId]) await this.removeRemote(bookId);
          continue;
        }
        await this.uploadBook(book);
      }
      this.setStatus({ state: "idle", message: "Tutto caricato" });
    } catch (error) {
      this.setStatus({ state: "error", message: `Caricamento non riuscito: ${(error as Error).message}` });
      if (this.retryTimer) clearTimeout(this.retryTimer);
      this.retryTimer = setTimeout(() => this.syncAll(), RETRY_MS);
    } finally {
      this.working = false;
    }
  }

  private async uploadBook(book: Book) {
    const client = this.client();
    const record: BookSyncRecord = this.ledger[book.id] ?? { chapters: {}, coverUploaded: false, metaUpdatedAt: "" };
    this.ledger[book.id] = record;
    const dir = bookDir(book.id);

    for (const chapter of book.chapters) {
      if (chapter.status !== "ready" || !chapter.file) continue;
      const file = path.join(dir, chapter.file);
      if (!fs.existsSync(file)) continue;
      const size = fs.statSync(file).size;
      if (record.chapters[chapter.index] === size) continue;

      this.setStatus({ state: "uploading", message: `Carico "${book.title}", capitolo ${chapter.index}…` });
      const data = fs.readFileSync(file);
      await client.query("DELETE FROM chapter_audio WHERE book_id = ? AND idx = ?", [book.id, chapter.index]);
      for (let offset = 0, part = 0; offset < data.length; offset += AUDIO_PART_BYTES, part += 1) {
        await client.query("INSERT INTO chapter_audio (book_id, idx, part, data) VALUES (?, ?, ?, ?)", [
          book.id,
          chapter.index,
          part,
          new Uint8Array(data.subarray(offset, offset + AUDIO_PART_BYTES))
        ]);
      }
      record.chapters[chapter.index] = size;
      writeJson(this.ledgerFile, this.ledger);
      await this.uploadMeta(client, book, record, dir);
    }

    if (record.metaUpdatedAt !== book.updatedAt) await this.uploadMeta(client, book, record, dir);
  }

  /** Scheda per l'app: solo i capitoli già caricati risultano "ready". */
  private async uploadMeta(client: TursoClient, book: Book, record: BookSyncRecord, dir: string) {
    const remote = {
      ...book,
      chapters: book.chapters.map((chapter) => {
        const uploaded = record.chapters[chapter.index];
        return {
          index: chapter.index,
          title: chapter.title,
          estimatedMinutes: chapter.estimatedMinutes,
          status: uploaded ? "ready" : "pending",
          duration: uploaded ? chapter.duration : null,
          size: uploaded ?? null,
          parts: uploaded ? Math.ceil(uploaded / AUDIO_PART_BYTES) : 0,
          meta: chapter.meta
        };
      })
    };
    remote.readyChapters = remote.chapters.filter((chapter) => chapter.status === "ready").length;
    remote.totalDuration = remote.chapters.reduce((sum, chapter) => sum + (chapter.duration ?? 0), 0);

    const statements = [
      {
        sql: `INSERT INTO books (id, json, updated_at) VALUES (?, ?, ?)
              ON CONFLICT(id) DO UPDATE SET json = excluded.json, updated_at = excluded.updated_at`,
        args: [book.id, JSON.stringify(remote), new Date().toISOString()]
      }
    ];
    if (!record.coverUploaded && book.cover && fs.existsSync(path.join(dir, book.cover))) {
      const mime = book.cover.endsWith(".png") ? "image/png" : "image/jpeg";
      statements.push({
        sql: "UPDATE books SET cover = ?, cover_mime = ? WHERE id = ?",
        args: [new Uint8Array(fs.readFileSync(path.join(dir, book.cover))), mime, book.id] as never
      });
    }
    await client.batch(statements);
    record.coverUploaded = record.coverUploaded || Boolean(book.cover);
    record.metaUpdatedAt = book.updatedAt;
    writeJson(this.ledgerFile, this.ledger);
  }
}

// --- Battito e casella delle richieste ------------------------------------------

export interface LinkHooks {
  status: (channel: Channel) => GrilloStatus;
  /** Importa un file arrivato dall'app e lo destina a quel canale. */
  importFile: (filePath: string, options: RequestOptions, channelId: string) => Promise<string>;
  enqueue: (bookId: string, chapters: number[]) => void;
  /** Capitoli in coda o in conversione per quel libro. */
  queued: (bookId: string) => number[];
  onInboxChange: () => void;
  log: (line: string) => void;
}

interface RequestRow {
  id: string;
  file_name: string;
  status: string;
  options: string | null;
  selection: string | null;
  book_id: string | null;
  message: string | null;
}

/**
 * Ogni HEARTBEAT_MS: scrive lo stato di Grillo nel database del canale (semaforo dell'app) e gestisce
 * la casella "requests" (file mandati dall'app → importazione → scelta dei capitoli → conversione).
 */
export class ChannelLink {
  inbox: InboxItem[] = [];

  private timer: NodeJS.Timeout | null = null;

  private ticking = false;

  constructor(
    private readonly channel: () => Channel | undefined,
    private readonly sync: ChannelSync,
    private readonly hooks: LinkHooks
  ) {}

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => void this.tick(), HEARTBEAT_MS);
    void this.tick();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Subito, ad esempio dopo un cambio di coda. */
  poke() {
    void this.tick();
  }

  private async tick() {
    const channel = this.channel();
    if (this.ticking || !channel?.db) return;
    this.ticking = true;
    try {
      await this.sync.ensureSchema();
      const client = this.sync.client();
      // Prima la casella, poi lo stato: così il semaforo riflette subito le conversioni appena avviate.
      await this.processRequests(channel, client).catch((error: Error) => this.hooks.log(`[${channel.id}] casella: ${error.message}`));
      await client.query(
        `INSERT INTO grillo_status (id, seen_at, json) VALUES (1, ?, ?)
         ON CONFLICT(id) DO UPDATE SET seen_at = excluded.seen_at, json = excluded.json`,
        [new Date().toISOString(), JSON.stringify(this.hooks.status(channel))]
      );
    } catch (error) {
      this.hooks.log(`[${channel.id}] ${(error as Error).message}`);
    } finally {
      this.ticking = false;
    }
  }

  private async setRequest(client: TursoClient, id: string, fields: Record<string, string | null>) {
    const keys = Object.keys(fields);
    await client.query(
      `UPDATE requests SET ${keys.map((key) => `${key} = ?`).join(", ")}, updated_at = ? WHERE id = ?`,
      [...keys.map((key) => fields[key]), new Date().toISOString(), id]
    );
  }

  private async processRequests(channel: Channel, client: TursoClient) {
    const rows = (await client.query(
      `SELECT id, file_name, status, options, selection, book_id, message FROM requests
       WHERE status IN ('uploaded', 'importing', 'choose', 'queued', 'converting', 'error')
       ORDER BY created_at`
    )) as unknown as RequestRow[];

    for (const row of rows) {
      try {
        if (row.status === "uploaded" || (row.status === "importing" && !row.book_id)) {
          await this.importRequest(channel, client, row);
        } else if (row.status === "queued" && row.book_id) {
          const selection = parseJson<number[]>(row.selection, []);
          this.hooks.enqueue(row.book_id, selection);
          await this.setRequest(client, row.id, { status: "converting" });
        } else if (row.status === "choose" && row.book_id) {
          // Scelta fatta dal Mac: ci sono capitoli in coda o già pronti.
          const queued = this.hooks.queued(row.book_id);
          if (queued.length) await this.setRequest(client, row.id, { status: "converting", selection: JSON.stringify(queued) });
        } else if (row.status === "converting" && row.book_id) {
          const book = readBook(row.book_id);
          const selection = parseJson<number[]>(row.selection, book?.chapters.map((c) => c.index) ?? []);
          const uploaded = new Set(this.sync.uploadedChapters(row.book_id));
          if (!book || selection.every((index) => uploaded.has(index))) {
            await this.setRequest(client, row.id, { status: "done", message: null });
          }
        }
      } catch (error) {
        await this.setRequest(client, row.id, { status: "error", message: (error as Error).message }).catch(() => undefined);
      }
    }

    const fresh = (await client.query(
      `SELECT id, file_name, status, book_id, message FROM requests
       WHERE status NOT IN ('done', 'uploading') ORDER BY created_at DESC LIMIT 20`
    )) as unknown as RequestRow[];
    const next = fresh.map((row) => ({
      channelId: channel.id,
      channelName: channel.name,
      requestId: row.id,
      fileName: row.file_name,
      status: row.status,
      bookId: row.book_id ?? undefined,
      message: row.message ?? undefined
    }));
    if (JSON.stringify(next) !== JSON.stringify(this.inbox)) {
      this.inbox = next;
      this.hooks.onInboxChange();
    }
  }

  private async importRequest(channel: Channel, client: TursoClient, row: RequestRow) {
    await this.setRequest(client, row.id, { status: "importing", message: null });
    const parts = await client.query("SELECT data FROM request_parts WHERE request_id = ? ORDER BY part", [row.id]);
    const data = Buffer.concat(parts.map((part) => Buffer.from(part.data as Uint8Array)));
    const safeName = path.basename(row.file_name).replace(/[^\w.\- ]+/g, "_") || "file.pdf";
    const dir = userDataFile(path.join("inbox", row.id));
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, safeName);
    fs.writeFileSync(file, data);

    const options = parseJson<RequestOptions>(row.options, {});
    const bookId = await this.hooks.importFile(file, options, channel.id);
    const book = readBook(bookId);
    const chapters: RequestChapter[] = (book?.chapters ?? []).map((chapter) => ({
      index: chapter.index,
      title: chapter.title,
      estimatedMinutes: chapter.estimatedMinutes
    }));

    if (options.convertAll) {
      const all = chapters.map((chapter) => chapter.index);
      this.hooks.enqueue(bookId, all);
      await this.setRequest(client, row.id, {
        status: "converting",
        book_id: bookId,
        chapters: JSON.stringify(chapters),
        selection: JSON.stringify(all)
      });
    } else {
      await this.setRequest(client, row.id, { status: "choose", book_id: bookId, chapters: JSON.stringify(chapters) });
    }
    // Il file è sul Mac: i pezzi su Turso non servono più.
    await client.query("DELETE FROM request_parts WHERE request_id = ?", [row.id]);
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  try {
    return value ? (JSON.parse(value) as T) : fallback;
  } catch {
    return fallback;
  }
}

/** Per la vista: canale con il suo stato di caricamento. */
export function channelView(channel: Channel, sync: ChannelSync | undefined): ChannelView {
  return { ...channel, sync: sync?.status ?? { state: "off", message: "Da collegare" } };
}
