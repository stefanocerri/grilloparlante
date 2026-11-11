import fs from "node:fs";
import path from "node:path";
import type { Book, BookView } from "../shared/contracts";
import { mergeDetails } from "./bookDetails";
import { libraryDir, readJson } from "./paths";

export function bookDir(bookId: string) {
  return path.join(libraryDir(), "books", bookId);
}

/** book.json così come l'ha scritto il backend (titolo e autore letti dal file). */
export function readRawBook(bookId: string): Book | null {
  return readJson<Book | null>(path.join(bookDir(bookId), "book.json"), null);
}

/** Libro con le informazioni trovate online e le correzioni a mano (info.json). */
export function readBook(bookId: string): Book | null {
  const book = readRawBook(bookId);
  return book ? mergeDetails(book, bookDir(bookId)) : null;
}

export function listBooks(): Book[] {
  const root = path.join(libraryDir(), "books");
  return fs
    .readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => readBook(entry.name))
    .filter((book): book is Book => Boolean(book))
    .sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
}

export function mediaUrl(bookId: string, file: string) {
  return `grillo://library/${encodeURIComponent(bookId)}/${file.split("/").map(encodeURIComponent).join("/")}`;
}

export function toView(
  book: Book,
  extra: { uploaded: number[]; targets: string[]; queued: number[]; running: number[] }
): BookView {
  const chapterUrls: Record<number, string> = {};
  const chapters = book.chapters.map((chapter) => {
    if (chapter.status === "ready" && chapter.file) {
      chapterUrls[chapter.index] = `${mediaUrl(book.id, chapter.file)}?v=${chapter.size ?? 0}`;
    }
    // "converting" rimasto da una sessione interrotta: torna "pending" se non sta girando
    if (chapter.status === "converting" && !extra.running.includes(chapter.index)) {
      return { ...chapter, status: "pending" as const };
    }
    return chapter;
  });

  return {
    ...book,
    chapters,
    coverUrl: book.cover ? `${mediaUrl(book.id, book.cover)}?v=${encodeURIComponent(book.updatedAt || "")}` : undefined,
    chapterUrls,
    targets: extra.targets,
    uploadedChapters: extra.uploaded,
    queuedChapters: extra.queued
  };
}

export function deleteBook(bookId: string) {
  const dir = bookDir(bookId);
  if (path.dirname(dir) !== path.join(libraryDir(), "books")) throw new Error("Percorso non valido");
  fs.rmSync(dir, { recursive: true, force: true });
}
