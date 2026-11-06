// Solo sviluppo: sostituisce il ponte Electron quando l'interfaccia gira in un browser normale.
// Legge i libri veri dalla cartella GRILLO_DEMO_LIBRARY e simula la conversione dei capitoli.

import type { AppSnapshot, Book, BookView, ImportRequest, TursoSettings, VoiceInfo } from "@shared/contracts";
import type { GrilloApi } from "../../../electron/preload";

const libraryUrl = (bookId: string, file: string) => `/__demo/library/${encodeURIComponent(bookId)}/${file}`;

export async function installDemoBridge() {
  const data = (await (await fetch("/__demo/books.json")).json()) as {
    books: Book[];
    voices: Omit<VoiceInfo, "previewUrl">[];
    library: string;
  };

  const books = new Map(data.books.map((book) => [book.id, book]));
  // nell'anteprima il primo capitolo torna "da convertire", cosi si puo provare il pulsante Converti
  for (const book of books.values()) {
    const first = book.chapters[0];
    if (first && book.chapters.every((chapter) => chapter.status === "ready")) {
      Object.assign(first, { status: "pending", file: null, duration: null });
      book.readyChapters -= 1;
    }
  }
  const queued = new Map<string, number[]>();
  const listeners = new Set<(snapshot: AppSnapshot) => void>();
  let running: { bookId: string; chapter: number; progress: number } | null = null;
  let turso: TursoSettings = { url: "", writeToken: "", readToken: "", pwaUrl: "https://grilloparlante.vercel.app" };

  const view = (book: Book): BookView => {
    const chapterUrls: Record<number, string> = {};
    for (const chapter of book.chapters) {
      if (chapter.status === "ready" && chapter.file) chapterUrls[chapter.index] = libraryUrl(book.id, chapter.file);
    }
    return {
      ...book,
      coverUrl: book.cover ? libraryUrl(book.id, book.cover) : undefined,
      chapterUrls,
      uploadedChapters: [],
      queuedChapters: queued.get(book.id) ?? []
    };
  };

  const snapshot = (): AppSnapshot => ({
    runtime: { state: "ready", message: "Modalità anteprima: la conversione è simulata.", canInstall: false },
    voices: data.voices.map((voice) => ({ ...voice, previewUrl: `/__demo/voices/${voice.id}.preview.mp3` })),
    books: [...books.values()].map(view),
    queue: {
      running: running ? { bookId: running.bookId, chapters: [running.chapter] } : null,
      pending: [...queued.entries()].map(([bookId, chapters]) => ({ bookId, chapters })),
      progress: running
        ? {
            bookId: running.bookId,
            progress: running.progress,
            label: `Capitolo ${running.chapter} (anteprima)`,
            chapterIndex: running.chapter,
            chapterProgress: running.progress,
            etaSeconds: Math.round((1 - running.progress) * 20)
          }
        : null,
      importing: null,
      lastError: null
    },
    turso,
    sync: { state: "off", message: "Turso non configurato (anteprima)" },
    libraryDir: data.library
  });

  const emit = () => listeners.forEach((listener) => listener(snapshot()));

  const tick = () => {
    if (running) return;
    const next = [...queued.entries()].find(([, chapters]) => chapters.length);
    if (!next) return;
    const [bookId, chapters] = next;
    const chapter = chapters.shift()!;
    if (!chapters.length) queued.delete(bookId);
    running = { bookId, chapter, progress: 0 };
    const timer = setInterval(() => {
      if (!running) return clearInterval(timer);
      running.progress = Math.min(1, running.progress + 0.05);
      if (running.progress >= 1) {
        clearInterval(timer);
        const book = books.get(bookId)!;
        const donor = book.chapters.find((item) => item.status === "ready" && item.file);
        const entry = book.chapters.find((item) => item.index === chapter)!;
        Object.assign(entry, {
          status: "ready",
          file: donor?.file ?? null,
          duration: donor?.duration ?? entry.estimatedMinutes * 60
        });
        book.readyChapters = book.chapters.filter((item) => item.status === "ready").length;
        running = null;
        tick();
      }
      emit();
    }, 1000);
    emit();
  };

  const api: GrilloApi = {
    snapshot: async () => snapshot(),
    onSnapshot: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    installRuntime: async () => undefined,
    pickBook: async () => "libro-di-prova.pdf",
    pathForFile: (file: File) => file.name,
    importBook: async (_request: ImportRequest) => data.books[0]?.id ?? "",
    convert: async (bookId: string, chapters: number[]) => {
      queued.set(bookId, [...new Set([...(queued.get(bookId) ?? []), ...chapters])]);
      emit();
      tick();
    },
    cancelQueue: async () => {
      queued.clear();
      running = null;
      emit();
    },
    revealBook: async () => undefined,
    deleteBook: async (bookId: string) => {
      books.delete(bookId);
      emit();
    },
    saveTurso: async (settings: TursoSettings) => {
      turso = settings;
      emit();
    },
    testTurso: async () => "Anteprima: nessuna connessione reale.",
    syncTurso: async () => undefined,
    tursoQr: async () => null
  };

  window.grillo = api;
}
