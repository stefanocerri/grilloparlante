import { useEffect, useMemo, useRef, useState } from "react";
import type { AppSnapshot, BookView, ChapterEntry } from "@shared/contracts";
import { BookOpenText, Cloud, ExternalLink, FolderOpen, Loader2, Pause, Play, Trash2 } from "lucide-react";
import { formatDuration, formatMinutes } from "../lib/format";
import { kindOf } from "../lib/kinds";
import { JobCard } from "./JobCard";
import { TargetPicker } from "./Channels";
import { BookInfoPanel, infoLine } from "./BookInfo";

export function BookDetail({ book, snapshot, onDeleted }: { book: BookView; snapshot: AppSnapshot; onDeleted: () => void }) {
  const [playing, setPlaying] = useState<number | null>(null);
  const [paused, setPaused] = useState(true);
  const [until, setUntil] = useState<number>(() => firstPending(book) ?? 1);
  const audio = useRef<HTMLAudioElement>(null);
  const kind = kindOf(book);
  const Icon = kind.icon;

  const running = snapshot.queue.running?.bookId === book.id ? snapshot.queue.progress : null;
  const pending = book.chapters.filter((chapter) => chapter.status !== "ready" && !book.queuedChapters.includes(chapter.index));
  const pendingMinutes = pending.reduce((sum, chapter) => sum + chapter.estimatedMinutes, 0);
  const untilChapters = useMemo(
    () => pending.filter((chapter) => chapter.index <= until).map((chapter) => chapter.index),
    [pending, until]
  );
  const syncOn = book.targets.length > 0;

  useEffect(() => {
    setPlaying(null);
    setUntil(firstPending(book) ?? 1);
  }, [book.id]);

  useEffect(() => () => audio.current?.pause(), []);

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
    const ok = await window.grillo.confirm(
      `Eliminare "${book.title}"?`,
      syncOn ? "Viene tolto dal Mac e dalle app a cui l'avevi mandato." : "Viene tolto dal Mac."
    );
    if (!ok) return;
    audio.current?.pause();
    await window.grillo.deleteBook(book.id);
    onDeleted();
  };

  return (
    <div className="flex flex-col gap-3 p-3">
      <header className="flex gap-3">
        {book.coverUrl ? (
          <img src={book.coverUrl} className="h-24 w-16 shrink-0 rounded object-cover ring-1 ring-line" alt="" />
        ) : (
          <div className="flex h-24 w-16 shrink-0 items-center justify-center rounded border border-line bg-subtle">
            <Icon size={20} className="text-faint" />
          </div>
        )}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center gap-1">
            <span className="badge-gray">{kind.label}</span>
            <span className="flex-1" />
            <button className="icon-btn -my-1" onClick={() => void window.grillo.revealBook(book.id)} title="Apri nel Finder">
              <FolderOpen size={14} />
            </button>
            <button className="icon-btn -my-1 -mr-1 hover:text-danger" onClick={remove} title="Elimina">
              <Trash2 size={14} />
            </button>
          </div>
          <h2 className="mt-1.5 line-clamp-2 text-base font-semibold leading-snug tracking-tight">{book.title}</h2>
          {book.author && <p className="truncate text-xs text-mute">{book.author}</p>}
          {infoLine(book) && <p className="truncate text-2xs text-faint">{infoLine(book)}</p>}
          <p className="mt-auto flex flex-wrap items-center gap-x-1 font-mono text-2xs text-mute">
            <span>{book.voice.name}</span>
            <span className="text-faint">·</span>
            <span>{book.speed.toFixed(1)}×</span>
            <span className="text-faint">·</span>
            <span>
              {book.readyChapters}/{book.chapters.length}
            </span>
            {book.totalDuration ? (
              <>
                <span className="text-faint">·</span>
                <span>{formatDuration(book.totalDuration)}</span>
              </>
            ) : null}
          </p>
        </div>
      </header>

      <button className="btn-secondary w-full" onClick={() => void window.grillo.openLibrary(book.id)}>
        <BookOpenText size={14} /> Leggi e ascolta nella Libreria
      </button>

      {(book.kind ?? "libro") === "libro" || book.kind === "documentazione" ? <BookInfoPanel book={book} /> : null}

      <section className="space-y-2 rounded-lg border border-line bg-subtle p-2.5">
        <div className="flex items-center gap-2">
          <p className="label flex-1">Dove si ascolta</p>
          <button
            className="flex min-w-0 items-center gap-1 font-mono text-2xs text-faint hover:text-ink"
            onClick={() => void window.grillo.revealBook(book.id)}
            title="Copia sul Mac: apri nel Finder"
          >
            <FolderOpen size={11} className="shrink-0" />
            <span className="truncate">…/books/{book.id}</span>
          </button>
        </div>
        <TargetPicker snapshot={snapshot} value={book.targets} onChange={(targets) => void window.grillo.setTargets(book.id, targets)} />
      </section>

      {pending.length > 0 && (
        <div className="flex items-center gap-1.5">
          <button className="btn-primary flex-1" onClick={() => convert(pending.map((c) => c.index))}>
            Converti tutto <span className="font-mono text-xs opacity-60">{formatMinutes(pendingMinutes)}</span>
          </button>
          {pending.length > 2 && (
            <div className="flex h-8 items-center rounded-md border border-line pl-2.5 text-xs text-mute">
              fino al
              <select
                className="bg-transparent px-1 font-mono text-ink outline-none"
                value={until}
                onChange={(event) => setUntil(Number(event.target.value))}
              >
                {book.chapters.map((chapter) => (
                  <option key={chapter.index} value={chapter.index}>
                    {chapter.index}
                  </option>
                ))}
              </select>
              <button
                className="h-full border-l border-line px-2.5 font-medium text-ink hover:bg-subtle disabled:opacity-40"
                disabled={!untilChapters.length}
                onClick={() => convert(untilChapters)}
              >
                Vai
              </button>
            </div>
          )}
        </div>
      )}

      {running && <JobCard snapshot={snapshot} />}

      <ol className="card divide-y divide-line overflow-hidden">
        {book.chapters.map((chapter) => {
          const runningChapters = snapshot.queue.running?.bookId === book.id ? snapshot.queue.running.chapters : [];
          const isRunning =
            running?.chapterIndex === chapter.index || (!running?.chapterIndex && runningChapters[0] === chapter.index);
          const queued = book.queuedChapters.includes(chapter.index) && !isRunning;
          const ready = chapter.status === "ready";
          const uploaded = book.uploadedChapters.includes(chapter.index);
          const progress = Math.round((running?.chapterProgress ?? 0) * 100);
          const current = playing === chapter.index;
          return (
            <li key={chapter.index} className={`flex items-center gap-2.5 px-3 py-2 ${current ? "bg-accent/[0.05]" : ""}`}>
              <span className={`w-5 shrink-0 text-right font-mono text-2xs ${current ? "text-accent" : "text-faint"}`}>
                {String(chapter.index).padStart(2, "0")}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium">{chapter.title}</p>
                <p className="flex items-center gap-1 font-mono text-2xs text-mute">
                  {ready ? formatDuration(chapter.duration) : formatMinutes(chapter.estimatedMinutes)}
                  {isRunning && <span className="text-accent">· {progress}%</span>}
                  {queued && " · in coda"}
                  {chapter.meta?.source && <span className="truncate font-sans">· {chapter.meta.source}</span>}
                  {ready && syncOn && uploaded && <Cloud size={11} className="ml-0.5 shrink-0 text-ok" />}
                </p>
                {isRunning && (
                  <div className="progress mt-1.5 h-0.5">
                    <div style={{ width: `${progress}%` }} />
                  </div>
                )}
              </div>
              {chapter.meta?.url && (
                <a className="icon-btn" href={chapter.meta.url} target="_blank" rel="noreferrer" title="Apri l'originale">
                  <ExternalLink size={13} />
                </a>
              )}
              {ready ? (
                <button className={`icon-btn ${current ? "text-accent" : ""}`} onClick={() => play(chapter)} title="Ascolta">
                  {current && !paused ? <Pause size={13} /> : <Play size={13} />}
                </button>
              ) : isRunning ? (
                <span className="icon-btn text-accent">
                  <Loader2 size={13} className="animate-spin" />
                </span>
              ) : queued ? (
                <span className="badge-gray">in coda</span>
              ) : (
                <button className="btn-secondary btn-sm" onClick={() => convert([chapter.index])}>
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
        className={`w-full ${playing === null ? "hidden" : ""}`}
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
