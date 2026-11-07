import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { Connection } from "./config";
import { chapterAudio, RemoteBook, RemoteChapter } from "./library";
import { loadPosition, savePosition } from "./positions";

export const SPEEDS = [0.8, 1, 1.2, 1.5, 1.75, 2];

export type Sleep = { kind: "minutes"; until: number } | { kind: "chapter" } | null;

interface PlayerValue {
  book: RemoteBook | null;
  chapter: RemoteChapter | null;
  coverUrl: string | null;
  playing: boolean;
  time: number;
  duration: number;
  rate: number;
  loading: number | null;
  error: string | null;
  sleep: Sleep;
  play: (book: RemoteBook, chapterIndex?: number, coverUrl?: string | null) => Promise<void>;
  toggle: () => void;
  seek: (time: number) => void;
  skip: (delta: number) => void;
  next: () => void;
  previous: () => void;
  cycleRate: () => void;
  setSleep: (sleep: Sleep) => void;
}

const PlayerContext = createContext<PlayerValue | null>(null);

export function usePlayer() {
  const value = useContext(PlayerContext);
  if (!value) throw new Error("usePlayer fuori dal PlayerProvider");
  return value;
}

function readyChapters(book: RemoteBook) {
  return book.chapters.filter((chapter) => chapter.status === "ready");
}

export function PlayerProvider({ connection, children }: { connection: Connection; children: ReactNode }) {
  const audio = useMemo(() => {
    const element = new Audio();
    element.preload = "auto";
    return element;
  }, []);
  const objectUrl = useRef<string | null>(null);
  const lastSaved = useRef(0);

  const [book, setBook] = useState<RemoteBook | null>(null);
  const [chapter, setChapter] = useState<RemoteChapter | null>(null);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [rate, setRate] = useState<number>(() => Number(localStorage.getItem("grillo:rate")) || 1);
  const [loading, setLoading] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sleep, setSleep] = useState<Sleep>(null);

  const state = useRef({ book, chapter });
  state.current = { book, chapter };
  const sleepRef = useRef<Sleep>(sleep);
  sleepRef.current = sleep;

  const play = useCallback(
    async (target: RemoteBook, chapterIndex?: number, cover?: string | null) => {
      const saved = loadPosition(target.id);
      const index = chapterIndex ?? saved?.chapter ?? readyChapters(target)[0]?.index;
      const entry = target.chapters.find((item) => item.index === index && item.status === "ready");
      if (!entry) return;

      const resumeAt = saved && saved.chapter === entry.index && chapterIndex === undefined ? saved.time : 0;
      audio.pause();
      setBook(target);
      setChapter(entry);
      if (cover !== undefined) setCoverUrl(cover);
      setError(null);
      setTime(resumeAt);
      setDuration(entry.duration ?? 0);
      setLoading(0);

      try {
        const blob = await chapterAudio(connection, target.id, entry, setLoading);
        if (state.current.chapter?.index !== entry.index || state.current.book?.id !== target.id) return;
        if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
        objectUrl.current = URL.createObjectURL(blob);
        audio.src = objectUrl.current;
        audio.playbackRate = rate;
        audio.currentTime = resumeAt;
        setLoading(null);
        await audio.play();
        savePosition(target.id, entry.index, resumeAt);

        // scarica in anticipo il capitolo successivo, cosi il passaggio e immediato anche offline
        const following = readyChapters(target).find((item) => item.index > entry.index);
        if (following) void chapterAudio(connection, target.id, following).catch(() => undefined);
      } catch (failure) {
        setLoading(null);
        setError(navigator.onLine ? `Audio non disponibile: ${(failure as Error).message}` : "Sei offline e questo capitolo non è scaricato.");
      }
    },
    [audio, connection, rate]
  );

  const step = useCallback(
    (direction: 1 | -1) => {
      const { book: current, chapter: currentChapter } = state.current;
      if (!current || !currentChapter) return;
      const list = readyChapters(current);
      const position = list.findIndex((item) => item.index === currentChapter.index);
      const target = list[position + direction];
      if (target) void play(current, target.index);
    },
    [play]
  );

  const toggle = useCallback(() => {
    if (!audio.src) return;
    if (audio.paused) void audio.play();
    else audio.pause();
  }, [audio]);

  const seek = useCallback(
    (value: number) => {
      audio.currentTime = Math.max(0, Math.min(value, audio.duration || value));
      setTime(audio.currentTime);
    },
    [audio]
  );

  const skip = useCallback((delta: number) => seek(audio.currentTime + delta), [audio, seek]);

  const cycleRate = useCallback(() => {
    const next = SPEEDS[(SPEEDS.indexOf(rate) + 1) % SPEEDS.length] ?? 1;
    audio.playbackRate = next;
    setRate(next);
    localStorage.setItem("grillo:rate", String(next));
  }, [audio, rate]);

  // eventi dell'elemento audio
  useEffect(() => {
    const persist = (force = false) => {
      const { book: current, chapter: currentChapter } = state.current;
      if (!current || !currentChapter) return;
      if (force || Date.now() - lastSaved.current > 5000) {
        savePosition(current.id, currentChapter.index, audio.currentTime);
        lastSaved.current = Date.now();
      }
    };
    const onTime = () => {
      setTime(audio.currentTime);
      persist();
    };
    const onPlay = () => setPlaying(true);
    const onPause = () => {
      setPlaying(false);
      persist(true);
    };
    const onMeta = () => setDuration(audio.duration);
    const onEnded = () => {
      if (sleepRef.current?.kind === "chapter") {
        setSleep(null);
        return;
      }
      step(1);
    };
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("loadedmetadata", onMeta);
    audio.addEventListener("ended", onEnded);
    window.addEventListener("pagehide", () => persist(true));
    return () => {
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("loadedmetadata", onMeta);
      audio.removeEventListener("ended", onEnded);
    };
  }, [audio, step]);

  // timer di spegnimento
  useEffect(() => {
    if (sleep?.kind !== "minutes") return;
    const timer = setInterval(() => {
      if (Date.now() >= sleep.until) {
        audio.pause();
        setSleep(null);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [audio, sleep]);

  // comandi nella schermata di blocco e cuffie
  useEffect(() => {
    if (!("mediaSession" in navigator) || !book || !chapter) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: chapter.title,
      artist: book.author || book.title,
      album: book.title,
      artwork: coverUrl ? [{ src: coverUrl, sizes: "512x512" }] : [{ src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" }]
    });
    const handlers: [MediaSessionAction, MediaSessionActionHandler][] = [
      ["play", () => void audio.play()],
      ["pause", () => audio.pause()],
      ["seekbackward", () => skip(-30)],
      ["seekforward", () => skip(30)],
      ["previoustrack", () => step(-1)],
      ["nexttrack", () => step(1)],
      ["seekto", (details) => details.seekTime !== undefined && seek(details.seekTime)]
    ];
    for (const [action, handler] of handlers) {
      try {
        navigator.mediaSession.setActionHandler(action, handler);
      } catch {
        /* azione non supportata da questo browser */
      }
    }
  }, [audio, book, chapter, coverUrl, seek, skip, step]);

  const value: PlayerValue = {
    book,
    chapter,
    coverUrl,
    playing,
    time,
    duration,
    rate,
    loading,
    error,
    sleep,
    play,
    toggle,
    seek,
    skip,
    next: () => step(1),
    previous: () => step(-1),
    cycleRate,
    setSleep
  };

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
}
