import { useEffect, useMemo, useRef, useState } from "react";
import type { AppSnapshot, BookView, ChapterEntry } from "@shared/contracts";
import {
  BookOpen,
  FolderOpen,
  Minus,
  Pause,
  Play,
  Plus,
  Search,
  SkipBack,
  SkipForward,
  RotateCcw,
  RotateCw
} from "lucide-react";
import { formatDuration } from "../lib/format";
import { kindOf } from "../lib/kinds";
import { useSnapshot } from "../lib/useSnapshot";
import { TargetPicker } from "./Channels";
import { Mark, Spinner } from "./ui";

type Filter = "all" | "mac" | string;
const SPEEDS = [0.8, 1, 1.2, 1.5, 1.75, 2];

function bookFromHash() {
  const match = /^#library=(.+)$/.exec(window.location.hash);
  return match ? decodeURIComponent(match[1]) : null;
}

/** Finestra Libreria: archivio a sinistra, libro (capitoli + testo) a destra, player in basso. */
export function LibraryWindow() {
  const snapshot = useSnapshot();
  const [selected, setSelected] = useState<string | null>(bookFromHash);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");

  useEffect(() => {
    const off = window.grillo.onLibraryShow(setSelected);
    return () => off();
  }, []);

  const books = useMemo(() => {
    if (!snapshot) return [];
    const needle = query.trim().toLowerCase();
    return snapshot.books.filter((book) => {
      if (filter === "mac" && book.targets.length) return false;
      if (filter !== "all" && filter !== "mac" && !book.targets.includes(filter)) return false;
      return !needle || `${book.title} ${book.author}`.toLowerCase().includes(needle);
    });
  }, [snapshot, filter, query]);

  if (!snapshot) return <div className="h-full bg-bg" />;
  const book = snapshot.books.find((item) => item.id === selected) ?? books[0];

  return (
    <div className="flex h-full">
      <aside className="flex w-72 shrink-0 flex-col border-r border-line bg-subtle">
        {/* Spazio per i pulsanti della finestra (titleBarStyle hiddenInset) e zona per trascinarla. */}
        <div className="flex h-12 shrink-0 items-center justify-end gap-2 px-3 [-webkit-app-region:drag]">
          <Mark size={18} />
          <p className="text-sm font-semibold">Libreria</p>
        </div>
        <div className="space-y-2 px-3 pb-3">
          <label className="relative block">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-faint" />
            <input className="input pl-8" placeholder="Cerca titolo o autore" value={query} onChange={(event) => setQuery(event.target.value)} />
          </label>
          <div className="flex flex-wrap gap-1">
            <Chip active={filter === "all"} onClick={() => setFilter("all")}>
              Tutto · {snapshot.books.length}
            </Chip>
            <Chip active={filter === "mac"} onClick={() => setFilter("mac")}>
              Solo Mac
            </Chip>
            {snapshot.channels.map((channel) => (
              <Chip key={channel.id} active={filter === channel.id} onClick={() => setFilter(channel.id)}>
                {channel.name}
              </Chip>
            ))}
          </div>
        </div>
        <ul className="min-h-0 flex-1 overflow-y-auto border-t border-line">
          {books.map((item) => {
            const kind = kindOf(item);
            const Icon = kind.icon;
            const active = item.id === book?.id;
            return (
              <li key={item.id}>
                <button
                  onClick={() => setSelected(item.id)}
                  className={`flex w-full items-center gap-3 border-b border-line px-3 py-2.5 text-left transition-colors ${
                    active ? "bg-bg" : "hover:bg-ink/[0.03]"
                  }`}
                >
                  {item.coverUrl ? (
                    <img src={item.coverUrl} className="h-11 w-8 shrink-0 rounded-sm object-cover ring-1 ring-line" alt="" />
                  ) : (
                    <span className="flex h-11 w-8 shrink-0 items-center justify-center rounded-sm border border-line bg-bg">
                      <Icon size={13} className="text-faint" />
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className={`truncate text-sm ${active ? "font-semibold" : "font-medium"}`}>{item.title}</p>
                    <p className="truncate text-2xs text-mute">
                      {item.readyChapters}/{item.chapters.length} pronti · {item.targets.length ? item.targets.join(", ") : "solo Mac"}
                    </p>
                  </div>
                </button>
              </li>
            );
          })}
          {!books.length && <li className="px-3 py-8 text-center text-xs text-mute">Nessun libro.</li>}
        </ul>
        <button
          className="flex h-9 shrink-0 items-center gap-2 border-t border-line px-3 text-left font-mono text-2xs text-faint hover:text-ink"
          onClick={() => void window.grillo.revealLibrary()}
          title="Apri la cartella nel Finder"
        >
          <FolderOpen size={12} className="shrink-0" />
          <span className="truncate">{snapshot.libraryDir}/books</span>
        </button>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        <div className="h-3 shrink-0 [-webkit-app-region:drag]" />
        {book ? <Reader key={book.id} book={book} snapshot={snapshot} /> : <Empty />}
      </main>
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`h-6 rounded-md border px-2 text-2xs font-medium transition-colors ${
        active ? "border-ink bg-ink text-bg" : "border-line bg-bg text-mute hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

function Empty() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center text-mute">
      <BookOpen size={22} />
      <p className="text-sm">La libreria è vuota.</p>
      <p className="text-xs">Trascina un PDF o un EPUB sull'icona nella barra dei menu.</p>
    </div>
  );
}

const pad = (index: number) => String(index).padStart(3, "0");

function textUrl(book: BookView, chapter: ChapterEntry) {
  return `grillo://library/${encodeURIComponent(book.id)}/text/${pad(chapter.index)}.txt`;
}

function useChapterText(book: BookView, chapter: ChapterEntry | undefined) {
  const [text, setText] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!chapter) return;
    let alive = true;
    setLoading(true);
    fetch(textUrl(book, chapter))
      .then((response) => (response.ok ? response.text() : null))
      .catch(() => null)
      .then((value) => {
        if (!alive) return;
        setText(value);
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [book.id, chapter?.index]);
  return { text, loading };
}

interface Position {
  index: number;
  time: number;
}

const positionKey = (bookId: string) => `pos:${bookId}`;

function loadPosition(bookId: string): Position | null {
  try {
    return JSON.parse(localStorage.getItem(positionKey(bookId)) ?? "null");
  } catch {
    return null;
  }
}

/** Libro aperto: intestazione, capitoli, testo del capitolo scelto e player. */
function Reader({ book, snapshot }: { book: BookView; snapshot: AppSnapshot }) {
  const saved = loadPosition(book.id);
  const [current, setCurrent] = useState<number>(saved?.index ?? book.chapters[0]?.index ?? 1);
  const [fontSize, setFontSize] = useState<number>(() => Number(localStorage.getItem("readerFont") ?? 17));
  const chapter = book.chapters.find((item) => item.index === current) ?? book.chapters[0];
  const { text, loading } = useChapterText(book, chapter);
  const kind = kindOf(book);
  const Icon = kind.icon;
  const textRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    localStorage.setItem("readerFont", String(fontSize));
  }, [fontSize]);
  useEffect(() => {
    textRef.current?.scrollTo({ top: 0 });
  }, [current]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex shrink-0 gap-4 border-b border-line px-6 pb-4 pt-2">
        {book.coverUrl ? (
          <img src={book.coverUrl} className="h-24 w-16 shrink-0 rounded object-cover ring-1 ring-line" alt="" />
        ) : (
          <span className="flex h-24 w-16 shrink-0 items-center justify-center rounded border border-line bg-subtle">
            <Icon size={20} className="text-faint" />
          </span>
        )}
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="badge-gray self-start">{kind.label}</span>
          <h1 className="truncate text-xl font-semibold tracking-tight">{book.title}</h1>
          {book.author && <p className="truncate text-sm text-mute">{book.author}</p>}
          <p className="mt-auto font-mono text-2xs text-mute">
            {book.voice.name} · {book.readyChapters}/{book.chapters.length} capitoli pronti
            {book.totalDuration ? ` · ${formatDuration(book.totalDuration)}` : ""}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <TargetPicker snapshot={snapshot} value={book.targets} onChange={(targets) => void window.grillo.setTargets(book.id, targets)} />
          <button className="btn-ghost btn-sm" onClick={() => void window.grillo.revealBook(book.id)}>
            <FolderOpen size={13} /> Apri nel Finder
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <ol className="w-64 shrink-0 overflow-y-auto border-r border-line">
          {book.chapters.map((item) => {
            const active = item.index === chapter?.index;
            const ready = item.status === "ready";
            return (
              <li key={item.index}>
                <button
                  onClick={() => setCurrent(item.index)}
                  className={`flex w-full items-start gap-2.5 border-b border-line px-4 py-2.5 text-left transition-colors ${
                    active ? "bg-accent/[0.06]" : "hover:bg-ink/[0.03]"
                  }`}
                >
                  <span className={`mt-px font-mono text-2xs ${active ? "text-accent" : "text-faint"}`}>{pad(item.index).slice(1)}</span>
                  <div className="min-w-0 flex-1">
                    <p className={`line-clamp-2 text-xs ${active ? "font-semibold" : "font-medium"}`}>{item.title}</p>
                    <p className="font-mono text-2xs text-mute">
                      {ready ? formatDuration(item.duration) : book.queuedChapters.includes(item.index) ? "in coda" : "solo testo"}
                    </p>
                  </div>
                </button>
              </li>
            );
          })}
        </ol>

        <div ref={textRef} className="relative min-w-0 flex-1 overflow-y-auto">
          <div className="sticky top-0 z-10 flex justify-end gap-1 bg-gradient-to-b from-bg via-bg/90 to-transparent px-4 pb-4 pt-3">
            <button className="icon-btn border border-line bg-bg" title="Testo più piccolo" onClick={() => setFontSize((value) => Math.max(13, value - 1))}>
              <Minus size={13} />
            </button>
            <button className="icon-btn border border-line bg-bg" title="Testo più grande" onClick={() => setFontSize((value) => Math.min(26, value + 1))}>
              <Plus size={13} />
            </button>
          </div>
          <article className="mx-auto max-w-[68ch] px-8 pb-24" style={{ fontSize, lineHeight: 1.75 }}>
            <h2 className="mb-6 text-[1.4em] font-semibold leading-tight tracking-tight">{chapter?.title}</h2>
            {loading ? (
              <Spinner className="text-faint" />
            ) : text ? (
              text.split(/\n{2,}/).map((paragraph, i) => (
                <p key={i} className="mb-[1em] select-text text-ink/90">
                  {paragraph}
                </p>
              ))
            ) : (
              <p className="text-sm text-mute">Il testo di questo capitolo non è disponibile.</p>
            )}
          </article>
        </div>
      </div>

      <Player book={book} chapter={chapter} onChapter={setCurrent} />
    </div>
  );
}

/** Player in basso: riprende da dove eri, ±30 s, velocità, capitolo precedente/successivo. */
function Player({ book, chapter, onChapter }: { book: BookView; chapter?: ChapterEntry; onChapter: (index: number) => void }) {
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [speed, setSpeed] = useState<number>(() => Number(localStorage.getItem("readerSpeed") ?? 1));
  const autoplay = useRef(false);
  const url = chapter ? book.chapterUrls[chapter.index] : undefined;
  const readyChapters = book.chapters.filter((item) => book.chapterUrls[item.index]);
  const position = readyChapters.findIndex((item) => item.index === chapter?.index);

  useEffect(() => {
    const element = audio.current;
    if (!element) return;
    setTime(0);
    setDuration(0);
    if (!url) {
      element.removeAttribute("src");
      setPlaying(false);
      return;
    }
    element.src = url;
    element.playbackRate = speed;
    const saved = loadPosition(book.id);
    if (saved && saved.index === chapter?.index) element.currentTime = saved.time;
    if (autoplay.current) void element.play();
  }, [url]);

  useEffect(() => {
    if (audio.current) audio.current.playbackRate = speed;
    localStorage.setItem("readerSpeed", String(speed));
  }, [speed]);

  const save = (seconds: number) => {
    if (chapter) localStorage.setItem(positionKey(book.id), JSON.stringify({ index: chapter.index, time: seconds }));
  };

  const go = (offset: number) => {
    const next = readyChapters[position + offset];
    if (!next) return;
    autoplay.current = playing || offset > 0;
    onChapter(next.index);
  };

  const toggle = () => {
    const element = audio.current;
    if (!element || !url) return;
    if (element.paused) void element.play();
    else element.pause();
  };

  const seek = (delta: number) => {
    if (audio.current) audio.current.currentTime = Math.max(0, Math.min(duration, audio.current.currentTime + delta));
  };

  return (
    <footer className="flex h-16 shrink-0 items-center gap-4 border-t border-line bg-subtle px-6">
      <audio
        ref={audio}
        onPlay={() => setPlaying(true)}
        onPause={() => {
          setPlaying(false);
          save(audio.current?.currentTime ?? 0);
        }}
        onTimeUpdate={(event) => {
          const seconds = event.currentTarget.currentTime;
          setTime(seconds);
          if (Math.floor(seconds) % 5 === 0) save(seconds);
        }}
        onLoadedMetadata={(event) => setDuration(event.currentTarget.duration)}
        onEnded={() => {
          save(0);
          autoplay.current = true;
          go(1);
        }}
      />
      <div className="flex items-center gap-1">
        <button className="icon-btn" title="Capitolo precedente" disabled={position <= 0} onClick={() => go(-1)}>
          <SkipBack size={15} />
        </button>
        <button className="icon-btn" title="Indietro di 30 secondi" disabled={!url} onClick={() => seek(-30)}>
          <RotateCcw size={15} />
        </button>
        <button
          className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-ink text-bg transition-colors hover:bg-ink/85 disabled:opacity-30"
          disabled={!url}
          onClick={toggle}
          title={playing ? "Pausa" : "Ascolta"}
        >
          {playing ? <Pause size={15} /> : <Play size={15} className="ml-0.5" />}
        </button>
        <button className="icon-btn" title="Avanti di 30 secondi" disabled={!url} onClick={() => seek(30)}>
          <RotateCw size={15} />
        </button>
        <button className="icon-btn" title="Capitolo successivo" disabled={position < 0 || position >= readyChapters.length - 1} onClick={() => go(1)}>
          <SkipForward size={15} />
        </button>
      </div>

      <div className="flex min-w-0 flex-1 items-center gap-3">
        <span className="w-12 text-right font-mono text-2xs text-mute">{clock(time)}</span>
        <input
          type="range"
          min={0}
          max={duration || 0}
          step={1}
          value={Math.min(time, duration || 0)}
          disabled={!url}
          onChange={(event) => {
            if (audio.current) audio.current.currentTime = Number(event.target.value);
          }}
          className="h-1 min-w-0 flex-1 cursor-pointer accent-[rgb(var(--accent))]"
        />
        <span className="w-12 font-mono text-2xs text-mute">{clock(duration)}</span>
      </div>

      <p className="hidden max-w-[220px] truncate text-xs text-mute lg:block">
        {url ? chapter?.title : "Questo capitolo non è ancora stato convertito"}
      </p>

      <select
        className="h-7 rounded-md border border-line bg-bg px-1.5 font-mono text-xs outline-none"
        value={speed}
        onChange={(event) => setSpeed(Number(event.target.value))}
        title="Velocità"
      >
        {SPEEDS.map((value) => (
          <option key={value} value={value}>
            {value}×
          </option>
        ))}
      </select>
    </footer>
  );
}

function clock(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0:00";
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}
