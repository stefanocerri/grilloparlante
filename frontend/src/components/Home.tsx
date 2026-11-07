import { useState } from "react";
import type { AppSnapshot, BookView, ContentKind } from "@shared/contracts";
import { Cloud, Upload } from "lucide-react";
import { KINDS, kindOf } from "../lib/kinds";
import { JobCard } from "./JobCard";

type Filter = "all" | ContentKind;

export function Home({
  snapshot,
  onPickFile,
  onOpenBook
}: {
  snapshot: AppSnapshot;
  onPickFile: (filePath: string) => void;
  onOpenBook: (bookId: string) => void;
}) {
  const [dragging, setDragging] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");

  const presentKinds = KINDS.filter((kind) => snapshot.books.some((book) => kindOf(book).id === kind.id));
  const books = snapshot.books.filter((book) => filter === "all" || kindOf(book).id === filter);

  return (
    <div className="flex flex-col gap-3 p-3">
      <JobCard snapshot={snapshot} />

      <button
        onClick={async () => {
          const file = await window.grillo.pickBook();
          if (file) onPickFile(file);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          const file = event.dataTransfer.files[0];
          if (file) onPickFile(window.grillo.pathForFile(file));
        }}
        className={`flex items-center gap-3 rounded-xl border-2 border-dashed px-3 py-3 text-left transition ${
          dragging ? "border-accent bg-white" : "border-line hover:border-ink/40 hover:bg-white/60"
        }`}
      >
        <Upload size={18} className="shrink-0 text-mute" />
        <div className="min-w-0">
          <p className="text-sm font-medium">Trascina un file qui o sull'icona</p>
          <p className="text-[11px] text-mute">PDF, EPUB, TXT, MD o articoli JSON · oppure clicca</p>
        </div>
      </button>

      {presentKinds.length > 1 && (
        <div className="flex gap-1 overflow-x-auto">
          <Tab active={filter === "all"} onClick={() => setFilter("all")}>
            Tutto
          </Tab>
          {presentKinds.map((kind) => (
            <Tab key={kind.id} active={filter === kind.id} onClick={() => setFilter(kind.id)}>
              {kind.plural}
            </Tab>
          ))}
        </div>
      )}

      {snapshot.books.length === 0 ? (
        <p className="px-1 py-6 text-center text-xs text-mute">Ancora niente in libreria.</p>
      ) : (
        <ul className="card divide-y divide-line">
          {books.map((book) => (
            <BookRow key={book.id} book={book} snapshot={snapshot} onOpen={() => onOpenBook(book.id)} />
          ))}
        </ul>
      )}
    </div>
  );
}

function Tab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 rounded-full px-3 py-1 text-xs transition ${
        active ? "bg-ink text-paper" : "text-mute hover:bg-black/5"
      }`}
    >
      {children}
    </button>
  );
}

function BookRow({ book, snapshot, onOpen }: { book: BookView; snapshot: AppSnapshot; onOpen: () => void }) {
  const kind = kindOf(book);
  const Icon = kind.icon;
  const converting = snapshot.queue.running?.bookId === book.id;
  const total = book.chapters.length;
  const uploaded = book.uploadedChapters.length;
  const allUploaded = snapshot.sync.state !== "off" && total > 0 && uploaded >= total;

  return (
    <li>
      <button onClick={onOpen} className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-black/[0.03]">
        {book.coverUrl ? (
          <img src={book.coverUrl} className="h-11 w-8 shrink-0 rounded object-cover shadow-sm" alt="" />
        ) : (
          <div className="flex h-11 w-8 shrink-0 items-center justify-center rounded bg-black/5">
            <Icon size={15} className="text-mute" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{book.title}</p>
          <p className="truncate text-[11px] text-mute">
            {kind.label} ·{" "}
            {converting
              ? "in conversione…"
              : total === 1
                ? book.readyChapters
                  ? "pronto"
                  : "da convertire"
                : `${book.readyChapters}/${total} pronti`}{" "}
            · {book.voice.name}
          </p>
        </div>
        {allUploaded && (
          <span title="Tutto su Turso">
            <Cloud size={14} className="shrink-0 text-ok" />
          </span>
        )}
      </button>
    </li>
  );
}
