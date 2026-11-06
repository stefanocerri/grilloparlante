import type { AppSnapshot } from "@shared/contracts";
import { X } from "lucide-react";
import { formatEta } from "../lib/format";

export function JobBar({ snapshot }: { snapshot: AppSnapshot }) {
  const { running, progress, pending, lastError } = snapshot.queue;

  if (!running && lastError) {
    return (
      <div className="flex items-center gap-3 border-t border-line bg-orange-50 px-6 py-3 text-sm text-warn">
        <span className="flex-1">{lastError}</span>
      </div>
    );
  }
  if (!running) return null;

  const book = snapshot.books.find((item) => item.id === running.bookId);
  const queuedChapters = pending.reduce((sum, item) => sum + item.chapters.length, 0);
  const percent = Math.round((progress?.progress ?? 0) * 100);

  return (
    <div className="border-t border-line bg-white px-6 py-3">
      <div className="flex items-center gap-4">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">
            {book?.title ?? "Conversione"} — {progress?.label ?? "Avvio…"}
          </p>
          <p className="text-xs text-mute">
            {percent}% · tempo rimanente {formatEta(progress?.etaSeconds)}
            {queuedChapters ? ` · poi altri ${queuedChapters} capitoli in coda` : ""}
          </p>
        </div>
        <button className="btn-ghost" onClick={() => void window.grillo.cancelQueue()}>
          <X size={14} /> Ferma
        </button>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-black/5">
        <div className="h-full bg-accent transition-all duration-500" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}
