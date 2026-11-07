import { useEffect, useRef, useState } from "react";
import type { AppSnapshot } from "@shared/contracts";
import { FileText, Pause, Play } from "lucide-react";

const SPEEDS = [0.9, 1.0, 1.1, 1.2];

function remembered<T>(key: string, fallback: T): T {
  try {
    const value = localStorage.getItem(key);
    return value === null ? fallback : (JSON.parse(value) as T);
  } catch {
    return fallback;
  }
}

export function NewItem({
  snapshot,
  filePath,
  onChangeFile,
  onImported
}: {
  snapshot: AppSnapshot;
  filePath: string;
  onChangeFile: (filePath: string) => void;
  onImported: (bookId: string) => void;
}) {
  const [voiceId, setVoiceId] = useState<string>(() => remembered("voiceId", snapshot.voices[0]?.id ?? ""));
  const [speed, setSpeed] = useState<number>(() => remembered("speed", 1.0));
  const [playing, setPlaying] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const importing = Boolean(snapshot.queue.importing);
  const engineReady = snapshot.runtime.state === "ready";
  const fileName = filePath.split("/").pop() ?? filePath;

  useEffect(() => () => audio.current?.pause(), []);

  const togglePreview = (id: string, url?: string) => {
    if (!url) return;
    audio.current?.pause();
    if (playing === id) {
      setPlaying(null);
      return;
    }
    audio.current = new Audio(url);
    audio.current.onended = () => setPlaying(null);
    void audio.current.play();
    setPlaying(id);
  };

  const start = async (convertAll: boolean) => {
    if (!voiceId) return;
    setError(null);
    audio.current?.pause();
    localStorage.setItem("voiceId", JSON.stringify(voiceId));
    localStorage.setItem("speed", JSON.stringify(speed));
    try {
      onImported(await window.grillo.importBook({ filePath, voiceId, speed, convertAll }));
    } catch (failure) {
      setError((failure as Error).message.replace(/^Error invoking remote method '[^']+': (Error: )?/, ""));
    }
  };

  return (
    <div className="flex flex-col gap-4 p-3">
      <button
        className="card flex items-center gap-3 px-3 py-2.5 text-left hover:bg-white"
        onClick={async () => {
          const file = await window.grillo.pickBook();
          if (file) onChangeFile(file);
        }}
        title="Scegli un altro file"
      >
        <FileText size={18} className="shrink-0 text-mute" />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{fileName}</p>
          <p className="text-[11px] text-mute">Clicca per sceglierne un altro</p>
        </div>
      </button>

      <section>
        <p className="eyebrow mb-2">Voce</p>
        <div className="grid grid-cols-2 gap-2">
          {snapshot.voices.map((voice) => {
            const selected = voice.id === voiceId;
            return (
              <div
                key={voice.id}
                onClick={() => setVoiceId(voice.id)}
                className={`flex cursor-pointer items-center gap-2 rounded-xl border p-2 transition ${
                  selected ? "border-ink bg-white shadow-sm" : "border-line hover:bg-white/60"
                }`}
              >
                <button
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-black/5 hover:bg-black/10 disabled:opacity-30"
                  disabled={!voice.previewUrl}
                  onClick={(event) => {
                    event.stopPropagation();
                    togglePreview(voice.id, voice.previewUrl);
                  }}
                  title="Ascolta un'anteprima"
                >
                  {playing === voice.id ? <Pause size={12} /> : <Play size={12} />}
                </button>
                <div className="min-w-0">
                  <p className="text-sm font-medium leading-tight">{voice.name}</p>
                  <p className="truncate text-[11px] text-mute">{voice.description}</p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <p className="eyebrow mb-2">Velocità</p>
        <div className="flex gap-1.5">
          {SPEEDS.map((value) => (
            <button
              key={value}
              onClick={() => setSpeed(value)}
              className={`flex-1 ${value === speed ? "btn-primary" : "btn-ghost"}`}
            >
              {value.toFixed(1)}×
            </button>
          ))}
        </div>
      </section>

      {error && <p className="rounded-xl bg-orange-50 p-2.5 text-xs text-warn">{error}</p>}
      {!engineReady && (
        <p className="rounded-xl bg-orange-50 p-2.5 text-xs text-warn">Prima va installato il motore voce.</p>
      )}

      <div className="flex flex-col gap-2">
        <button className="btn-accent py-2.5" disabled={!voiceId || importing || !engineReady} onClick={() => start(true)}>
          {importing ? "Leggo il file…" : "Importa e converti tutto"}
        </button>
        <button className="btn-ghost" disabled={!voiceId || importing || !engineReady} onClick={() => start(false)}>
          Importa e scegli i capitoli
        </button>
      </div>
    </div>
  );
}
