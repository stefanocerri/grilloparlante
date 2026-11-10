import { useEffect, useRef, useState } from "react";
import type { AppSnapshot } from "@shared/contracts";
import { FileText, Pause, Play, Plus } from "lucide-react";
import { TargetPicker } from "./Channels";

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
  onImported,
  onNewVoice
}: {
  snapshot: AppSnapshot;
  filePath: string;
  onChangeFile: (filePath: string) => void;
  onImported: (bookId: string) => void;
  onNewVoice: () => void;
}) {
  const [voiceId, setVoiceId] = useState<string>(() => remembered("voiceId", snapshot.voices[0]?.id ?? ""));
  const [speed, setSpeed] = useState<number>(() => remembered("speed", 1.0));
  const [targets, setTargets] = useState<string[]>(() =>
    remembered<string[]>("targets", []).filter((id) => snapshot.channels.some((channel) => channel.id === id && channel.db))
  );
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
    localStorage.setItem("targets", JSON.stringify(targets));
    try {
      onImported(await window.grillo.importBook({ filePath, voiceId, speed, convertAll, targets }));
    } catch (failure) {
      setError((failure as Error).message.replace(/^Error invoking remote method '[^']+': (Error: )?/, ""));
    }
  };

  return (
    <div className="flex flex-col gap-4 p-3">
      <button
        className="card row-hover flex items-center gap-3 px-3 py-2.5 text-left"
        onClick={async () => {
          const file = await window.grillo.pickBook();
          if (file) onChangeFile(file);
        }}
        title="Scegli un altro file"
      >
        <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-line bg-subtle">
          <FileText size={15} className="text-mute" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{fileName}</p>
          <p className="text-2xs text-mute">Clicca per sceglierne un altro</p>
        </div>
      </button>

      <section>
        <p className="label mb-2">Voce</p>
        <div className="grid grid-cols-2 gap-2">
          {snapshot.voices.map((voice) => {
            const selected = voice.id === voiceId;
            return (
              <div
                key={voice.id}
                onClick={() => setVoiceId(voice.id)}
                className={`flex cursor-pointer items-center gap-2 rounded-lg border p-2 transition-colors ${
                  selected ? "border-accent bg-accent/[0.05] ring-1 ring-accent" : "border-line hover:border-ink/20 hover:bg-subtle"
                }`}
              >
                <button
                  className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-line bg-bg text-mute hover:text-ink disabled:opacity-30"
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
                  <p className="truncate text-2xs text-mute">{voice.description}</p>
                </div>
              </div>
            );
          })}
          <button
            onClick={onNewVoice}
            className="flex items-center gap-2 rounded-lg border border-dashed border-ink/15 p-2 text-left text-mute transition-colors hover:border-ink/30 hover:bg-subtle hover:text-ink"
          >
            <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-line bg-bg">
              <Plus size={12} />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-medium leading-tight">Nuova voce</p>
              <p className="truncate text-2xs">da un campione audio</p>
            </div>
          </button>
        </div>
      </section>

      <section>
        <p className="label mb-2">Velocità</p>
        <div className="flex gap-0.5 rounded-md border border-line bg-subtle p-0.5">
          {SPEEDS.map((value) => (
            <button
              key={value}
              onClick={() => setSpeed(value)}
              className={`h-7 flex-1 rounded font-mono text-xs transition-colors ${
                value === speed ? "bg-bg text-ink shadow-[0_0_0_1px_rgb(var(--line))]" : "text-mute hover:text-ink"
              }`}
            >
              {value.toFixed(1)}×
            </button>
          ))}
        </div>
      </section>

      <section>
        <p className="label mb-2">Dove lo ascolti</p>
        <TargetPicker snapshot={snapshot} value={targets} onChange={setTargets} />
        <p className="mt-2 font-mono text-2xs text-faint">Copia sul Mac: {snapshot.libraryDir}/books</p>
        {!snapshot.channels.some((channel) => channel.db) && (
          <p className="mt-1 text-2xs text-mute">Per mandarlo al telefono collega un'app nelle Impostazioni.</p>
        )}
      </section>

      {error && <p className="note-error">{error}</p>}
      {!engineReady && <p className="note-warn">Prima va installato il narratore.</p>}

      <div className="flex flex-col gap-2">
        <button className="btn-primary btn-lg" disabled={!voiceId || importing || !engineReady} onClick={() => start(true)}>
          {importing ? "Leggo il file…" : "Importa e converti tutto"}
        </button>
        <button className="btn-secondary" disabled={!voiceId || importing || !engineReady} onClick={() => start(false)}>
          Importa e scegli i capitoli
        </button>
      </div>
    </div>
  );
}
