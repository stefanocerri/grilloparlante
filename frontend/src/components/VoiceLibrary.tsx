import { useEffect, useRef, useState } from "react";
import { Mic, Plus, Square, Trash2, Pencil, Check, X, FolderOpen } from "lucide-react";
import type { SavedVoice, SavedVoiceEngine } from "@shared/contracts";
import { startMicrophoneRecording, type ActiveRecording, type RecordedSample } from "../lib/recorder";

export interface VoiceDraftSeed {
  // Changes every time a new seed is requested, so the form reopens
  key: number;
  engine: SavedVoiceEngine;
  sourcePath?: string;
  referenceText?: string;
}

export type VoiceNotify = (toast: {
  level: "info" | "warning" | "error" | "success";
  title: string;
  detail?: string;
}) => void;

interface VoiceLibraryProps {
  voices: SavedVoice[];
  activeVoiceId?: string;
  seed?: VoiceDraftSeed | null;
  onUse: (voice: SavedVoice) => void;
  onCreated: (voice: SavedVoice) => void;
  onRenamed: (voice: SavedVoice) => void;
  onRemoved: (id: string, remaining: SavedVoice[]) => void;
  notify: VoiceNotify;
}

const MIN_RECOMMENDED_SECONDS = 10;
const MAX_RECORDING_SECONDS = 120;

function fileName(filePath: string) {
  return filePath.split(/[\\/]/).pop() ?? filePath;
}

function formatSeconds(value: number) {
  const total = Math.max(0, Math.round(value));
  return `${Math.floor(total / 60)}:${(total % 60).toString().padStart(2, "0")}`;
}

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) {
    // Electron wraps IPC errors: "Error invoking remote method 'x': Error: message"
    return error.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, "");
  }

  return fallback;
}

export function VoiceLibrary({
  voices,
  activeVoiceId,
  seed,
  onUse,
  onCreated,
  onRenamed,
  onRemoved,
  notify
}: VoiceLibraryProps) {
  const [isCreating, setIsCreating] = useState(false);
  const [name, setName] = useState("");
  const [engine, setEngine] = useState<SavedVoiceEngine>("qwen");
  const [sourcePath, setSourcePath] = useState("");
  const [referenceText, setReferenceText] = useState("");
  const [recording, setRecording] = useState<RecordedSample | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const activeRecordingRef = useRef<ActiveRecording | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!seed) {
      return;
    }

    resetForm();
    setEngine(seed.engine);
    setSourcePath(seed.sourcePath ?? "");
    setReferenceText(seed.referenceText ?? "");
    setIsCreating(true);
  }, [seed?.key]);

  useEffect(() => {
    return () => {
      stopTimer();
      activeRecordingRef.current?.cancel();
    };
  }, []);

  useEffect(() => {
    return () => {
      if (recording) {
        URL.revokeObjectURL(recording.previewUrl);
      }
    };
  }, [recording]);

  function stopTimer() {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  function resetForm() {
    stopTimer();
    activeRecordingRef.current?.cancel();
    activeRecordingRef.current = null;
    setIsRecording(false);
    setRecordSeconds(0);
    setRecording(null);
    setName("");
    setEngine("qwen");
    setSourcePath("");
    setReferenceText("");
  }

  async function pickSourceFile() {
    try {
      const picked =
        engine === "qwen"
          ? await window.grillo.selectReferenceFile()
          : await window.grillo.selectVoiceStyleFile();

      if (!picked) {
        return;
      }

      setSourcePath(picked);
      setRecording(null);

      if (!name.trim()) {
        setName(fileName(picked).replace(/\.[^.]+$/, ""));
      }
    } catch (error) {
      notify({
        level: "error",
        title: "Selezione file non riuscita",
        detail: errorMessage(error, "Riprova.")
      });
    }
  }

  async function startRecording() {
    try {
      const granted = await window.grillo.requestMicrophoneAccess();

      if (!granted) {
        notify({
          level: "error",
          title: "Microfono non autorizzato",
          detail: "Abilita il microfono per Grillo parlante in Impostazioni di Sistema > Privacy e sicurezza."
        });
        return;
      }

      const active = await startMicrophoneRecording();
      activeRecordingRef.current = active;
      setRecording(null);
      setSourcePath("");
      setRecordSeconds(0);
      setIsRecording(true);

      const startedAt = Date.now();
      timerRef.current = window.setInterval(() => {
        const elapsed = (Date.now() - startedAt) / 1000;
        setRecordSeconds(elapsed);

        if (elapsed >= MAX_RECORDING_SECONDS) {
          void stopRecording();
        }
      }, 250);
    } catch (error) {
      notify({
        level: "error",
        title: "Registrazione non avviata",
        detail: errorMessage(error, "Microfono non disponibile.")
      });
    }
  }

  async function stopRecording() {
    const active = activeRecordingRef.current;
    activeRecordingRef.current = null;
    stopTimer();
    setIsRecording(false);

    if (!active) {
      return;
    }

    try {
      const sample = await active.stop();
      setRecording(sample);

      if (sample.durationSec < MIN_RECOMMENDED_SECONDS) {
        notify({
          level: "warning",
          title: "Campione molto corto",
          detail: "Per un clone credibile registra almeno 30 secondi di lettura continua."
        });
      }
    } catch (error) {
      notify({
        level: "error",
        title: "Registrazione non riuscita",
        detail: errorMessage(error, "Non sono riuscito a convertire l'audio registrato.")
      });
    }
  }

  async function saveVoice() {
    if (!name.trim()) {
      notify({ level: "error", title: "Dai un nome alla nuova voce" });
      return;
    }

    if (engine === "qwen" && !recording && !sourcePath) {
      notify({ level: "error", title: "Manca il campione audio", detail: "Scegli un file o registra dal microfono." });
      return;
    }

    if (engine === "qwen" && !referenceText.trim()) {
      notify({
        level: "error",
        title: "Manca la trascrizione",
        detail: "Scrivi esattamente le parole pronunciate nel campione."
      });
      return;
    }

    if (engine === "supertonic" && !sourcePath) {
      notify({ level: "error", title: "Scegli il file JSON della voce" });
      return;
    }

    setIsSaving(true);

    try {
      const voice = await window.grillo.addVoice({
        name: name.trim(),
        engine,
        sourcePath: recording ? undefined : sourcePath || undefined,
        recordingWav: recording?.wav,
        referenceText: engine === "qwen" ? referenceText.trim() : undefined
      });

      notify({ level: "success", title: "Voce salvata", detail: voice.name });
      resetForm();
      setIsCreating(false);
      onCreated(voice);
    } catch (error) {
      notify({
        level: "error",
        title: "Voce non salvata",
        detail: errorMessage(error, "Errore durante il salvataggio.")
      });
    } finally {
      setIsSaving(false);
    }
  }

  async function confirmRename(id: string) {
    try {
      const voice = await window.grillo.renameVoice(id, renameValue);
      setRenamingId(null);
      onRenamed(voice);
    } catch (error) {
      notify({
        level: "error",
        title: "Rinomina non riuscita",
        detail: errorMessage(error, "Riprova.")
      });
    }
  }

  async function removeVoice(voice: SavedVoice) {
    if (!window.confirm(`Eliminare la voce "${voice.name}"? Il campione salvato verra cancellato.`)) {
      return;
    }

    try {
      const remaining = await window.grillo.removeVoice(voice.id);
      onRemoved(voice.id, remaining);
      notify({ level: "info", title: "Voce eliminata", detail: voice.name });
    } catch (error) {
      notify({
        level: "error",
        title: "Eliminazione non riuscita",
        detail: errorMessage(error, "Riprova.")
      });
    }
  }

  const hasSample = engine === "qwen" ? Boolean(recording || sourcePath) : Boolean(sourcePath);

  return (
    <div className="voice-library">
      <div className="voice-library-head">
        <span>Voci salvate</span>
        <div className="voice-library-head-actions">
          <button
            type="button"
            className="icon-button voice-icon-button"
            title="Apri cartella voci"
            aria-label="Apri cartella voci"
            onClick={() => void window.grillo.openVoicesFolder()}
          >
            <FolderOpen className="h-4 w-4" />
          </button>
          {!isCreating ? (
            <button
              type="button"
              className="button button-ghost voice-add-button"
              onClick={() => {
                resetForm();
                setIsCreating(true);
              }}
            >
              <Plus className="h-4 w-4" />
              Nuova voce
            </button>
          ) : null}
        </div>
      </div>

      {voices.length === 0 && !isCreating ? (
        <p className="settings-note">
          Nessuna voce salvata. Crea una voce da un campione audio (file o microfono) e ritrovala qui per le prossime conversioni.
        </p>
      ) : null}

      {voices.length > 0 ? (
        <ul className="voice-list">
          {voices.map((voice) => {
            const isActive = voice.id === activeVoiceId;
            const isRenaming = renamingId === voice.id;

            return (
              <li key={voice.id} className={`voice-item ${isActive ? "is-active" : ""}`}>
                {isRenaming ? (
                  <input
                    className="field-minimal voice-rename-field"
                    value={renameValue}
                    autoFocus
                    onChange={(event) => setRenameValue(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        void confirmRename(voice.id);
                      }
                      if (event.key === "Escape") {
                        event.stopPropagation();
                        setRenamingId(null);
                      }
                    }}
                  />
                ) : (
                  <button
                    type="button"
                    className="voice-item-main"
                    onClick={() => onUse(voice)}
                    title="Usa questa voce per la conversione"
                  >
                    <strong>{voice.name}</strong>
                    <small>
                      {voice.engine === "qwen" ? "Clone Qwen" : "Stile Supertonic"}
                      {" · "}
                      {voice.source === "recording"
                        ? "registrata"
                        : voice.source === "file"
                          ? "da file"
                          : "JSON"}
                      {isActive ? " · in uso" : ""}
                    </small>
                  </button>
                )}
                <div className="voice-item-actions">
                  {isRenaming ? (
                    <>
                      <button
                        type="button"
                        className="icon-button voice-icon-button"
                        aria-label="Conferma nome"
                        onClick={() => void confirmRename(voice.id)}
                      >
                        <Check className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        className="icon-button voice-icon-button"
                        aria-label="Annulla"
                        onClick={() => setRenamingId(null)}
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="icon-button voice-icon-button"
                        aria-label={`Rinomina ${voice.name}`}
                        title="Rinomina"
                        onClick={() => {
                          setRenamingId(voice.id);
                          setRenameValue(voice.name);
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        className="icon-button voice-icon-button"
                        aria-label={`Elimina ${voice.name}`}
                        title="Elimina"
                        onClick={() => void removeVoice(voice)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}

      {isCreating ? (
        <div className="voice-form">
          <label className="setting-item">
            <span>Nome voce</span>
            <input
              className="field-minimal"
              placeholder="Es. Narratore caldo"
              maxLength={60}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </label>

          <label className="setting-item">
            <span>Tipo</span>
            <div className="segmented-minimal">
              <button
                type="button"
                className={engine === "qwen" ? "active" : ""}
                onClick={() => {
                  setEngine("qwen");
                  setSourcePath("");
                }}
              >
                Clona da campione
              </button>
              <button
                type="button"
                className={engine === "supertonic" ? "active" : ""}
                onClick={() => {
                  activeRecordingRef.current?.cancel();
                  activeRecordingRef.current = null;
                  stopTimer();
                  setIsRecording(false);
                  setRecording(null);
                  setEngine("supertonic");
                  setSourcePath("");
                }}
              >
                Stile Supertonic
              </button>
            </div>
          </label>

          <div className="setting-item">
            <span>{engine === "qwen" ? "Campione voce" : "File stile JSON"}</span>
            <div className="runtime-actions voice-sample-actions">
              <button
                type="button"
                className="button button-ghost"
                disabled={isRecording}
                onClick={() => void pickSourceFile()}
              >
                {engine === "qwen" ? "Scegli file audio" : "Scegli file JSON"}
              </button>
              {engine === "qwen" ? (
                isRecording ? (
                  <button
                    type="button"
                    className="button voice-record-button is-recording"
                    onClick={() => void stopRecording()}
                  >
                    <Square className="h-4 w-4" />
                    Ferma {formatSeconds(recordSeconds)}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="button button-ghost voice-record-button"
                    onClick={() => void startRecording()}
                  >
                    <Mic className="h-4 w-4" />
                    {recording ? "Registra di nuovo" : "Registra dal microfono"}
                  </button>
                )
              ) : null}
            </div>

            {sourcePath && !recording ? (
              <p className="settings-note voice-sample-status">
                File: <code>{fileName(sourcePath)}</code>
              </p>
            ) : null}

            {recording ? (
              <div className="voice-sample-status">
                <p className="settings-note">
                  Registrazione: {formatSeconds(recording.durationSec)}
                </p>
                <audio className="voice-preview" controls src={recording.previewUrl} />
              </div>
            ) : null}

            <p className="settings-note">
              {engine === "qwen"
                ? "Usa 30-90 secondi di una sola voce, in un ambiente silenzioso, senza musica. Clona solo la tua voce o voci per cui hai il consenso."
                : "Crea lo stile con Supertone Voice Builder e importa qui il JSON: verra copiato nella libreria dell'app."}
            </p>
          </div>

          {engine === "qwen" ? (
            <label className="setting-item">
              <span>Trascrizione del campione</span>
              <textarea
                className="field-minimal"
                rows={4}
                placeholder="Scrivi esattamente cosa viene detto nel campione."
                value={referenceText}
                onChange={(event) => setReferenceText(event.target.value)}
              />
            </label>
          ) : null}

          <div className="runtime-actions">
            <button
              type="button"
              className="button"
              disabled={isSaving || isRecording || !hasSample || !name.trim()}
              onClick={() => void saveVoice()}
            >
              {isSaving ? "Salvataggio..." : "Salva voce"}
            </button>
            <button
              type="button"
              className="button button-ghost"
              disabled={isSaving}
              onClick={() => {
                resetForm();
                setIsCreating(false);
              }}
            >
              Annulla
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
