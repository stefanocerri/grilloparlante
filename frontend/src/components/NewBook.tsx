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

export function NewBook({ snapshot, onImported }: { snapshot: AppSnapshot; onImported: (bookId: string) => void }) {
  const [filePath, setFilePath] = useState<string | null>(null);
  const [voiceId, setVoiceId] = useState<string>(() => remembered("voiceId", snapshot.voices[0]?.id ?? ""));
  const [speed, setSpeed] = useState<number>(() => remembered("speed", 1.0));
  const [playing, setPlaying] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const importing = Boolean(snapshot.queue.importing);

  useEffect(() => () => audio.current?.pause(), []);

  const togglePreview = (id: string, url?: string) => {
    if (!url) return;
    if (playing === id) {
      audio.current?.pause();
      setPlaying(null);
      return;
    }
    audio.current?.pause();
    audio.current = new Audio(url);
    audio.current.onended = () => setPlaying(null);
    void audio.current.play();
    setPlaying(id);
  };

  const start = async () => {
    if (!filePath || !voiceId) return;
    setError(null);
    localStorage.setItem("voiceId", JSON.stringify(voiceId));
    localStorage.setItem("speed", JSON.stringify(speed));
    try {
      onImported(await window.grillo.importBook({ filePath, voiceId, speed }));
    } catch (failure) {
      setError((failure as Error).message.replace(/^Error invoking remote method '[^']+': (Error: )?/, ""));
    }
  };

  const fileName = filePath?.split("/").pop();

  return (
    <div className="mx-auto max-w-3xl px-10 pb-16">
      <p className="eyebrow">Nuovo audiolibro</p>
      <h1 className="mt-2 text-4xl font-semibold tracking-tight">Scegli il libro e la voce</h1>

      <p className="eyebrow mt-10">1 · Il libro</p>
      <button
        onClick={async () => setFilePath((await window.grillo.pickBook()) ?? filePath)}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          const file = event.dataTransfer.files[0];
          if (file) setFilePath(window.grillo.pathForFile(file));
        }}
        className={`mt-3 flex w-full items-center gap-4 rounded-2xl border-2 border-dashed p-6 text-left transition ${
          dragging ? "border-accent bg-white" : "border-line hover:border-ink"
        }`}
      >
        <FileText size={28} className="shrink-0 text-mute" />
        <div>
          <p className="font-medium">{fileName ?? "Trascina qui un PDF, EPUB o articolo JSON"}</p>
          <p className="text-sm text-mute">{fileName ? "Clicca per sceglierne un altro" : "oppure clicca per sceglierlo"}</p>
        </div>
      </button>

      <p className="eyebrow mt-10">2 · La voce</p>
      <div className="mt-3 grid grid-cols-2 gap-3">
        {snapshot.voices.map((voice) => {
          const selected = voice.id === voiceId;
          return (
            <div
              key={voice.id}
              onClick={() => setVoiceId(voice.id)}
              className={`flex cursor-pointer items-center gap-3 rounded-2xl border p-4 transition ${
                selected ? "border-ink bg-white shadow-sm" : "border-line hover:bg-white/60"
              }`}
            >
              <button
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-black/5 hover:bg-black/10 disabled:opacity-30"
                disabled={!voice.previewUrl}
                onClick={(event) => {
                  event.stopPropagation();
                  togglePreview(voice.id, voice.previewUrl);
                }}
                title="Ascolta un'anteprima"
              >
                {playing === voice.id ? <Pause size={16} /> : <Play size={16} />}
              </button>
              <div className="min-w-0">
                <p className="font-medium">
                  {voice.name} <span className="text-xs font-normal text-mute">· {voice.gender}</span>
                </p>
                <p className="truncate text-xs text-mute">{voice.description}</p>
              </div>
            </div>
          );
        })}
      </div>

      <p className="eyebrow mt-10">3 · Velocità di lettura</p>
      <div className="mt-3 flex gap-2">
        {SPEEDS.map((value) => (
          <button
            key={value}
            onClick={() => setSpeed(value)}
            className={value === speed ? "btn-primary" : "btn-ghost"}
          >
            {value.toFixed(1)}×
          </button>
        ))}
      </div>

      {error && <p className="mt-6 rounded-xl bg-orange-50 p-3 text-sm text-warn">{error}</p>}

      <button className="btn-accent mt-10 px-8 py-3 text-base" disabled={!filePath || !voiceId || importing} onClick={start}>
        {importing ? "Leggo il libro e cerco i capitoli…" : "Importa e mostra i capitoli"}
      </button>
      <p className="mt-3 text-xs text-mute">
        L'importazione è veloce: estrae il testo e divide i capitoli. Poi scegli tu quali convertire in audio.
      </p>
    </div>
  );
}
