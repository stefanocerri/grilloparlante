import { RefreshCw } from "lucide-react";
import type { Connection } from "../lib/config";
import { KIND_LABEL, RemoteBook } from "../lib/library";
import { loadPosition } from "../lib/positions";
import { Cover, useCover } from "./Cover";

function BookCard({ connection, book, onOpen }: { connection: Connection; book: RemoteBook; onOpen: () => void }) {
  const cover = useCover(connection, book);
  const position = loadPosition(book.id);
  const total = book.chapters.length;
  return (
    <button onClick={onOpen} className="text-left">
      <Cover url={cover} title={book.title} className="aspect-[2/3] w-full rounded-xl shadow-md" />
      <p className="mt-2 line-clamp-2 text-sm font-semibold leading-tight">{book.title}</p>
      <p className="mt-0.5 text-xs text-mute">
        {book.kind && book.kind !== "libro" ? `${KIND_LABEL[book.kind]} · ` : ""}
        {position ? `Parte ${position.chapter} di ${total}` : `${book.readyChapters}/${total} pronti`}
      </p>
    </button>
  );
}

export function Library({
  connection,
  books,
  refreshing,
  error,
  onRefresh,
  onOpen,
  onResume
}: {
  connection: Connection;
  books: RemoteBook[];
  refreshing: boolean;
  error: string | null;
  onRefresh: () => void;
  onOpen: (book: RemoteBook) => void;
  onResume: (book: RemoteBook) => void;
}) {
  const recent = books
    .map((book) => ({ book, position: loadPosition(book.id) }))
    .filter((item) => item.position)
    .sort((a, b) => (b.position!.updatedAt ?? 0) - (a.position!.updatedAt ?? 0))[0];

  return (
    <div className="safe-top px-5 pb-40">
      <header className="flex items-center justify-between">
        <h1 className="text-3xl font-semibold tracking-tight">Libreria</h1>
        <button onClick={onRefresh} className="rounded-full p-2 text-mute active:bg-black/5" aria-label="Aggiorna">
          <RefreshCw size={20} className={refreshing ? "animate-spin" : ""} />
        </button>
      </header>
      {error && <p className="mt-3 rounded-xl bg-orange-50 p-3 text-sm text-[#c2410c]">{error}</p>}

      {recent && (
        <ContinueCard connection={connection} book={recent.book} chapter={recent.position!.chapter} onResume={() => onResume(recent.book)} />
      )}

      {books.length === 0 && !refreshing && (
        <p className="mt-10 text-center text-mute">Nessun libro ancora. Convertine uno dall'app sul Mac.</p>
      )}
      <div className="mt-6 grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3">
        {books.map((book) => (
          <BookCard key={book.id} connection={connection} book={book} onOpen={() => onOpen(book)} />
        ))}
      </div>
    </div>
  );
}

function ContinueCard({ connection, book, chapter, onResume }: { connection: Connection; book: RemoteBook; chapter: number; onResume: () => void }) {
  const cover = useCover(connection, book);
  const title = book.chapters.find((item) => item.index === chapter)?.title ?? `Capitolo ${chapter}`;
  return (
    <button onClick={onResume} className="mt-5 flex w-full items-center gap-4 rounded-2xl bg-night p-3 text-left text-[#f4f1eb]">
      <Cover url={cover} title={book.title} className="h-20 w-14 shrink-0 rounded-lg" />
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-accent">Continua ad ascoltare</p>
        <p className="truncate font-semibold">{book.title}</p>
        <p className="truncate text-sm opacity-70">{title}</p>
      </div>
    </button>
  );
}
