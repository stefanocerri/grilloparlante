import { useState } from "react";
import type { AppSnapshot, BookView, ContentKind } from "@shared/contracts";
import { ChevronRight, Cloud, Inbox as Inbox_, Plus } from "lucide-react";
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
  const empty = snapshot.books.length === 0;

  return (
    <div className="flex flex-col gap-3 p-3">
      <JobCard snapshot={snapshot} />
      <Inbox snapshot={snapshot} onOpenBook={onOpenBook} />

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
        className={`group flex items-center gap-3 rounded-lg border border-dashed text-left transition-colors ${
          empty ? "flex-col justify-center px-4 py-10 text-center" : "px-3 py-3"
        } ${dragging ? "border-accent bg-accent/[0.04]" : "border-ink/15 hover:border-ink/30 hover:bg-subtle"}`}
      >
        <span
          className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-line bg-bg transition-colors ${
            dragging ? "text-accent" : "text-mute group-hover:text-ink"
          }`}
        >
          <Plus size={16} />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-medium">{empty ? "Aggiungi il tuo primo libro" : "Aggiungi un file"}</p>
          <p className="text-xs text-mute">Trascinalo qui o sull'icona · PDF, EPUB, TXT, MD, JSON</p>
        </div>
      </button>

      {presentKinds.length > 1 && (
        <div className="flex gap-0.5 overflow-x-auto rounded-md border border-line bg-subtle p-0.5">
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

      {!empty && (
        <ul className="card divide-y divide-line overflow-hidden">
          {books.map((book) => (
            <BookRow key={book.id} book={book} snapshot={snapshot} onOpen={() => onOpenBook(book.id)} />
          ))}
        </ul>
      )}
    </div>
  );
}

const INBOX_LABEL: Record<string, string> = {
  uploaded: "arrivato, lo leggo tra poco",
  importing: "lo sto leggendo…",
  choose: "scegli i capitoli (qui o sul telefono)",
  queued: "in coda",
  converting: "in conversione",
  error: "errore"
};

/** File mandati dalle app e non ancora finiti. */
function Inbox({ snapshot, onOpenBook }: { snapshot: AppSnapshot; onOpenBook: (bookId: string) => void }) {
  if (!snapshot.inbox.length) return null;
  return (
    <div className="card divide-y divide-line overflow-hidden">
      {snapshot.inbox.map((item) => (
        <button
          key={`${item.channelId}-${item.requestId}`}
          disabled={!item.bookId}
          onClick={() => item.bookId && onOpenBook(item.bookId)}
          className="row-hover flex w-full items-center gap-2 px-3 py-2 text-left disabled:cursor-default"
        >
          <Inbox_ size={14} className={item.status === "error" ? "text-danger" : "text-accent"} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium">{item.fileName}</p>
            <p className="truncate text-2xs text-mute">
              da {item.channelName} · {item.status === "error" ? item.message ?? "errore" : INBOX_LABEL[item.status] ?? item.status}
            </p>
          </div>
          {item.bookId && <ChevronRight size={13} className="text-faint" />}
        </button>
      ))}
    </div>
  );
}

function Tab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`h-6 flex-1 shrink-0 rounded px-2.5 text-xs font-medium transition-colors ${
        active ? "bg-bg text-ink shadow-[0_0_0_1px_rgb(var(--line))]" : "text-mute hover:text-ink"
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
  const allUploaded = book.targets.length > 0 && total > 0 && uploaded >= total;
  const targetNames = book.targets.map((id) => snapshot.channels.find((channel) => channel.id === id)?.name ?? id);
  const done = total > 0 && book.readyChapters >= total;

  const status = converting ? (
    <span className="badge-blue">
      <span className="dot h-1.5 w-1.5 animate-pulse bg-accent" /> In corso
    </span>
  ) : done ? (
    <span className="badge-green">Pronto</span>
  ) : book.readyChapters > 0 ? (
    <span className="badge-gray font-mono">
      {book.readyChapters}/{total}
    </span>
  ) : (
    <span className="badge-gray">Da convertire</span>
  );

  return (
    <li>
      <button onClick={onOpen} className="row-hover group flex w-full items-center gap-3 px-3 py-2.5 text-left">
        {book.coverUrl ? (
          <img src={book.coverUrl} className="h-10 w-7 shrink-0 rounded-sm object-cover ring-1 ring-line" alt="" />
        ) : (
          <div className="flex h-10 w-7 shrink-0 items-center justify-center rounded-sm border border-line bg-subtle">
            <Icon size={13} className="text-faint" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{book.title}</p>
          <p className="flex items-center gap-1 truncate text-2xs text-mute">
            {kind.label}
            <span className="text-faint">·</span>
            {book.voice.name}
            <span className="text-faint">·</span>
            <span className="truncate">{targetNames.length ? targetNames.join(", ") : "solo Mac"}</span>
            {allUploaded && (
              <span title="Tutto caricato sulle app" className="ml-0.5 inline-flex">
                <Cloud size={11} className="text-ok" />
              </span>
            )}
          </p>
        </div>
        {status}
        <ChevronRight size={14} className="-mr-1 shrink-0 text-faint transition-transform group-hover:translate-x-0.5" />
      </button>
    </li>
  );
}
