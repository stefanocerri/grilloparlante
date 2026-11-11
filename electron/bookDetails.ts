import fs from "node:fs";
import path from "node:path";
import type { Book, BookInfo, BookInfoEdit, InfoLookup, InfoSource, OnlineMatch } from "../shared/contracts";
import { readJson, writeJson } from "./paths";

/**
 * books/<id>/info.json: informazioni trovate online e correzioni a mano.
 * Sta fuori da book.json perché quello lo riscrive il backend Python durante la conversione:
 * così una correzione fatta mentre converte non va persa.
 */
export interface BookDetails {
  /** Libro scelto online (automaticamente o dall'utente). */
  online?: OnlineMatch;
  /** Campi corretti a mano: vincono su tutto. Stringa vuota = campo tolto. */
  manual?: BookInfoEdit;
  /** Copertina scaricata (cover.online.jpg) e copertina scelta a mano (cover.manual.<ext>). */
  onlineCover?: string;
  manualCover?: string;
  lookup?: InfoLookup;
  updatedAt?: string;
}

const INFO_KEYS = ["publisher", "publishedDate", "language", "isbn", "description", "subjects", "pages"] as const;

export function detailsFile(dir: string) {
  return path.join(dir, "info.json");
}

export function readDetails(dir: string): BookDetails {
  return readJson<BookDetails>(detailsFile(dir), {});
}

/** touch = false per i cambi che non toccano i dati del libro (stato della ricerca): non serve ricaricarlo sulle app. */
export function writeDetails(dir: string, patch: Partial<BookDetails>, touch = true) {
  const current = readDetails(dir);
  const next = { ...current, ...patch, updatedAt: touch ? new Date().toISOString() : current.updatedAt };
  for (const key of Object.keys(next) as (keyof BookDetails)[]) {
    if (next[key] === undefined) delete next[key];
  }
  writeJson(detailsFile(dir), next);
  return next;
}

function present(value: unknown) {
  if (Array.isArray(value)) return value.length > 0;
  return value !== undefined && value !== null && String(value).trim() !== "";
}

/**
 * Libro come lo vede l'app: per ogni campo vince la correzione a mano, poi
 * - titolo e autore: quelli trovati online (i metadati dei PDF sono spesso sbagliati), poi quelli del file;
 * - gli altri campi: quelli del file, poi quelli online;
 * - copertina: a mano, poi quella del file, poi quella online, poi la prima pagina.
 */
export function mergeDetails(book: Book, dir: string, options: { ignoreManual?: boolean } = {}): Book {
  const details = readDetails(dir);
  const manual = options.ignoreManual ? {} : details.manual ?? {};
  const online = details.online;
  const fileInfo = book.info ?? {};
  const sources: Record<string, InfoSource> = {};
  const info: BookInfo = {};

  const pick = <T>(key: string, candidates: [T | undefined, InfoSource][]): T | undefined => {
    if (key in manual) {
      const value = (manual as Record<string, unknown>)[key] as T;
      if (present(value)) sources[key] = "manual";
      return present(value) ? value : undefined;
    }
    for (const [value, source] of candidates) {
      if (present(value)) {
        sources[key] = source;
        return value;
      }
    }
    return undefined;
  };

  const title = pick<string>("title", [[online?.title, "online"], [book.title, "file"]]) ?? book.title;
  const author = pick<string>("author", [[online?.author, "online"], [book.author, "file"]]) ?? "";

  for (const key of INFO_KEYS) {
    const value = pick(key, [
      [fileInfo[key], "file"],
      [online?.[key], "online"]
    ]);
    if (value !== undefined) (info as Record<string, unknown>)[key] = value;
  }

  let cover = book.cover;
  const exists = (file?: string) => Boolean(file && fs.existsSync(path.join(dir, file)));
  if (!options.ignoreManual && exists(details.manualCover)) {
    cover = details.manualCover!;
    sources.cover = "manual";
  } else if (book.cover && !book.coverFromPage) {
    sources.cover = "file";
  } else if (exists(details.onlineCover)) {
    cover = details.onlineCover!;
    sources.cover = "online";
  }

  const updatedAt = details.updatedAt && details.updatedAt > (book.updatedAt || "") ? details.updatedAt : book.updatedAt;

  return {
    ...book,
    title,
    author,
    cover,
    info,
    infoSources: sources,
    lookup: details.lookup,
    fileTitle: book.title,
    fileAuthor: book.author,
    updatedAt
  };
}

