import { useEffect, useMemo, useRef, useState } from "react";
import type { AppSnapshot, BookView, ChapterEntry } from "@shared/contracts";
import { BookOpen, Check, Cloud, FolderOpen, Loader2, Pause, Play, Trash2 } from "lucide-react";
import { formatDuration, formatMinutes } from "../lib/format";

export function BookPage({ book, snapshot, onDeleted }: { book: BookView; snapshot: AppSnapshot; onDeleted: () => void }) {
  const [playing, setPlaying] = useState<number | null>(null);
  const [paused, setPaused] = useState(true);
  const [until, setUntil] = useState<number>(() => firstPending(book) ?? 1);
  const audio = useRef<HTMLAudioElement>(null);

  const running = snapshot.queue.running?.bookId === book.id ? snapshot.queue.progress : null;
  const pending = book.chapters.filter((chapter) => chapter.status !== "ready" && !book.queuedChapters.includes(chapter.index));
  const pendingMinutes = pending.reduce((sum, chapter) => sum + chapter.estimatedMinutes, 0);
  const untilChapters = useMemo(
    () => pending.filter((chapter) => chapter.index <= until).map((chapter) => chapter.index),
    [pending, until]
  );

  useEffect(() => {
    setPlaying(null);
    setUntil(firstPending(book) ?? 1);
  }, [book.id]);

  const play = (chapter: ChapterEntry) => {
    const element = audio.current;
    const url = book.chapterUrls[chapter.index];
    if (!element || !url) return;
    if (playing === chapter.index) {
      if (element.paused) void element.play();
      else element.pause();
      return;
    }
    element.src = url;
    void element.play();
    setPlaying(chapter.index);
  };

  const convert = (chapters: number[]) => {
    if (chapters.length) void window.grillo.convert(book.id, chapters);
  };

  const remove = async () => {
    if (!confirm(`Eliminare "${book.title}" dal Mac e da Turso?`)) return;
    audio.current?.pause();
    await window.grillo.deleteBook(book.id);
    onDeleted();
  };

  return (
    <div className="mx-auto max-w-4xl px-10 pb-40">
      <header className="flex gap-6">
        {book.coverUrl ? (
          <img src={book.coverUrl} className="h-48 w-32 shrink-0 rounded-xl object-cover shadow-md" alt="" />
        ) : (
          <div className="flex h-48 w-32 shrink-0 items-center justify-center rounded-xl bg-white shadow-sm">
            <BookOpen size={28} className="text-mute" />
          </div>
        )}
        <div className="flex min-w-0 flex-col">
          <p className="eyebrow">Audiolibro</p>
          <h1 className="mt-1 text-3xl font-semibold leading-tight tracking-tight">{book.title}</h1>
          {book.author && <p className="mt-1 text-mute">{book.author}</p>}
          <p className="mt-3 text-sm text-mute">
            Voce {book.voice.name} · {book.speed.toFixed(1)}× · {book.readyChapters}/{book.chapters.length} capitoli
            pronti{book.totalDuration ? ` · ${formatDuration(book.totalDuration)}` : ""}
          </p>
          <div className="mt-auto flex flex-wrap items-center gap-2 pt-4">
            <button className="btn-accent" disabled={!pending.length} onClick={() => convert(pending.map((c) => c.index))}>
              Converti tutto{pending.length ? ` (${formatMinutes(pendingMinutes)} di audio)` : ""}
            </button>
            <div className="flex items-center gap-1 rounded-full border border-line pl-3">
              <span className="text-sm">Fino al capitolo</span>
              <select
                className="bg-transparent py-2 text-sm outline-none"
                value={until}
                onChange={(event) => setUntil(Number(event.target.value))}
              >
                {book.chapters.map((chapter) => (
                  <option key={chapter.index} value={chapter.index}>
                    {chapter.index}
                  </option>
                ))}
              </select>
              <button className="btn-primary" disabled={!untilChapters.length} onClick={() => convert(untilChapters)}>
                Converti
              </button>
            </div>
            <button className="btn-ghost" onClick={() => void window.grillo.revealBook(book.id)} title="Apri nel Finder">
              <FolderOpen size={15} />
            </button>
            <button className="btn-ghost" onClick={remove} title="Elimina libro">
              <Trash2 size={15} />
            </button>
          </div>
        </div>
      </header>

      <ol className="mt-10 divide-y divide-line rounded-2xl border border-line bg-white">
        {book.chapters.map((chapter) => {
          const runningChapters = snapshot.queue.running?.bookId === book.id ? snapshot.queue.running.chapters : [];
          const isRunning =
            running?.chapterIndex === chapter.index || (!running?.chapterIndex && runningChapters[0] === chapter.index);
          const queued = book.queuedChapters.includes(chapter.index) && !isRunning;
          const ready = chapter.status === "ready";
          const uploaded = book.uploadedChapters.includes(chapter.index);
          return (
            <li key={chapter.index} className="flex items-center gap-4 px-5 py-3">
              <span className="w-8 shrink-0 text-right font-mono text-xs text-mute">{chapter.index}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{chapter.title}</p>
                <p className="text-xs text-mute">
                  {ready ? formatDuration(chapter.duration) : formatMinutes(chapter.estimatedMinutes)}
                  {isRunning && ` · in conversione ${Math.round((running?.chapterProgress ?? 0) * 100)}%`}
                  {queued && " · in coda"}
                </p>
                {isRunning && (
                  <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-black/5">
                    <div
                      className="h-full bg-accent transition-all duration-500"
                      style={{ width: `${Math.round((running?.chapterProgress ?? 0) * 100)}%` }}
                    />
                  </div>
                )}
              </div>
              {ready && (
                <span title={uploaded ? "Caricato su Turso" : "Non ancora su Turso"}>
                  {uploaded ? <Cloud size={15} className="text-ok" /> : <Check size={15} className="text-mute" />}
                </span>
              )}
              {ready ? (
                <button className="btn-ghost w-28" onClick={() => play(chapter)}>
                  {playing === chapter.index && !paused ? <Pause size={14} /> : <Play size={14} />} Ascolta
                </button>
              ) : isRunning ? (
                <span className="btn w-28 text-mute">
                  <Loader2 size={14} className="animate-spin" /> Creo…
                </span>
              ) : queued ? (
                <span className="btn w-28 text-mute">In coda</span>
              ) : (
                <button className="btn-primary w-28" onClick={() => convert([chapter.index])}>
                  Converti
                </button>
              )}
            </li>
          );
        })}
      </ol>

      <audio
        ref={audio}
        controls
        className={`mt-6 w-full ${playing === null ? "hidden" : ""}`}
        onPlay={() => setPaused(false)}
        onPause={() => setPaused(true)}
        onEnded={() => setPlaying(null)}
      />
    </div>
  );
}

function firstPending(book: BookView) {
  return book.chapters.find((chapter) => chapter.status !== "ready")?.index;
}
