// Client minimo per l'API HTTP di Turso (protocollo Hrana v2, /v2/pipeline).
// Senza dipendenze: funziona in Node (Electron) e nel browser (le PWA di ascolto).

export type SqlValue = string | number | bigint | null | Uint8Array;

export interface SqlStatement {
  sql: string;
  args?: SqlValue[];
}

export type Row = Record<string, SqlValue>;

type HranaValue =
  | { type: "null" }
  | { type: "integer"; value: string }
  | { type: "float"; value: number }
  | { type: "text"; value: string }
  | { type: "blob"; base64: string };

export function tursoHttpUrl(url: string): string {
  const trimmed = url.trim().replace(/\/+$/, "");
  return trimmed.replace(/^libsql:\/\//, "https://");
}

function toBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64");
  }
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  if (typeof Buffer !== "undefined") {
    return new Uint8Array(Buffer.from(value, "base64"));
  }
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function encode(value: SqlValue): HranaValue {
  if (value === null || value === undefined) return { type: "null" };
  if (value instanceof Uint8Array) return { type: "blob", base64: toBase64(value) };
  if (typeof value === "bigint") return { type: "integer", value: value.toString() };
  if (typeof value === "number") {
    return Number.isInteger(value) ? { type: "integer", value: String(value) } : { type: "float", value };
  }
  return { type: "text", value: String(value) };
}

function decode(value: HranaValue): SqlValue {
  switch (value.type) {
    case "null":
      return null;
    case "integer":
      return Number(value.value);
    case "float":
      return value.value;
    case "text":
      return value.value;
    case "blob":
      return fromBase64(value.base64);
  }
}

export class TursoClient {
  private readonly endpoint: string;

  constructor(url: string, private readonly token: string) {
    this.endpoint = `${tursoHttpUrl(url)}/v2/pipeline`;
  }

  /** Esegue le istruzioni in ordine nella stessa richiesta e restituisce le righe di ciascuna. */
  async batch(statements: SqlStatement[]): Promise<Row[][]> {
    const requests = [
      ...statements.map((statement) => ({
        type: "execute",
        stmt: { sql: statement.sql, args: (statement.args ?? []).map(encode) }
      })),
      { type: "close" }
    ];

    const response = await fetch(this.endpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ requests })
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`Turso ${response.status}: ${text.slice(0, 300) || response.statusText}`);
    }

    const body = (await response.json()) as {
      results: Array<
        | { type: "ok"; response: { type: string; result?: { cols: { name: string }[]; rows: HranaValue[][] } } }
        | { type: "error"; error: { message: string } }
      >;
    };

    return body.results.slice(0, statements.length).map((result) => {
      if (result.type === "error") {
        throw new Error(`Turso: ${result.error.message}`);
      }
      const data = result.response.result;
      if (!data) return [];
      return data.rows.map((row) =>
        Object.fromEntries(row.map((value, column) => [data.cols[column].name, decode(value)]))
      );
    });
  }

  async query(sql: string, args: SqlValue[] = []): Promise<Row[]> {
    const [rows] = await this.batch([{ sql, args }]);
    return rows;
  }
}

/**
 * Schema condiviso: l'app Mac scrive, le PWA leggono.
 * `books.json` e il book.json completo (con kind, meta dei capitoli, date); i capitoli risultano
 * "ready" solo quando tutto il loro audio e in `chapter_audio`. Il testo letto dalla voce sta in `chapter_text`
 * (testo semplice, paragrafi separati da una riga vuota; idx = index del capitolo), fuori da `books.json` per
 * tenerlo leggero: le app lo leggono capitolo per capitolo. Filtrare per tipo:
 *   SELECT json FROM books WHERE json_extract(json, '$.kind') = 'notiziario'
 */
export const TURSO_SCHEMA: SqlStatement[] = [
  {
    sql: `CREATE TABLE IF NOT EXISTS books (
      id TEXT PRIMARY KEY,
      json TEXT NOT NULL,
      cover BLOB,
      cover_mime TEXT,
      updated_at TEXT NOT NULL
    )`
  },
  {
    sql: `CREATE TABLE IF NOT EXISTS chapter_audio (
      book_id TEXT NOT NULL,
      idx INTEGER NOT NULL,
      part INTEGER NOT NULL,
      data BLOB NOT NULL,
      PRIMARY KEY (book_id, idx, part)
    )`
  },
  {
    sql: `CREATE TABLE IF NOT EXISTS chapter_text (
      book_id TEXT NOT NULL,
      idx INTEGER NOT NULL,
      text TEXT NOT NULL,
      PRIMARY KEY (book_id, idx)
    )`
  }
];

/** Dimensione dei pezzi di audio salvati su Turso (una riga per pezzo). */
export const AUDIO_PART_BYTES = 512 * 1024;
