import fs from "node:fs";
import path from "node:path";
import type { Book, SyncStatus, TursoSettings } from "../shared/contracts";
import { AUDIO_PART_BYTES, TURSO_SCHEMA, TursoClient } from "../shared/turso";
import { bookDir, listBooks, readBook } from "./library";
import { readJson, userDataFile, writeJson } from "./paths";

interface BookSyncRecord {
  chapters: Record<string, number>; // indice -> dimensione MP3 caricata
  coverUploaded: boolean;
  metaUpdatedAt: string;
}

type SyncLedger = Record<string, BookSyncRecord>;

const RETRY_MS = 5 * 60 * 1000;

/**
 * Carica su Turso i capitoli pronti, uno alla volta, poi la scheda del libro.
 * La PWA legge solo la scheda: un capitolo compare sul telefono quando il suo audio e gia tutto su.
 */
export class TursoSync {
  status: SyncStatus = { state: "off", message: "Turso non configurato" };

  private ledgerFile = userDataFile("turso-sync.json");

  private ledger: SyncLedger = readJson<SyncLedger>(this.ledgerFile, {});

  private schemaReady = false;

  private queue = new Set<string>();

  private working = false;

  private retryTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly settings: () => TursoSettings,
    private readonly onChange: () => void
  ) {}

  configured() {
    const { url, writeToken } = this.settings();
    return Boolean(url.trim() && writeToken.trim());
  }

  uploadedChapters(bookId: string): number[] {
    return Object.keys(this.ledger[bookId]?.chapters ?? {}).map(Number);
  }

  /** Da chiamare dopo aver cambiato URL o token. */
  reset() {
    this.schemaReady = false;
    this.ledger = {};
    writeJson(this.ledgerFile, this.ledger);
    this.syncAll();
  }

  syncAll() {
    for (const book of listBooks()) this.queue.add(book.id);
    void this.drain();
  }

  syncBook(bookId: string) {
    this.queue.add(bookId);
    void this.drain();
  }

  async deleteBook(bookId: string) {
    delete this.ledger[bookId];
    writeJson(this.ledgerFile, this.ledger);
    if (!this.configured()) return;
    await this.client().batch([
      { sql: "DELETE FROM chapter_audio WHERE book_id = ?", args: [bookId] },
      { sql: "DELETE FROM books WHERE id = ?", args: [bookId] }
    ]);
  }

  async testConnection(): Promise<string> {
    await this.ensureSchema();
    const rows = await this.client().query("SELECT COUNT(*) AS n FROM books");
    const count = Number(rows[0]?.n ?? 0);
    return `Collegato: ${count} ${count === 1 ? "libro" : "libri"} su Turso.`;
  }

  private client() {
    const { url, writeToken } = this.settings();
    return new TursoClient(url, writeToken);
  }

  private setStatus(status: SyncStatus) {
    this.status = status;
    this.onChange();
  }

  private async ensureSchema() {
    if (this.schemaReady) return;
    await this.client().batch(TURSO_SCHEMA);
    this.schemaReady = true;
  }

  private async drain() {
    if (this.working) return;
    if (!this.configured()) {
      this.queue.clear();
      this.setStatus({ state: "off", message: "Turso non configurato" });
      return;
    }

    this.working = true;
    try {
      await this.ensureSchema();
      while (this.queue.size) {
        const bookId = this.queue.values().next().value as string;
        this.queue.delete(bookId);
        const book = readBook(bookId);
        if (book) await this.uploadBook(book);
      }
      this.setStatus({ state: "idle", message: "Tutto caricato su Turso" });
    } catch (error) {
      this.setStatus({ state: "error", message: `Caricamento su Turso non riuscito: ${(error as Error).message}` });
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

  /** Scheda per la PWA: solo i capitoli gia caricati risultano "ready". */
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
          parts: uploaded ? Math.ceil(uploaded / AUDIO_PART_BYTES) : 0
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
