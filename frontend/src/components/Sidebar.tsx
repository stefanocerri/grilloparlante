import type { AppSnapshot } from "@shared/contracts";
import { BookOpen, Plus } from "lucide-react";

export type View = { kind: "new" } | { kind: "book"; id: string };

export function Sidebar({
  snapshot,
  view,
  onNavigate
}: {
  snapshot: AppSnapshot;
  view: View;
  onNavigate: (view: View) => void;
}) {
  return (
    <aside className="flex h-full w-72 shrink-0 flex-col border-r border-line bg-panel">
      <div className="drag h-14 shrink-0" />
      <div className="px-5 pb-4">
        <p className="text-xl font-semibold tracking-tight">Grillo parlante</p>
        <p className="text-xs text-mute">Da libri e articoli ad audio</p>
      </div>

      <div className="px-4">
        <button className="btn-primary w-full" onClick={() => onNavigate({ kind: "new" })}>
          <Plus size={16} /> Nuovo libro
        </button>
      </div>

      <p className="eyebrow mt-6 px-5">Libreria</p>
      <nav className="mt-2 flex-1 overflow-y-auto px-2">
        {snapshot.books.length === 0 && <p className="px-3 py-2 text-sm text-mute">Ancora nessun libro.</p>}
        {snapshot.books.map((book) => {
          const active = view.kind === "book" && view.id === book.id;
          const converting = snapshot.queue.running?.bookId === book.id;
          return (
            <button
              key={book.id}
              onClick={() => onNavigate({ kind: "book", id: book.id })}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition ${
                active ? "bg-white shadow-sm" : "hover:bg-black/5"
              }`}
            >
              {book.coverUrl ? (
                <img src={book.coverUrl} className="h-11 w-8 shrink-0 rounded object-cover" alt="" />
              ) : (
                <div className="flex h-11 w-8 shrink-0 items-center justify-center rounded bg-black/5">
                  <BookOpen size={14} className="text-mute" />
                </div>
              )}
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{book.title}</p>
                <p className="text-xs text-mute">
                  {converting ? "In conversione…" : `${book.readyChapters}/${book.chapters.length} capitoli pronti`}
                </p>
              </div>
            </button>
          );
        })}
      </nav>

      <div className="border-t border-line p-3">
        <p className="mt-2 px-3 text-[11px] text-mute">{snapshot.runtime.message}</p>
      </div>
    </aside>
  );
}
