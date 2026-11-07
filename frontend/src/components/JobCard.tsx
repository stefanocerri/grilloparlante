import type { AppSnapshot } from "@shared/contracts";
import { AlertTriangle, Square } from "lucide-react";
import { formatEta } from "../lib/format";

/** Conversione in corso (o ultimo errore), in cima al pannello. */
export function JobCard({ snapshot }: { snapshot: AppSnapshot }) {
  const { running, progress, pending, lastError, importing } = snapshot.queue;

  if (importing) {
    return (
      <div className="card flex items-center gap-3 px-3 py-2.5 text-xs">
        <span className="h-2 w-2 animate-pulse rounded-full bg-accent" />
        <span className="truncate">Leggo {importing} e cerco i capitoli…</span>
      </div>
    );
  }

  if (!running && lastError) {
    return (
      <div className="flex items-start gap-2 rounded-xl bg-orange-50 px-3 py-2.5 text-xs text-warn">
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
    <div className="card px-3 py-2.5">
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium">{book?.title ?? "Conversione"}</p>
          <p className="truncate text-[11px] text-mute">{progress?.label ?? "Avvio del motore voce…"}</p>
        </div>
        <span className="font-mono text-xs tabular-nums">{percent}%</span>
        <button className="icon-btn" title="Ferma" onClick={() => void window.grillo.cancelQueue()}>
          <Square size={12} />
        </button>
      </div>
      <div className="mt-2 h-1 overflow-hidden rounded-full bg-black/5">
        <div className="h-full bg-accent transition-all duration-500" style={{ width: `${percent}%` }} />
      </div>
      <p className="mt-1.5 text-[11px] text-mute">
        {formatEta(progress?.etaSeconds)}
        {queued ? ` · poi altri ${queued} capitoli` : ""}
      </p>
    </div>
  );
}
