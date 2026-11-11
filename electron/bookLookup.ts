import fs from "node:fs";
import path from "node:path";
import type { Book, BookInfoEdit, OnlineMatch } from "../shared/contracts";
import { mergeDetails, readDetails, writeDetails } from "./bookDetails";
import { bookDir, readRawBook } from "./library";

/**
 * Informazioni sul libro da internet, senza chiavi né account:
 * Google Books (https://developers.google.com/books) e Open Library (https://openlibrary.org/developers/api).
 * Si mandano solo titolo, autore e ISBN del libro: niente testo, niente dati dell'utente.
 */

const TIMEOUT_MS = 10_000;
const HEADERS = { "User-Agent": "GrilloParlante/0.1 (app personale per audiolibri)", Accept: "application/json" };
/** Sotto questa somiglianza un risultato non si applica da solo: resta da scegliere a mano. */
const AUTO_SCORE = 0.75;

export interface LookupQuery {
  title?: string;
  author?: string;
  isbn?: string;
  /** Testo libero, come in un motore di ricerca. */
  text?: string;
}

async function getJson<T>(url: string): Promise<T | null> {
  const response = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`${new URL(url).host} risponde ${response.status}`);
  return (await response.json()) as T;
}

// --- Somiglianza -----------------------------------------------------------------

const STOPWORDS = new Set(
  "il lo la i gli le un uno una di da del della dei degli delle e ed a al alla in nel nella con per su the of and a an to in on de la le les et der die das und el los las y".split(" ")
);

function words(value: string | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((word) => word.length > 1 && !STOPWORDS.has(word));
}

/** Parole in comune (Dice) tra due titoli: 1 = stesse parole. */
function similarity(a: string | undefined, b: string | undefined) {
  const left = new Set(words(a));
  const right = new Set(words(b));
  if (!left.size || !right.size) return 0;
  let common = 0;
  for (const word of left) if (right.has(word)) common += 1;
  return (2 * common) / (left.size + right.size);
}

function score(match: OnlineMatch, query: LookupQuery) {
  if (query.isbn && match.isbn && cleanIsbn(match.isbn) === cleanIsbn(query.isbn)) return 1;
  const target = query.title || query.text;
  // Il titolo trovato può avere un sottotitolo che nel file manca (o viceversa).
  let value = Math.max(similarity(match.title, target), similarity(`${match.title} ${match.subtitle ?? ""}`, target));
  if (query.author && match.author) {
    const sameAuthor = similarity(match.author, query.author) > 0 || words(query.author).some((word) => words(match.author).includes(word));
    value += sameAuthor ? 0.15 : -0.3;
  }
  return Math.max(0, Math.min(0.99, value));
}

export function cleanIsbn(value: string) {
  return value.replace(/[^0-9Xx]/g, "").toUpperCase();
}

// --- Google Books ----------------------------------------------------------------

interface GoogleVolume {
  id: string;
  volumeInfo?: {
    title?: string;
    subtitle?: string;
    authors?: string[];
    publisher?: string;
    publishedDate?: string;
    description?: string;
    industryIdentifiers?: { type: string; identifier: string }[];
    pageCount?: number;
    categories?: string[];
    language?: string;
    imageLinks?: { thumbnail?: string; smallThumbnail?: string };
    canonicalVolumeLink?: string;
    infoLink?: string;
  };
}

function fromGoogle(volume: GoogleVolume): OnlineMatch | null {
  const info = volume.volumeInfo;
  if (!info?.title) return null;
  const ids = info.industryIdentifiers ?? [];
  const isbn = ids.find((id) => id.type === "ISBN_13")?.identifier ?? ids.find((id) => id.type === "ISBN_10")?.identifier;
  const thumb = info.imageLinks?.thumbnail ?? info.imageLinks?.smallThumbnail;
  return {
    provider: "google",
    id: volume.id,
    title: info.title,
    subtitle: info.subtitle,
    author: info.authors?.join(", "),
    publisher: info.publisher,
    publishedDate: info.publishedDate,
    description: info.description ? stripHtml(info.description) : undefined,
    isbn,
    pages: info.pageCount || undefined,
    subjects: info.categories,
    language: info.language,
    coverUrl: thumb ? thumb.replace(/^http:/, "https:").replace("&edge=curl", "") : undefined,
    link: info.canonicalVolumeLink ?? info.infoLink
  };
}

async function searchGoogle(query: LookupQuery): Promise<OnlineMatch[]> {
  let q: string;
  if (query.isbn) q = `isbn:${cleanIsbn(query.isbn)}`;
  else if (query.text) q = query.text;
  else if (query.title) q = [`intitle:${query.title}`, query.author ? `inauthor:${query.author}` : ""].filter(Boolean).join(" ");
  else return [];
  const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q)}&maxResults=8&printType=books`;
  const data = await getJson<{ items?: GoogleVolume[] }>(url);
  return (data?.items ?? []).map(fromGoogle).filter((match): match is OnlineMatch => Boolean(match));
}

// --- Open Library ----------------------------------------------------------------

interface OpenLibraryDoc {
  key: string;
  title?: string;
  subtitle?: string;
  author_name?: string[];
  publisher?: string[];
  first_publish_year?: number;
  isbn?: string[];
  language?: string[];
  subject?: string[];
  cover_i?: number;
  number_of_pages_median?: number;
}

interface OpenLibraryEdition {
  title?: string;
  subtitle?: string;
  authors?: { name: string }[];
  publishers?: { name: string }[];
  publish_date?: string;
  number_of_pages?: number;
  subjects?: { name: string }[];
  cover?: { large?: string; medium?: string };
  identifiers?: { isbn_13?: string[]; isbn_10?: string[] };
  url?: string;
  key?: string;
}

async function searchOpenLibrary(query: LookupQuery): Promise<OnlineMatch[]> {
  if (query.isbn) {
    const isbn = cleanIsbn(query.isbn);
    const data = await getJson<Record<string, OpenLibraryEdition>>(
      `https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&format=json&jscmd=data`
    );
    const edition = data?.[`ISBN:${isbn}`];
    if (!edition?.title) return [];
    return [
      {
        provider: "openlibrary",
        id: edition.key ?? isbn,
        title: edition.title,
        subtitle: edition.subtitle,
        author: edition.authors?.map((author) => author.name).join(", "),
        publisher: edition.publishers?.[0]?.name,
        publishedDate: edition.publish_date,
        pages: edition.number_of_pages,
        subjects: edition.subjects?.slice(0, 8).map((subject) => subject.name),
        isbn: edition.identifiers?.isbn_13?.[0] ?? isbn,
        coverUrl: edition.cover?.large ?? edition.cover?.medium,
        link: edition.url
      }
    ];
  }

  const params = new URLSearchParams({
    limit: "8",
    fields: "key,title,subtitle,author_name,publisher,first_publish_year,isbn,language,subject,cover_i,number_of_pages_median"
  });
  if (query.text) params.set("q", query.text);
  else if (query.title) {
    params.set("title", query.title);
    if (query.author) params.set("author", query.author);
  } else return [];
  const data = await getJson<{ docs?: OpenLibraryDoc[] }>(`https://openlibrary.org/search.json?${params}`);
  return (data?.docs ?? [])
    .filter((doc) => doc.title)
    .map((doc) => ({
      provider: "openlibrary" as const,
      id: doc.key,
      title: doc.title!,
      subtitle: doc.subtitle,
      author: doc.author_name?.slice(0, 3).join(", "),
      publisher: doc.publisher?.[0],
      publishedDate: doc.first_publish_year ? String(doc.first_publish_year) : undefined,
      isbn: doc.isbn?.find((value) => value.length === 13) ?? doc.isbn?.[0],
      language: doc.language?.[0],
      subjects: doc.subject?.slice(0, 8),
      pages: doc.number_of_pages_median,
      coverUrl: doc.cover_i ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg` : undefined,
      link: `https://openlibrary.org${doc.key}`
    }));
}

/** Descrizione dell'opera su Open Library (la ricerca non la restituisce). */
async function openLibraryDescription(match: OnlineMatch) {
  if (match.provider !== "openlibrary" || !match.id.startsWith("/works/")) return undefined;
  const work = await getJson<{ description?: string | { value?: string } }>(`https://openlibrary.org${match.id}.json`).catch(() => null);
  const value = typeof work?.description === "string" ? work.description : work?.description?.value;
  return value ? value.replace(/\r/g, "").trim() : undefined;
}

// --- Ricerca ---------------------------------------------------------------------

function stripHtml(value: string) {
  return value
    .replace(/<\s*(br|\/p)\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

/** Completa i campi mancanti del primo con quelli del secondo (stesso libro da due servizi). */
function combine(primary: OnlineMatch, extra: OnlineMatch | undefined): OnlineMatch {
  if (!extra) return primary;
  const result: OnlineMatch = { ...primary };
  for (const [key, value] of Object.entries(extra)) {
    const current = (result as unknown as Record<string, unknown>)[key];
    if ((current === undefined || current === "" || (Array.isArray(current) && !current.length)) && value !== undefined) {
      (result as unknown as Record<string, unknown>)[key] = value;
    }
  }
  return result;
}

/**
 * Cerca su Google Books e Open Library insieme. Con l'ISBN i due risultati sono lo stesso libro e si uniscono;
 * altrimenti escono tutti, ordinati per somiglianza. Se un servizio non risponde basta l'altro.
 */
export async function searchOnline(query: LookupQuery): Promise<OnlineMatch[]> {
  const settled = await Promise.allSettled([searchGoogle(query), searchOpenLibrary(query)]);
  const [google, openLibrary] = settled.map((result) => (result.status === "fulfilled" ? result.value : []));
  if (settled.every((result) => result.status === "rejected")) {
    throw new Error("Google Books e Open Library non rispondono: sei collegato a internet?");
  }

  if (query.isbn) {
    // Tutti e due cercano proprio quell'ISBN: è lo stesso libro, si uniscono i dati.
    const best = google[0] ? combine(google[0], openLibrary[0]) : openLibrary[0];
    return best ? [{ ...best, isbn: cleanIsbn(query.isbn), score: 1 }] : [];
  }

  const all = [...google, ...openLibrary].map((match) => ({ ...match, score: score(match, query) }));
  // Lo stesso libro trovato da tutti e due: tengo quello di Google (ha la descrizione) completato con Open Library.
  const unique: OnlineMatch[] = [];
  for (const match of all.sort((a, b) => (b.score ?? 0) - (a.score ?? 0))) {
    const twin = unique.find(
      (other) => other.provider !== match.provider && similarity(other.title, match.title) > 0.9 && similarity(other.author, match.author) > 0.5
    );
    if (twin) Object.assign(twin, combine(twin, match));
    else unique.push(match);
  }
  return unique.slice(0, 8);
}

/** Cosa cercare per un libro: ISBN se c'è, altrimenti titolo e autore (quelli corretti a mano hanno la precedenza). */
export function queryFor(book: Book, manual: BookInfoEdit = {}): LookupQuery {
  const isbn = manual.isbn ?? book.info?.isbn;
  return {
    title: manual.title || book.title,
    author: manual.author ?? book.author ?? undefined,
    isbn: isbn ? cleanIsbn(isbn) : undefined
  };
}

/** Scarica la copertina trovata online in cover.online.jpg. */
async function downloadCover(dir: string, url: string) {
  const response = await fetch(url, { headers: { "User-Agent": HEADERS["User-Agent"] }, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!response.ok) return undefined;
  const type = response.headers.get("content-type") ?? "";
  const data = Buffer.from(await response.arrayBuffer());
  // Open Library risponde con un'immagine di 1×1 pixel (43 byte) se la copertina non c'è.
  if (!type.startsWith("image/") || data.length < 1500) return undefined;
  const file = type.includes("png") ? "cover.online.png" : "cover.online.jpg";
  for (const old of ["cover.online.png", "cover.online.jpg"]) fs.rmSync(path.join(dir, old), { force: true });
  fs.writeFileSync(path.join(dir, file), data);
  return file;
}

/** Usa un libro trovato online: completa la descrizione se manca e scarica la copertina. */
export async function applyMatch(bookId: string, match: OnlineMatch) {
  const dir = bookDir(bookId);
  let full = match;
  if (!full.description) full = { ...full, description: await openLibraryDescription(full) };
  // Con l'ISBN la copertina grande di Open Library è migliore della miniatura di Google.
  const covers = [
    full.isbn ? `https://covers.openlibrary.org/b/isbn/${cleanIsbn(full.isbn)}-L.jpg?default=false` : undefined,
    full.coverUrl
  ].filter((url): url is string => Boolean(url));
  let onlineCover: string | undefined;
  for (const url of covers) {
    onlineCover = await downloadCover(dir, url).catch(() => undefined);
    if (onlineCover) break;
  }
  writeDetails(dir, {
    online: full,
    onlineCover: onlineCover ?? readDetails(dir).onlineCover,
    lookup: { state: "found", message: `Da ${full.provider === "google" ? "Google Books" : "Open Library"}`, at: new Date().toISOString() }
  });
}

/** Solo libri e documenti: articoli e notiziari hanno già le loro informazioni nel JSON. */
export function canLookup(book: Book) {
  return (book.kind ?? "libro") === "libro" || book.kind === "documentazione";
}

/**
 * Ricerca automatica (dopo l'importazione): applica il risultato solo se è sicuramente lo stesso libro
 * (stesso ISBN, o titolo e autore molto simili). Non tocca mai i campi corretti a mano.
 */
export async function autoLookup(bookId: string, onChange: () => void) {
  const book = readRawBook(bookId);
  if (!book || !canLookup(book)) return;
  const dir = bookDir(bookId);
  const details = readDetails(dir);
  writeDetails(dir, { lookup: { state: "searching" } }, false);
  onChange();
  try {
    const query = queryFor(book, details.manual);
    let matches = await searchOnline(query);
    // L'ISBN trovato nel testo può essere di un'altra edizione o sbagliato: riprovo con il titolo.
    if (!matches.length && query.isbn) matches = await searchOnline({ ...query, isbn: undefined });
    const best = matches[0];
    if (best && (best.score ?? 0) >= AUTO_SCORE) {
      await applyMatch(bookId, best);
    } else {
      writeDetails(
        dir,
        {
          lookup: {
            state: "not-found",
            message: matches.length ? "Trovati libri simili: scegli quello giusto" : "Nessun risultato online",
            at: new Date().toISOString()
          }
        },
        false
      );
    }
  } catch (error) {
    writeDetails(dir, { lookup: { state: "error", message: (error as Error).message, at: new Date().toISOString() } }, false);
  }
  onChange();
}

/** Coda delle ricerche automatiche: una alla volta, con una pausa, per non stressare i servizi gratuiti. */
export class LookupQueue {
  private pending: string[] = [];
  private running = false;

  constructor(private onChange: (bookId: string) => void) {}

  add(bookId: string) {
    if (!this.pending.includes(bookId)) this.pending.push(bookId);
    void this.next();
  }

  private async next() {
    if (this.running) return;
    const bookId = this.pending.shift();
    if (!bookId) return;
    this.running = true;
    try {
      await autoLookup(bookId, () => this.onChange(bookId));
    } finally {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      this.running = false;
      void this.next();
    }
  }
}

/** Libri mai cercati online (importati prima di questa funzione o con la ricerca spenta). */
export function needsLookup(book: Book) {
  const lookup = readDetails(bookDir(book.id)).lookup;
  // "searching" rimasto da una sessione chiusa a metà ricerca.
  return canLookup(book) && (!lookup || lookup.state === "searching");
}

/** Correzioni a mano: si salva solo ciò che è diverso da quello trovato in automatico. */
export function saveManual(bookId: string, edit: BookInfoEdit) {
  const dir = bookDir(bookId);
  const raw = readRawBook(bookId);
  if (!raw) throw new Error("Libro non trovato");
  const auto = mergeDetails(raw, dir, { ignoreManual: true });
  const automatic: BookInfoEdit = { title: auto.title, author: auto.author, ...auto.info };
  const manual: BookInfoEdit = { ...(readDetails(dir).manual ?? {}) };
  for (const [key, raw] of Object.entries(edit) as [keyof BookInfoEdit, unknown][]) {
    const value = Array.isArray(raw) ? raw.map((item) => String(item).trim()).filter(Boolean) : String(raw ?? "").trim();
    const auto = automatic[key];
    const same = JSON.stringify(value) === JSON.stringify(auto ?? (Array.isArray(value) ? [] : ""));
    if (same) delete manual[key];
    else (manual as Record<string, unknown>)[key] = key === "isbn" && typeof value === "string" ? cleanIsbn(value) : value;
  }
  writeDetails(dir, { manual: Object.keys(manual).length ? manual : undefined });
}

/** Copertina scelta a mano (un'immagine dal Mac). */
export function setManualCover(bookId: string, imagePath: string) {
  const dir = bookDir(bookId);
  const ext = path.extname(imagePath).toLowerCase().replace(".jpeg", ".jpg");
  if (![".jpg", ".png", ".webp"].includes(ext)) throw new Error("Scegli un'immagine JPG, PNG o WebP.");
  const old = readDetails(dir).manualCover;
  if (old) fs.rmSync(path.join(dir, old), { force: true });
  const file = `cover.manual${ext}`;
  fs.copyFileSync(imagePath, path.join(dir, file));
  writeDetails(dir, { manualCover: file });
}

/** Torna alle informazioni automatiche: via le correzioni a mano e la copertina scelta. */
export function resetManual(bookId: string) {
  const dir = bookDir(bookId);
  const old = readDetails(dir).manualCover;
  if (old) fs.rmSync(path.join(dir, old), { force: true });
  writeDetails(dir, { manual: undefined, manualCover: undefined });
}

/** Dimentica il libro trovato online (era sbagliato). */
export function clearOnline(bookId: string) {
  const dir = bookDir(bookId);
  const old = readDetails(dir).onlineCover;
  if (old) fs.rmSync(path.join(dir, old), { force: true });
  writeDetails(dir, {
    online: undefined,
    onlineCover: undefined,
    lookup: { state: "not-found", message: "Tolto il libro trovato online", at: new Date().toISOString() }
  });
}
