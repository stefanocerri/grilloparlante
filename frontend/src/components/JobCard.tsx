import type { AppSnapshot } from "@shared/contracts";
import { AlertTriangle, Square } from "lucide-react";
import { formatEta } from "../lib/format";
import { Spinner } from "./ui";

/** Conversione in corso (o ultimo errore), in cima al pannello. */
export function JobCard({ snapshot }: { snapshot: AppSnapshot }) {
  const { running, progress, pending, lastError, importing } = snapshot.queue;

  if (importing) {
    return (
      <div className="card flex items-center gap-2.5 px-3 py-2.5 text-xs">
        <Spinner size={13} className="text-accent" />
        <span className="truncate">Leggo {importing} e cerco i capitoli…</span>
      </div>
    );
  }

  if (!running && lastError) {
    return (
      <div className="note-error flex items-start gap-2">
        <AlertTriangle size={14} className="mt-px shrink-0" />
        <span>{lastError}</span>
      </div>
    );
  }
  if (!running) return null;

  const book = snapshot.books.find((item) => item.id === running.bookId);
  const queued = pending.reduce((sum, item) => sum + item.chapters.length, 0);
  const percent = Math.round((progress?.progress ?? 0) * 100);

  return (
    <div className="card p-3">
      <div className="flex items-center gap-2">
        <span className="badge-blue">
          <span className="dot h-1.5 w-1.5 animate-pulse bg-accent" /> In corso
        </span>
        <p className="min-w-0 flex-1 truncate text-sm font-medium">{book?.title ?? "Conversione"}</p>
        <span className="font-mono text-xs tabular-nums text-mute">{percent}%</span>
        <button className="icon-btn -mr-1" title="Ferma" onClick={() => void window.grillo.cancelQueue()}>
          <Square size={11} />
        </button>
      </div>
      <div className="progress mt-2.5">
        <div style={{ width: `${percent}%` }} />
      </div>
      <p className="mt-2 flex gap-1 truncate text-2xs text-mute">
        <span className="truncate">{progress?.label ?? "Avvio del motore voce…"}</span>
        <span className="text-faint">·</span>
        <span className="shrink-0">
          {formatEta(progress?.etaSeconds)}
          {queued ? ` · poi altri ${queued}` : ""}
        </span>
      </p>
    </div>
  );
}
