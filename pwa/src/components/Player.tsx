import { useState } from "react";
import { ChevronDown, Loader2, Moon, Pause, Play, RotateCcw, RotateCw, SkipBack, SkipForward } from "lucide-react";
import { usePlayer } from "../lib/player";
import { formatClock } from "../lib/positions";
import { Cover } from "./Cover";

export function MiniPlayer({ onExpand }: { onExpand: () => void }) {
  const player = usePlayer();
  if (!player.book || !player.chapter) return null;
  const fill = player.duration ? (player.time / player.duration) * 100 : 0;

  return (
    <div className="safe-bottom fixed inset-x-0 bottom-0 z-20 px-3">
      <div className="overflow-hidden rounded-2xl bg-night text-[#f4f1eb] shadow-2xl">
        <div className="h-0.5 bg-white/10">
          <div className="h-full bg-accent" style={{ width: `${fill}%` }} />
        </div>
        <div className="flex items-center gap-3 p-2.5">
          <button onClick={onExpand} className="flex min-w-0 flex-1 items-center gap-3 text-left">
            <Cover url={player.coverUrl} title={player.book.title} className="h-12 w-9 shrink-0 rounded-md" />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{player.chapter.title}</p>
              <p className="truncate text-xs opacity-60">{player.book.title}</p>
            </div>
          </button>
          <button onClick={() => player.skip(-30)} className="rounded-full p-2 active:bg-white/10" aria-label="Indietro 30 secondi">
            <RotateCcw size={20} />
          </button>
          <button onClick={player.toggle} className="rounded-full bg-[#f4f1eb] p-2.5 text-night" aria-label="Play/pausa">
            {player.loading !== null ? <Loader2 size={20} className="animate-spin" /> : player.playing ? <Pause size={20} /> : <Play size={20} />}
          </button>
        </div>
      </div>
    </div>
  );
}

const SLEEP_OPTIONS: { label: string; minutes: number | "chapter" | null }[] = [
  { label: "15 minuti", minutes: 15 },
  { label: "30 minuti", minutes: 30 },
  { label: "45 minuti", minutes: 45 },
  { label: "1 ora", minutes: 60 },
  { label: "Fine del capitolo", minutes: "chapter" },
  { label: "Disattiva", minutes: null }
];

export function FullPlayer({ onClose }: { onClose: () => void }) {
  const player = usePlayer();
  const [sleepMenu, setSleepMenu] = useState(false);
  if (!player.book || !player.chapter) return null;

  const duration = player.duration || player.chapter.duration || 0;
  const fill = duration ? (player.time / duration) * 100 : 0;
  const sleepLabel =
    player.sleep?.kind === "chapter"
      ? "Fine capitolo"
      : player.sleep?.kind === "minutes"
        ? `${Math.max(1, Math.round((player.sleep.until - Date.now()) / 60000))} min`
        : "Timer";

  return (
    <div className="safe-top safe-bottom fixed inset-0 z-30 flex flex-col bg-night px-6 text-[#f4f1eb]">
      <button onClick={onClose} className="-ml-2 self-start rounded-full p-2 active:bg-white/10" aria-label="Chiudi">
        <ChevronDown size={26} />
      </button>

      <div className="flex flex-1 flex-col items-center justify-center">
        <Cover url={player.coverUrl} title={player.book.title} className="aspect-[2/3] w-3/5 max-w-[260px] rounded-2xl shadow-2xl" />
        <p className="mt-8 text-center text-xl font-semibold leading-tight">{player.chapter.title}</p>
        <p className="mt-1 text-center text-sm opacity-60">{player.book.title}</p>
        {player.error && <p className="mt-3 text-center text-sm text-accent">{player.error}</p>}
      </div>

      <div>
        <input
          type="range"
          className="scrubber w-full"
          min={0}
          max={duration || 1}
          step={1}
          value={Math.min(player.time, duration || 1)}
          style={{ ["--fill" as string]: `${fill}%` }}
          onChange={(event) => player.seek(Number(event.target.value))}
        />
        <div className="mt-1 flex justify-between font-mono text-xs opacity-60">
          <span>{formatClock(player.time)}</span>
          <span>-{formatClock(Math.max(0, duration - player.time))}</span>
        </div>

        <div className="mt-6 flex items-center justify-between">
          <button onClick={player.previous} className="rounded-full p-3 active:bg-white/10" aria-label="Capitolo precedente">
            <SkipBack size={24} />
          </button>
          <button onClick={() => player.skip(-30)} className="relative rounded-full p-3 active:bg-white/10" aria-label="Indietro 30 secondi">
            <RotateCcw size={32} />
            <span className="absolute inset-0 flex items-center justify-center text-[9px] font-bold">30</span>
          </button>
          <button onClick={player.toggle} className="rounded-full bg-[#f4f1eb] p-5 text-night" aria-label="Play/pausa">
            {player.loading !== null ? <Loader2 size={32} className="animate-spin" /> : player.playing ? <Pause size={32} /> : <Play size={32} />}
          </button>
          <button onClick={() => player.skip(30)} className="relative rounded-full p-3 active:bg-white/10" aria-label="Avanti 30 secondi">
            <RotateCw size={32} />
            <span className="absolute inset-0 flex items-center justify-center text-[9px] font-bold">30</span>
          </button>
          <button onClick={player.next} className="rounded-full p-3 active:bg-white/10" aria-label="Capitolo successivo">
            <SkipForward size={24} />
          </button>
        </div>

        <div className="mb-2 mt-8 flex items-center justify-between text-sm">
          <button onClick={player.cycleRate} className="rounded-full border border-white/20 px-4 py-2 font-semibold">
            {player.rate.toString().replace(".", ",")}×
          </button>
          <div className="relative">
            <button
              onClick={() => setSleepMenu((open) => !open)}
              className={`flex items-center gap-2 rounded-full border px-4 py-2 ${player.sleep ? "border-accent text-accent" : "border-white/20"}`}
            >
              <Moon size={15} /> {sleepLabel}
            </button>
            {sleepMenu && (
              <div className="absolute bottom-12 right-0 w-48 overflow-hidden rounded-2xl bg-[#2a2420] shadow-2xl">
                {SLEEP_OPTIONS.map((option) => (
                  <button
                    key={option.label}
                    className="block w-full px-4 py-3 text-left text-sm active:bg-white/10"
                    onClick={() => {
                      setSleepMenu(false);
                      player.setSleep(
                        option.minutes === null
                          ? null
                          : option.minutes === "chapter"
                            ? { kind: "chapter" }
                            : { kind: "minutes", until: Date.now() + option.minutes * 60000 }
                      );
                    }}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
