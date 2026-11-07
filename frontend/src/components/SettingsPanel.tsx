import { useState } from "react";
import type { ConversionSettings, SavedVoice } from "@shared/contracts";
import { VoiceLibrary, type VoiceDraftSeed, type VoiceNotify } from "./VoiceLibrary";

interface SettingsPanelProps {
  settings: ConversionSettings;
  showDetailedLogs: boolean;
  voices: SavedVoice[];
  onChange: (next: ConversionSettings) => void;
  onToggleDetailedLogs: (next: boolean) => void;
  onPickReferenceFile: () => void;
  onVoicesChange: (next: SavedVoice[]) => void;
  notify: VoiceNotify;
}

const SAVED_PREFIX = "saved:";

const ENGINES = [
  { value: "supertonic", label: "Supertonic" },
  { value: "qwen", label: "Qwen 0.6B beta" }
] as const;

const SUPERTONIC_VOICES = [
  { value: "F1", label: "Femminile 1 (F1)" },
  { value: "F2", label: "Femminile 2 (F2)" },
  { value: "F3", label: "Femminile 3 (F3)" },
  { value: "F4", label: "Femminile 4 (F4)" },
  { value: "F5", label: "Femminile 5 (F5)" },
  { value: "M1", label: "Maschile 1 (M1)" },
  { value: "M2", label: "Maschile 2 (M2)" },
  { value: "M3", label: "Maschile 3 (M3)" },
  { value: "M4", label: "Maschile 4 (M4)" },
  { value: "M5", label: "Maschile 5 (M5)" }
] as const;

const QUALITY_LEVELS = [
  { value: 5, label: "Veloce (5 step)" },
  { value: 8, label: "Bilanciata (8 step)" },
  { value: 10, label: "Alta qualita (10 step)" },
  { value: 12, label: "Massima (12 step)" }
] as const;

export function SettingsPanel({
  settings,
  showDetailedLogs,
  onChange,
  onToggleDetailedLogs,
  onPickReferenceFile,
  voices,
  onVoicesChange,
  notify
}: SettingsPanelProps) {
  const engine = settings.tts.engine;
  const isSupertonic = engine === "supertonic";
  const isQwen = engine === "qwen";
  const [voiceSeed, setVoiceSeed] = useState<VoiceDraftSeed | null>(null);
  const qwenVoices = voices.filter((voice) => voice.engine === "qwen");
  const supertonicVoices = voices.filter((voice) => voice.engine === "supertonic");
  const activeSavedVoice = voices.find((voice) => voice.id === settings.tts.savedVoiceId);
  const activeQwenVoice = activeSavedVoice?.engine === "qwen" && isQwen ? activeSavedVoice : undefined;
  const activeSupertonicVoice =
    activeSavedVoice?.engine === "supertonic" && isSupertonic ? activeSavedVoice : undefined;

  const supportedLanguages = [
    { value: "auto", label: "Auto" },
    { value: "it", label: "Italiano" },
    { value: "en", label: "English" }
  ] as const;

  function updateTts(patch: Partial<ConversionSettings["tts"]>) {
    onChange({
      ...settings,
      tts: {
        ...settings.tts,
        ...patch
      }
    });
  }

  function applySavedVoice(voice: SavedVoice) {
    if (voice.engine === "qwen") {
      updateTts({
        engine: "qwen",
        voiceMode: "reference",
        voiceName: voice.name,
        savedVoiceId: voice.id,
        referenceAudioPath: voice.referenceAudioPath ?? "",
        referenceText: voice.referenceText ?? ""
      });
      return;
    }

    updateTts({
      engine: "supertonic",
      voiceMode: "standard",
      voiceName: voice.name,
      savedVoiceId: voice.id,
      voiceStyle: settings.tts.voiceStyle || "F1",
      voiceStylePath: voice.voiceStylePath ?? "",
      qualitySteps: settings.tts.qualitySteps ?? 8
    });
  }

  function clearSavedQwenVoice() {
    updateTts({
      voiceMode: "reference",
      voiceName: "Voce da sample",
      savedVoiceId: undefined,
      referenceAudioPath: "",
      referenceText: ""
    });
  }

  function handleVoiceRemoved(id: string, remaining: SavedVoice[]) {
    onVoicesChange(remaining);

    if (settings.tts.savedVoiceId !== id) {
      return;
    }

    if (isQwen) {
      clearSavedQwenVoice();
    } else {
      updateTts({ savedVoiceId: undefined, voiceStylePath: "", voiceName: "Voce preset" });
    }
  }

  return (
    <div className="settings-minimal">
      <label className="setting-item">
        <span>Motore voce</span>
        <select
          className="field-minimal"
          value={engine}
          onChange={(event) => {
            const nextEngine = event.target.value;
            if (nextEngine === "qwen") {
              const keepsSaved = activeSavedVoice?.engine === "qwen";
              updateTts({
                engine: "qwen",
                voiceMode: "reference",
                voiceName: keepsSaved ? activeSavedVoice.name : "Voce da sample",
                savedVoiceId: keepsSaved ? activeSavedVoice.id : undefined
              });
            } else {
              const keepsSaved = activeSavedVoice?.engine === "supertonic";
              updateTts({
                engine: "supertonic",
                voiceMode: "standard",
                voiceName: keepsSaved ? activeSavedVoice.name : "Voce preset",
                savedVoiceId: keepsSaved ? activeSavedVoice.id : undefined,
                voiceStylePath: keepsSaved ? activeSavedVoice.voiceStylePath ?? "" : settings.tts.voiceStylePath,
                voiceStyle: settings.tts.voiceStyle || "F1",
                qualitySteps: settings.tts.qualitySteps ?? 8
              });
            }
          }}
        >
          {ENGINES.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      </label>

      <label className="setting-item">
        <span>Lingua</span>
        <div className="segmented-minimal">
          {supportedLanguages.map((language) => (
            <button
              key={language.value}
              type="button"
              className={settings.tts.language === language.value ? "active" : ""}
              onClick={() => updateTts({ language: language.value })}
            >
              {language.label}
            </button>
          ))}
        </div>
      </label>

      <p className="settings-note">
        {isSupertonic
          ? "Supertonic gira in locale via ONNX: veloce, multilingua e con voci gia pronte, nessun sample richiesto. In Auto rilevo italiano o inglese dal testo."
          : "Qwen 0.6B usa sempre un sample reale: audio + trascrizione del sample sono obbligatori. In Auto provo a rilevare la lingua dal testo."}
      </p>

      {isSupertonic ? (
        <>
          <label className="setting-item">
            <span>Voce</span>
            <select
              className="field-minimal"
              value={
                activeSupertonicVoice
                  ? `${SAVED_PREFIX}${activeSupertonicVoice.id}`
                  : settings.tts.voiceStyle || "F1"
              }
              onChange={(event) => {
                const value = event.target.value;

                if (value.startsWith(SAVED_PREFIX)) {
                  const voice = supertonicVoices.find(
                    (item) => item.id === value.slice(SAVED_PREFIX.length)
                  );
                  if (voice) {
                    applySavedVoice(voice);
                  }
                  return;
                }

                updateTts({
                  voiceStyle: value,
                  voiceName: "Voce preset",
                  savedVoiceId: undefined,
                  voiceStylePath: activeSupertonicVoice ? "" : settings.tts.voiceStylePath
                });
              }}
            >
              <optgroup label="Preset">
                {SUPERTONIC_VOICES.map((voice) => (
                  <option key={voice.value} value={voice.value}>
                    {voice.label}
                  </option>
                ))}
              </optgroup>
              {supertonicVoices.length > 0 ? (
                <optgroup label="Voci salvate">
                  {supertonicVoices.map((voice) => (
                    <option key={voice.id} value={`${SAVED_PREFIX}${voice.id}`}>
                      {voice.name}
                    </option>
                  ))}
                </optgroup>
              ) : null}
            </select>
          </label>

          <label className="setting-item">
            <span>Qualita</span>
            <select
              className="field-minimal"
              value={settings.tts.qualitySteps ?? 8}
              onChange={(event) => updateTts({ qualitySteps: Number(event.target.value) })}
            >
              {QUALITY_LEVELS.map((level) => (
                <option key={level.value} value={level.value}>
                  {level.label}
                </option>
              ))}
            </select>
            <p className="settings-note">
              Meno step = piu veloce. Su questo Mac, qualita bilanciata viaggia a circa 5-6x in tempo reale con i chunk in parallelo.
            </p>
          </label>

          {activeSupertonicVoice ? null : (
          <label className="setting-item">
            <span>Voce personalizzata (JSON)</span>
            <input
              className="field-minimal"
              placeholder="Opzionale: /percorso/voce.json da Voice Builder"
              value={settings.tts.voiceStylePath ?? ""}
              onChange={(event) =>
                updateTts({ voiceStylePath: event.target.value, savedVoiceId: undefined })
              }
            />
            <p className="settings-note">
              Opzionale. Se vuoi una voce specifica, creala con Supertone Voice Builder e incolla qui il file JSON, oppure salvala nella libreria con "Nuova voce" qui sotto.
            </p>
          </label>
          )}
        </>
      ) : null}

      <label className="setting-item">
        <span>Velocita</span>
        <input
          className="field-minimal"
          type="number"
          min="0.7"
          max="1.4"
          step="0.05"
          value={settings.tts.speakingSpeed}
          onChange={(event) => updateTts({ speakingSpeed: Number(event.target.value) })}
        />
        {isQwen ? (
          <p className="settings-note">
            Nota: Qwen beta ignora il controllo velocita diretto e usa il ritmo nativo del modello.
          </p>
        ) : null}
      </label>

      {isQwen ? (
        <label className="setting-item">
          <span>Voce clonata</span>
          <select
            className="field-minimal"
            value={activeQwenVoice ? activeQwenVoice.id : ""}
            onChange={(event) => {
              const voice = qwenVoices.find((item) => item.id === event.target.value);
              if (voice) {
                applySavedVoice(voice);
              } else {
                clearSavedQwenVoice();
              }
            }}
          >
            <option value="">Campione manuale (non salvato)</option>
            {qwenVoices.map((voice) => (
              <option key={voice.id} value={voice.id}>
                {voice.name}
              </option>
            ))}
          </select>
          {activeQwenVoice ? (
            <p className="settings-note">
              Uso il campione salvato di "{activeQwenVoice.name}" con la sua trascrizione.
            </p>
          ) : qwenVoices.length === 0 ? (
            <p className="settings-note">
              Nessuna voce clonata salvata: usa "Nuova voce" qui sotto per crearne una e riusarla.
            </p>
          ) : null}
        </label>
      ) : null}

      {isQwen && !activeQwenVoice ? (
        <>
          <label className="setting-item">
            <span>Audio riferimento</span>
            <input
              className="field-minimal"
              placeholder="/percorso/voce-riferimento.wav"
              value={settings.tts.referenceAudioPath ?? ""}
              onChange={(event) =>
                updateTts({
                  voiceMode: "reference",
                  savedVoiceId: undefined,
                  referenceAudioPath: event.target.value
                })
              }
            />
            <div className="runtime-actions">
              <button
                type="button"
                className="button button-ghost"
                onClick={onPickReferenceFile}
              >
                Scegli file audio
              </button>
              {settings.tts.referenceAudioPath?.trim() ? (
                <button
                  type="button"
                  className="button button-ghost"
                  onClick={() =>
                    setVoiceSeed({
                      key: Date.now(),
                      engine: "qwen",
                      sourcePath: settings.tts.referenceAudioPath,
                      referenceText: settings.tts.referenceText
                    })
                  }
                >
                  Salva come voce
                </button>
              ) : null}
              {settings.tts.referenceAudioPath?.trim() ? (
                <button
                  type="button"
                  className="button button-ghost"
                  onClick={() =>
                    updateTts({
                      voiceMode: "reference",
                      referenceAudioPath: "",
                      referenceText: "",
                      voiceName: "Voce da sample"
                    })
                  }
                >
                  Rimuovi
                </button>
              ) : null}
            </div>
            <p className="settings-note">
              Obbligatorio. Usa un sample pulito di 30-90 secondi, una sola voce, senza musica.
            </p>
          </label>

          <label className="setting-item">
            <span>Testo del sample</span>
            <textarea
              className="field-minimal"
              rows={4}
              placeholder="Incolla qui la trascrizione del sample per migliorare il clone."
              value={settings.tts.referenceText ?? ""}
              onChange={(event) =>
                updateTts({
                  voiceMode: "reference",
                  referenceText: event.target.value
                })
              }
            />
            <p className="settings-note">
              Obbligatorio: Qwen usa audio + trascrizione del sample per avvicinarsi meglio al ritmo della voce di riferimento.
            </p>
          </label>
        </>
      ) : null}

      <VoiceLibrary
        voices={voices}
        activeVoiceId={settings.tts.savedVoiceId}
        seed={voiceSeed}
        notify={notify}
        onUse={(voice) => {
          applySavedVoice(voice);
          notify({ level: "success", title: "Voce selezionata", detail: voice.name });
        }}
        onCreated={(voice) => {
          onVoicesChange([...voices, voice]);
          applySavedVoice(voice);
        }}
        onRenamed={(voice) => {
          onVoicesChange(voices.map((item) => (item.id === voice.id ? voice : item)));
          if (settings.tts.savedVoiceId === voice.id) {
            updateTts({ voiceName: voice.name });
          }
        }}
        onRemoved={handleVoiceRemoved}
      />

      <label className="setting-item">
        <span>Formato</span>
        <div className="segmented-minimal">
          {(["mp3", "wav"] as const).map((format) => (
            <button
              key={format}
              type="button"
              className={settings.preferredAudioFormat === format ? "active" : ""}
              onClick={() =>
                onChange({
                  ...settings,
                  preferredAudioFormat: format
                })
              }
            >
              {format.toUpperCase()}
            </button>
          ))}
        </div>
      </label>

      <label className="setting-toggle">
        <span>Unisci per capitolo</span>
        <input
          type="checkbox"
          checked={settings.mergeByChapter}
          onChange={(event) =>
            onChange({
              ...settings,
              mergeByChapter: event.target.checked
            })
          }
        />
      </label>

      <label className="setting-toggle">
        <span>Log dettagliati e Ispeziona elemento</span>
        <input
          type="checkbox"
          checked={showDetailedLogs}
          onChange={(event) => {
            console.log("[grillo] toggle detailed logs", event.target.checked);
            onToggleDetailedLogs(event.target.checked);
          }}
        />
      </label>
    </div>
  );
}
