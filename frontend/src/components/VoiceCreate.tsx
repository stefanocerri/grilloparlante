import { useEffect, useRef, useState } from "react";
import type { AppSnapshot, VoiceCreateRequest, VoiceInfo } from "@shared/contracts";
import { AudioLines, Pause, Play, Square, Trash2, Upload } from "lucide-react";
import { cleanError, Spinner, StatusIcon } from "./ui";

const GENDERS: { id: VoiceCreateRequest["gender"]; label: string }[] = [
  { id: "donna", label: "Donna" },
  { id: "uomo", label: "Uomo" },
  { id: "altro", label: "Non specificato" }
];

/** Nuova voce da un campione audio: Grillo la clona con OmniVoice e la aggiunge alle altre. */
export function VoiceCreate({ snapshot, onDone }: { snapshot: AppSnapshot; onDone: (voiceId: string) => void }) {
  const [filePath, setFilePath] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [gender, setGender] = useState<VoiceCreateRequest["gender"]>("altro");
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const job = snapshot.voiceJob;
  const running = job?.state === "running";
  const engineReady = snapshot.runtime.state === "ready";
  const fileName = filePath?.split("/").pop();

  const choose = (path: string) => {
    setFilePath(path);
    if (!name) setName((path.split("/").pop() ?? "").replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").slice(0, 24));
  };

  const create = async () => {
    if (!filePath) return;
    setError(null);
    try {
      const voiceId = await window.grillo.createVoice({ filePath, name: name.trim(), gender, transcript: transcript.trim() });
      onDone(voiceId);
    } catch (failure) {
      const message = cleanError(failure);
      if (message !== "Creazione annullata.") setError(message);
    }
  };

  if (running && job) {
    const percent = Math.round(job.progress * 100);
    return (
      <div className="p-3">
        <div className="card p-4">
          <div className="flex items-center gap-2">
            <span className="badge-blue">
              <span className="dot h-1.5 w-1.5 animate-pulse bg-accent" /> In corso
            </span>
            <p className="min-w-0 flex-1 truncate text-sm font-medium">{job.name}</p>
            <span className="font-mono text-xs text-mute">{percent}%</span>
            <button className="icon-btn -mr-1" title="Annulla" onClick={() => void window.grillo.cancelVoice()}>
              <Square size={11} />
            </button>
          </div>
          <div className="progress mt-3">
            <div style={{ width: `${percent}%` }} />
          </div>
          <p className="mt-2 text-xs text-mute">{job.label}</p>
          <p className="note-info mt-4">Ci vuole qualche minuto. Puoi chiudere il pannello: quando è pronta la trovi tra le voci.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-3">
      <div>
        <h1 className="text-base font-semibold tracking-tight">Nuova voce da un campione</h1>
        <p className="mt-1 text-xs leading-relaxed text-mute">
          Carica un audio di 10–30 secondi con <span className="text-ink">una sola persona</span> che parla chiaramente,
          senza musica. Grillo ne ricava una voce nuova e la aggiunge alle altre.
        </p>
      </div>

      <button
        onClick={async () => {
          const path = await window.grillo.pickVoiceSample();
          if (path) choose(path);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          const file = event.dataTransfer.files[0];
          if (file) choose(window.grillo.pathForFile(file));
        }}
        className={`flex items-center gap-3 rounded-lg border border-dashed px-3 py-3 text-left transition-colors ${
          dragging ? "border-accent bg-accent/[0.04]" : "border-ink/15 hover:border-ink/30 hover:bg-subtle"
        }`}
      >
        <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-line bg-bg text-mute">
          {filePath ? <AudioLines size={15} /> : <Upload size={15} />}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{fileName ?? "Scegli il campione audio"}</p>
          <p className="text-2xs text-mute">{filePath ? "Clicca per sceglierne un altro" : "Trascinalo qui · WAV, MP3, M4A, FLAC"}</p>
        </div>
      </button>

      <label className="block space-y-1">
        <span className="label">Nome della voce</span>
        <input className="input" value={name} maxLength={24} placeholder="Es. Nonna Lucia" onChange={(event) => setName(event.target.value)} />
      </label>

      <div className="space-y-1">
        <span className="label">Voce di</span>
        <div className="flex gap-0.5 rounded-md border border-line bg-subtle p-0.5">
          {GENDERS.map((item) => (
            <button
              key={item.id}
              onClick={() => setGender(item.id)}
              className={`h-7 flex-1 rounded text-xs font-medium transition-colors ${
                gender === item.id ? "bg-bg text-ink shadow-[0_0_0_1px_rgb(var(--line))]" : "text-mute hover:text-ink"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <label className="block space-y-1">
        <span className="label">Cosa dice il campione (facoltativo)</span>
        <textarea
          className="input h-20 resize-none py-2 leading-relaxed"
          value={transcript}
          placeholder="Se lo lasci vuoto lo trascrivo io (la prima volta scarico Whisper, circa 1,6 GB)."
          onChange={(event) => setTranscript(event.target.value)}
        />
      </label>

      {error && <p className="note-error">{error}</p>}
      {!engineReady && <p className="note-warn">Prima va installato il narratore.</p>}

      <button className="btn-primary btn-lg" disabled={!filePath || !name.trim() || !engineReady} onClick={create}>
        Crea la voce
      </button>
    </div>
  );
}

/** Elenco delle voci create dall'utente, con anteprima ed eliminazione (Impostazioni). */
export function CustomVoices({ snapshot, onNew }: { snapshot: AppSnapshot; onNew: () => void }) {
  const custom = snapshot.voices.filter((voice) => voice.custom);
  const job = snapshot.voiceJob;
  return (
    <div className="space-y-3">
      {job && job.state !== "running" && (
        <div className="flex items-center gap-2 rounded-md border border-line bg-subtle px-3 py-2">
          <StatusIcon state={job.state === "done" ? "ok" : "fail"} />
          <p className="min-w-0 flex-1 truncate text-xs">
            {job.state === "done" ? `«${job.name}» è pronta` : job.label}
          </p>
          <button className="btn-ghost btn-sm" onClick={() => void window.grillo.dismissVoiceJob()}>
            OK
          </button>
        </div>
      )}
      {job?.state === "running" && (
        <div className="flex items-center gap-2 text-xs text-mute">
          <Spinner size={12} className="text-accent" /> Creo «{job.name}» · {Math.round(job.progress * 100)}%
        </div>
      )}
      {custom.length > 0 && (
        <ul className="card divide-y divide-line overflow-hidden">
          {custom.map((voice) => (
            <CustomVoiceRow key={voice.id} voice={voice} />
          ))}
        </ul>
      )}
      <button className="btn-secondary w-full" onClick={onNew} disabled={job?.state === "running"}>
        <Upload size={14} /> Nuova voce da un campione
      </button>
    </div>
  );
}

function CustomVoiceRow({ voice }: { voice: VoiceInfo }) {
  const [playing, setPlaying] = useState(false);
  const audio = useRef<HTMLAudioElement | null>(null);
  useEffect(() => () => audio.current?.pause(), []);

  const toggle = () => {
    if (!voice.previewUrl) return;
    if (playing) {
      audio.current?.pause();
      setPlaying(false);
      return;
    }
    audio.current = new Audio(voice.previewUrl);
    audio.current.onended = () => setPlaying(false);
    void audio.current.play();
    setPlaying(true);
  };

  const remove = async () => {
    const ok = await window.grillo.confirm(
      `Eliminare la voce «${voice.name}»?`,
      "I capitoli già convertiti restano. Per convertire i capitoli mancanti dei libri con questa voce dovrai sceglierne un'altra."
    );
    if (ok) await window.grillo.deleteVoice(voice.id);
  };

  return (
    <li className="flex items-center gap-2 px-3 py-2">
      <button className="icon-btn" onClick={toggle} disabled={!voice.previewUrl} title="Ascolta l'anteprima">
        {playing ? <Pause size={13} /> : <Play size={13} />}
      </button>
      <p className="min-w-0 flex-1 truncate text-sm">{voice.name}</p>
      <span className="badge-gray">Da campione</span>
      <button className="icon-btn hover:text-danger" onClick={remove} title="Elimina">
        <Trash2 size={13} />
      </button>
    </li>
  );
}
