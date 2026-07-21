import type { ConversionSettings } from "@shared/contracts";

interface SettingsPanelProps {
  settings: ConversionSettings;
  showDetailedLogs: boolean;
  onChange: (next: ConversionSettings) => void;
  onToggleDetailedLogs: (next: boolean) => void;
  onPickReferenceFile: () => void;
}

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
  onPickReferenceFile
}: SettingsPanelProps) {
  const engine = settings.tts.engine;
  const isSupertonic = engine === "supertonic";
  const isQwen = engine === "qwen";

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
              updateTts({
                engine: "qwen",
                voiceMode: "reference",
                voiceName: settings.tts.voiceName || "Voce da sample"
              });
            } else {
              updateTts({
                engine: "supertonic",
                voiceMode: "standard",
                voiceName: "Voce preset",
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
              value={settings.tts.voiceStyle || "F1"}
              onChange={(event) => updateTts({ voiceStyle: event.target.value })}
            >
              {SUPERTONIC_VOICES.map((voice) => (
                <option key={voice.value} value={voice.value}>
                  {voice.label}
                </option>
              ))}
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

          <label className="setting-item">
            <span>Voce personalizzata (JSON)</span>
            <input
              className="field-minimal"
              placeholder="Opzionale: /percorso/voce.json da Voice Builder"
              value={settings.tts.voiceStylePath ?? ""}
              onChange={(event) => updateTts({ voiceStylePath: event.target.value })}
            />
            <p className="settings-note">
              Opzionale. Se vuoi una voce specifica, creala con Supertone Voice Builder e incolla qui il file JSON. Altrimenti uso la voce preset scelta sopra.
            </p>
          </label>
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
