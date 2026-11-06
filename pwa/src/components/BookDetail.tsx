import { useEffect, useState } from "react";
import { ArrowLeft, CheckCircle2, Download, Loader2, Pause, Play } from "lucide-react";
import type { Connection } from "../lib/config";
import { chapterAudio, isDownloaded, RemoteBook } from "../lib/library";
import { usePlayer } from "../lib/player";
import { formatLength, loadPosition } from "../lib/positions";
import { Cover, useCover } from "./Cover";

export function BookDetail({ connection, book, onBack }: { connection: Connection; book: RemoteBook; onBack: () => void }) {
  const cover = useCover(connection, book);
  const player = usePlayer();
  const [downloaded, setDownloaded] = useState<Set<number>>(new Set());
  const [downloading, setDownloading] = useState<Record<number, number>>({});
  const position = loadPosition(book.id);
  const ready = book.chapters.filter((chapter) => chapter.status === "ready");
  const isCurrent = player.book?.id === book.id;

  const refreshDownloaded = async () => {
    const flags = await Promise.all(ready.map(async (chapter) => [chapter.index, await isDownloaded(book.id, chapter)] as const));
    setDownloaded(new Set(flags.filter(([, flag]) => flag).map(([index]) => index)));
  };

  useEffect(() => {
    void refreshDownloaded();
  }, [book.id, book.updatedAt, player.chapter?.index]);

  const downloadAll = async () => {
    for (const chapter of ready) {
      if (downloaded.has(chapter.index)) continue;
      setDownloading((current) => ({ ...current, [chapter.index]: 0 }));
      try {
        await chapterAudio(connection, book.id, chapter, (fraction) =>
          setDownloading((current) => ({ ...current, [chapter.index]: fraction }))
        );
      } finally {
        setDownloading((current) => {
          const next = { ...current };
          delete next[chapter.index];
          return next;
        });
        await refreshDownloaded();
      }
    }
  };

  const mainLabel = isCurrent && player.playing
    ? "Pausa"
    : position
      ? `Continua · capitolo ${position.chapter}`
      : "Inizia ad ascoltare";

  return (
    <div className="pb-40">
      <div className="safe-top bg-gradient-to-b from-[#e9e3d8] to-[#f4f1eb] px-5 pb-6">
        <button onClick={onBack} className="-ml-2 rounded-full p-2 active:bg-black/5" aria-label="Indietro">
          <ArrowLeft size={22} />
        </button>
        <div className="mt-2 flex flex-col items-center text-center">
          <Cover url={cover} title={book.title} className="h-64 w-44 rounded-xl shadow-xl" />
          <h1 className="mt-5 text-2xl font-semibold leading-tight tracking-tight">{book.title}</h1>
          {book.author && <p className="mt-1 text-mute">{book.author}</p>}
          <p className="mt-2 text-xs text-mute">
            Voce {book.voice.name} · {formatLength(book.totalDuration)} · {book.readyChapters}/{book.chapters.length} capitoli
          </p>
        </div>
        <button
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-accent py-3.5 font-semibold text-white disabled:opacity-40"
          disabled={!ready.length}
          onClick={() => (isCurrent && player.playing ? player.toggle() : void player.play(book, undefined, cover))}
        >
          {isCurrent && player.playing ? <Pause size={18} /> : <Play size={18} />} {mainLabel}
        </button>
        <button
          className="mt-2 flex w-full items-center justify-center gap-2 rounded-full border border-line py-3 text-sm font-medium disabled:opacity-40"
          disabled={!ready.length || ready.every((chapter) => downloaded.has(chapter.index)) || Object.keys(downloading).length > 0}
          onClick={() => void downloadAll()}
        >
          <Download size={16} />
          {ready.length && ready.every((chapter) => downloaded.has(chapter.index)) ? "Tutto disponibile offline" : "Scarica per ascoltare offline"}
        </button>
      </div>

      <ol className="px-2">
        {book.chapters.map((chapter) => {
          const available = chapter.status === "ready";
          const current = isCurrent && player.chapter?.index === chapter.index;
          const progress = downloading[chapter.index] ?? (current && player.loading !== null ? player.loading : null);
          return (
            <li key={chapter.index}>
              <button
                disabled={!available}
                onClick={() => void player.play(book, chapter.index, cover)}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left active:bg-black/5 disabled:active:bg-transparent ${
                  current ? "bg-white" : ""
                }`}
              >
                <span className={`w-7 shrink-0 text-right font-mono text-xs ${current ? "text-accent" : "text-mute"}`}>
                  {chapter.index}
                </span>
                <div className={`min-w-0 flex-1 ${available ? "" : "opacity-40"}`}>
                  <p className={`truncate text-[15px] ${current ? "font-semibold" : ""}`}>{chapter.title}</p>
                  <p className="text-xs text-mute">
                    {available ? formatLength(chapter.duration) : "Non ancora convertito"}
                    {position?.chapter === chapter.index && !current ? " · eri arrivato qui" : ""}
                  </p>
                </div>
                {progress !== null ? (
                  <span className="flex items-center gap-1 text-xs text-mute">
                    <Loader2 size={14} className="animate-spin" /> {Math.round(progress * 100)}%
                  </span>
                ) : downloaded.has(chapter.index) ? (
                  <CheckCircle2 size={16} className="text-[#1d8b5d]" aria-label="Disponibile offline" />
                ) : null}
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
