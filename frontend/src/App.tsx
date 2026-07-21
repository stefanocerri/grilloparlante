import { useEffect, useRef, useState } from "react";
import { CircleAlert, FolderOpen, Play, Settings2, StopCircle } from "lucide-react";
import type {
  ConversionResult,
  ConversionSettings,
  InputFileMeta,
  JobEvent,
  JobEventMap,
  JobStats,
  RuntimeEvent,
  RuntimeProgress,
  RuntimeStatus
} from "@shared/contracts";
import { Dropzone } from "./components/Dropzone";
import { RuntimeSetupPanel } from "./components/RuntimeSetupPanel";
import { SettingsPanel } from "./components/SettingsPanel";
import { DEFAULT_SETTINGS, STAGE_TITLES, formatElapsed } from "./lib/defaults";

interface LogEntry {
  level: "info" | "warning" | "error";
  message: string;
  detail?: string;
  timestamp: string;
}

interface ToastEntry {
  id: number;
  level: "info" | "warning" | "error" | "success";
  title: string;
  detail?: string;
}

const EMPTY_STATS: JobStats = {
  chaptersFound: 0,
  chunksCreated: 0,
  audioChunksGenerated: 0,
  elapsedMs: 0,
  currentStage: "idle"
};

export function App() {
  const isElectronRuntime =
    typeof navigator !== "undefined" && navigator.userAgent.includes("Electron");
  const bridgeAvailable =
    typeof window !== "undefined" && typeof window.grillo !== "undefined";
  const [selectedFile, setSelectedFile] = useState<InputFileMeta | null>(null);
  const [settings, setSettings] = useState<ConversionSettings>(DEFAULT_SETTINGS);
  const [progress, setProgress] = useState(0);
  const [stageMessage, setStageMessage] = useState("In attesa di un file.");
  const [stats, setStats] = useState<JobStats>(EMPTY_STATS);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [result, setResult] = useState<ConversionResult | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [showDetailedLogs, setShowDetailedLogs] = useState(false);
  const [isPickingFile, setIsPickingFile] = useState(false);
  const [runtimeStatus, setRuntimeStatus] = useState<RuntimeStatus | null>(null);
  const [runtimeProgress, setRuntimeProgress] = useState<RuntimeProgress | null>(null);
  const [isRuntimeActionPending, setIsRuntimeActionPending] = useState(false);
  const [toasts, setToasts] = useState<ToastEntry[]>([]);
  const [error, setError] = useState<{ message: string; detail?: string } | null>(
    null
  );
  const settingsRef = useRef<HTMLDivElement | null>(null);
  const toastIdRef = useRef(0);

  const usesManagedRuntime = true;
  const isProcessing =
    stats.currentStage !== "idle" &&
    stats.currentStage !== "completed" &&
    stats.currentStage !== "error" &&
    stats.currentStage !== "cancelled";
  const conversionBlocked =
    usesManagedRuntime &&
    settings.tts.engine === "qwen" &&
    (runtimeStatus?.conversionBlocked ?? false);
  const runtimeBusy =
    usesManagedRuntime &&
    (isRuntimeActionPending ||
      runtimeStatus?.state === "installing" ||
      runtimeStatus?.state === "removing");
  const overallPercent = progress * 100;
  const isTtsStage = stats.currentStage === "tts" && stats.chunksCreated > 0;
  const ttsChunkProgress = isTtsStage
    ? Math.max(0, Math.min(stats.audioChunksGenerated / stats.chunksCreated, 1))
    : 0;
  const visibleProgress = isTtsStage ? ttsChunkProgress : progress;
  const visiblePercent = visibleProgress * 100;
  const progressLabel = isTtsStage
    ? `${Math.round(visiblePercent)}%`
    : `${Math.round(overallPercent)}%`;
  const chunkStatLabel = isTtsStage
    ? `${stats.audioChunksGenerated}/${stats.chunksCreated}`
    : `${stats.chunksCreated}`;
  const chunkStatCaption = isTtsStage ? "Chunk fatti" : "Chunk";
  const progressCaption = isTtsStage ? "Progresso TTS" : "Progresso";
  const ttsDetailLabel = isTtsStage
    ? `Sintesi voce ${stats.audioChunksGenerated}/${stats.chunksCreated}`
    : null;

  useEffect(() => {
    if (!bridgeAvailable) {
      setError({
        message: isElectronRuntime
          ? "Bridge desktop non caricato."
          : "Interfaccia aperta nel browser.",
        detail: isElectronRuntime
          ? "Electron e in esecuzione, ma l'API preload non e stata agganciata correttamente a questa finestra."
          : "Questa schermata di sviluppo e stata aperta nel browser. Per usare le funzioni desktop, apri la finestra Electron avviata dal comando npm run dev."
      });
      return;
    }

    void refreshRuntimeStatus();

    const disposeJob = window.grillo.onJobEvent((event) => {
      handleJobEvent(event);
    });
    const disposeRuntime = window.grillo.onRuntimeEvent((event) => {
      handleRuntimeEvent(event);
    });

    return () => {
      disposeJob();
      disposeRuntime();
    };
  }, [bridgeAvailable, isElectronRuntime]);

  useEffect(() => {
    if (!isSettingsOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node;

      if (settingsRef.current?.contains(target)) {
        return;
      }

      setIsSettingsOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsSettingsOpen(false);
      }
    }

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isSettingsOpen]);

  useEffect(() => {
    if (!showDetailedLogs || !bridgeAvailable) {
      return;
    }

    void window.grillo.openDevTools();
  }, [showDetailedLogs, bridgeAvailable]);

  function appendLog(entry: LogEntry) {
    setLogs((current) => [...current.slice(-149), entry]);
  }

  function pushToast(toast: Omit<ToastEntry, "id">) {
    const id = toastIdRef.current + 1;
    toastIdRef.current = id;

    setToasts((current) => [...current, { id, ...toast }].slice(-4));

    window.setTimeout(() => {
      setToasts((current) => current.filter((entry) => entry.id !== id));
    }, 3200);
  }

  function resetJobState() {
    setSelectedFile(null);
    setProgress(0);
    setStageMessage("In attesa di un file.");
    setStats(EMPTY_STATS);
    setLogs([]);
    setWarnings([]);
    setResult(null);
    setError(null);
  }

  async function refreshRuntimeStatus() {
    if (!bridgeAvailable) {
      return;
    }

    try {
      const nextStatus = await window.grillo.getRuntimeStatus();
      setRuntimeStatus(nextStatus);
    } catch (statusError) {
      const detail =
        statusError instanceof Error
          ? statusError.message
          : "Controllo runtime vocale non riuscito.";

      setRuntimeStatus(null);
      pushToast({
        level: "error",
        title: "Controllo motore voce non riuscito",
        detail
      });
    }
  }

  function handleRuntimeEvent(event: RuntimeEvent) {
    switch (event.type) {
      case "status": {
        const payload = event.payload as RuntimeStatus;
        setRuntimeStatus(payload);
        if (payload.state !== "installing" && payload.state !== "removing") {
          setIsRuntimeActionPending(false);
        }
        if (payload.state === "ready") {
          setRuntimeProgress(null);
        }
        break;
      }
      case "progress": {
        const payload = event.payload as RuntimeProgress;
        setRuntimeProgress(payload);
        if (payload.state === "error") {
          setIsRuntimeActionPending(false);
        }
        break;
      }
      default:
        break;
    }
  }

  function handleJobEvent(event: JobEvent) {
    switch (event.type) {
      case "ready": {
        const payload = event.payload as JobEventMap["ready"];
        setSelectedFile(payload.file);
        appendLog({
          level: "info",
          message: "File caricato",
          detail: payload.file.path,
          timestamp: event.timestamp
        });
        pushToast({
          level: "success",
          title: "File caricato",
          detail: payload.file.name
        });
        break;
      }
      case "stage": {
        const payload = event.payload as JobEventMap["stage"];
        setStageMessage(payload.message);
        appendLog({
          level: "info",
          message: payload.label,
          detail: payload.message,
          timestamp: event.timestamp
        });
        break;
      }
      case "progress": {
        const payload = event.payload as JobEventMap["progress"];
        setProgress(payload.progress);
        if (payload.label) {
          setStageMessage(payload.label);
        }
        setStats((current) => ({
          ...current,
          currentStage: payload.stage
        }));
        break;
      }
      case "stats": {
        const payload = event.payload as JobEventMap["stats"];
        setStats((current) => ({
          ...current,
          ...payload
        }));
        break;
      }
      case "warning": {
        const payload = event.payload as JobEventMap["warning"];
        setWarnings((current) => [...current, payload.message]);
        appendLog({
          level: "warning",
          message: payload.message,
          timestamp: event.timestamp
        });
        pushToast({
          level: "warning",
          title: "Attenzione",
          detail: payload.message
        });
        break;
      }
      case "log": {
        const payload = event.payload as JobEventMap["log"];
        appendLog({
          ...payload,
          timestamp: event.timestamp
        });
        break;
      }
      case "result": {
        const payload = event.payload as JobEventMap["result"];
        setProgress(1);
        setStats((current) => ({
          ...current,
          currentStage: "completed"
        }));
        setStageMessage("Conversione completata.");
        setResult(payload);
        pushToast({
          level: "success",
          title: "Conversione completata",
          detail: payload.manifest.title
        });
        break;
      }
      case "cancelled": {
        const payload = event.payload as JobEventMap["cancelled"];
        appendLog({
          level: "warning",
          message: "Conversione annullata",
          detail: payload.jobId,
          timestamp: event.timestamp
        });
        setStats((current) => ({
          ...current,
          currentStage: "cancelled"
        }));
        setStageMessage("La conversione e stata interrotta.");
        pushToast({
          level: "warning",
          title: "Conversione annullata"
        });
        break;
      }
      case "error": {
        const payload = event.payload as JobEventMap["error"];
        appendLog({
          level: "error",
          message: payload.message,
          detail: payload.detail,
          timestamp: event.timestamp
        });
        setError(payload);
        setStats((current) => ({
          ...current,
          currentStage: "error"
        }));
        setStageMessage("La conversione si e fermata.");
        pushToast({
          level: "error",
          title: payload.message,
          detail: payload.detail
        });
        break;
      }
      default:
        break;
    }
  }

  async function startConversion() {
    if (!selectedFile || !bridgeAvailable) {
      pushToast({
        level: "warning",
        title: "Seleziona prima un file"
      });
      return;
    }

    if (
      settings.tts.engine === "qwen" &&
      !settings.tts.referenceAudioPath?.trim()
    ) {
      pushToast({
        level: "warning",
        title: "Aggiungi un audio di riferimento",
        detail: "Qwen richiede sempre un sample voce reale."
      });
      return;
    }

    if (
      settings.tts.engine === "qwen" &&
      !settings.tts.referenceText?.trim()
    ) {
      pushToast({
        level: "warning",
        title: "Aggiungi anche il testo del sample",
        detail: "Per Qwen il testo del sample e obbligatorio se vuoi mantenere meglio ritmo e velocita della voce."
      });
      return;
    }

    if (conversionBlocked) {
      pushToast({
        level: "warning",
        title: "Completa prima il setup voce",
        detail: runtimeStatus?.message
      });
      return;
    }

    resetJobState();
    setSelectedFile(selectedFile);
    setStageMessage("Preparazione della conversione...");
    console.log("[grillo] starting conversion", {
      file: selectedFile,
      settings
    });
    pushToast({
      level: "info",
      title: "Conversione avviata",
      detail: selectedFile.name
    });

    try {
      await window.grillo.startConversion(selectedFile, settings);
    } catch (startError) {
      const detail =
        startError instanceof Error ? startError.message : "Avvio conversione non riuscito.";

      setError({
        message: "Non sono riuscito ad avviare la conversione.",
        detail
      });
      pushToast({
        level: "error",
        title: "Avvio non riuscito",
        detail
      });
    }
  }

  async function cancelConversion() {
    if (!bridgeAvailable) {
      return;
    }

    try {
      await window.grillo.cancelConversion();
    } catch (cancelError) {
      const detail =
        cancelError instanceof Error ? cancelError.message : "Annullamento non riuscito.";

      pushToast({
        level: "error",
        title: "Non sono riuscito ad annullare",
        detail
      });
    }
  }

  async function pickFile() {
    if (!bridgeAvailable) {
      pushToast({
        level: "error",
        title: "Bridge desktop non disponibile"
      });
      return;
    }

    setIsPickingFile(true);
    console.log("[grillo] pickFile requested");
    pushToast({
      level: "info",
      title: "Apertura selettore file"
    });

    try {
      const file = await window.grillo.selectFile();

      if (!file) {
        console.log("[grillo] pickFile cancelled or no file selected");
        pushToast({
          level: "info",
          title: "Nessun file selezionato"
        });
        return;
      }

      setSelectedFile(file);
      console.log("[grillo] pickFile selected", file);
      setError(null);
      setResult(null);
      setStageMessage("File pronto per la conversione.");
      pushToast({
        level: "success",
        title: "File selezionato",
        detail: file.name
      });
    } catch (pickError) {
      console.error("[grillo] pickFile failed", pickError);
      const detail =
        pickError instanceof Error ? pickError.message : "Apertura del selettore file non riuscita.";

      setError({
        message: "Non sono riuscito ad aprire il selettore file.",
        detail
      });
      pushToast({
        level: "error",
        title: "Selezione file non riuscita",
        detail
      });
    } finally {
      setIsPickingFile(false);
    }
  }

  async function pickReferenceFile() {
    if (!bridgeAvailable) {
      pushToast({
        level: "error",
        title: "Bridge desktop non disponibile"
      });
      return;
    }

    try {
      const filePath = await window.grillo.selectReferenceFile();

      if (!filePath) {
        return;
      }

      setSettings((current) => ({
        ...current,
        tts: {
          ...current.tts,
          engine: "qwen",
          voiceMode: "reference",
          referenceAudioPath: filePath
        }
      }));

      pushToast({
        level: "success",
        title: "Voce di riferimento selezionata",
        detail: filePath.split("/").pop() ?? filePath
      });
    } catch (pickError) {
      const detail =
        pickError instanceof Error
          ? pickError.message
          : "Selezione audio di riferimento non riuscita.";

      pushToast({
        level: "error",
        title: "Non sono riuscito a leggere il sample voce",
        detail
      });
    }
  }

  async function handleRuntimeInstall(mode: "install" | "repair") {
    if (!bridgeAvailable) {
      return;
    }

    setIsRuntimeActionPending(true);
    setRuntimeProgress(null);

    try {
      const nextStatus =
        mode === "repair"
          ? await window.grillo.repairRuntime()
          : await window.grillo.installRuntime();

      setRuntimeStatus(nextStatus);
      pushToast({
        level: "success",
        title: mode === "repair" ? "Runtime riparato" : "Runtime installato",
        detail: nextStatus.message
      });
    } catch (runtimeError) {
      const detail =
        runtimeError instanceof Error ? runtimeError.message : "Operazione runtime non riuscita.";

      pushToast({
        level: "error",
        title: mode === "repair" ? "Riparazione non riuscita" : "Installazione non riuscita",
        detail
      });
      void refreshRuntimeStatus();
    } finally {
      setIsRuntimeActionPending(false);
    }
  }

  async function handleRuntimeRemove() {
    if (!bridgeAvailable || !runtimeStatus) {
      return;
    }

    const confirmed = window.confirm(
      "Vuoi rimuovere il runtime Qwen beta e i dati locali associati?"
    );

    if (!confirmed) {
      return;
    }

    setIsRuntimeActionPending(true);

    try {
      const nextStatus = await window.grillo.removeRuntime();
      setRuntimeStatus(nextStatus);
      setRuntimeProgress(null);
      pushToast({
        level: "success",
        title: "Runtime rimosso",
        detail: "Puoi reinstallarlo in qualsiasi momento dal pannello motore voce."
      });
    } catch (runtimeError) {
      const detail =
        runtimeError instanceof Error ? runtimeError.message : "Rimozione runtime non riuscita.";

      pushToast({
        level: "error",
        title: "Rimozione non riuscita",
        detail
      });
      void refreshRuntimeStatus();
    } finally {
      setIsRuntimeActionPending(false);
    }
  }

  const messageCards: Array<{ level: LogEntry["level"]; message: string; detail?: string }> = [];

  if (error) {
    messageCards.push({
      level: "error",
      message: error.message,
      detail: error.detail
    });
  }

  for (const warning of warnings.slice(-2)) {
    messageCards.push({
      level: "warning",
      message: warning
    });
  }

  for (const log of logs.slice(-12).reverse()) {
    if (log.level === "info") {
      continue;
    }

    if (messageCards.length >= 4) {
      break;
    }

    if (
      messageCards.some(
        (entry) => entry.message === log.message && entry.detail === log.detail
      )
    ) {
      continue;
    }

    messageCards.push(log);
  }

  return (
    <main className="app-shell minimal-shell">
      <div className="window-chrome">
        <div className="window-drag-zone">
          <div className="window-controls">
            <button
              type="button"
              className="window-control"
              aria-label="Chiudi finestra"
              onClick={() => bridgeAvailable && void window.grillo.closeWindow()}
            />
            <button
              type="button"
              className="window-control"
              aria-label="Riduci a icona"
              onClick={() => bridgeAvailable && void window.grillo.minimizeWindow()}
            />
            <button
              type="button"
              className="window-control"
              aria-label="Ingrandisci finestra"
              onClick={() => bridgeAvailable && void window.grillo.toggleFullscreen()}
            />
          </div>
          <span className="window-title">Grillo parlante</span>
        </div>
      </div>

      <div className="window-content">
        <section className="panel-minimal panel-top">
          <h1 className="app-title">Grillo parlante</h1>
          <p className="app-subtitle">
            Carica un libro, avvia la conversione locale e controlla stato e risultati.
          </p>
        </section>

        <section className="single-column-layout">
          {settings.tts.engine === "qwen" ? (
            <RuntimeSetupPanel
              runtimeStatus={runtimeStatus}
              runtimeProgress={runtimeProgress}
              isBusy={runtimeBusy || isProcessing}
              onInstall={() => void handleRuntimeInstall("install")}
              onRepair={() => void handleRuntimeInstall("repair")}
              onRemove={() => void handleRuntimeRemove()}
              onOpenFolder={() => {
                if (!bridgeAvailable || !runtimeStatus?.runtimeDir) {
                  return;
                }

                void window.grillo.openOutputFolder(runtimeStatus.runtimeDir);
              }}
            />
          ) : null}

          <Dropzone
            file={selectedFile}
            isBusy={isProcessing}
            isPickingFile={isPickingFile}
            canConvert={Boolean(selectedFile) && !isProcessing && !conversionBlocked && !runtimeBusy}
            canReset={Boolean(result || error || selectedFile)}
            onStart={() => void startConversion()}
            onReset={resetJobState}
            onPick={() => void pickFile()}
            onFileDrop={(file, source) => {
              console.log("[grillo] file accepted into app state", { source, file });
              setSelectedFile(file);
              setError(null);
              setResult(null);
              setStageMessage("File pronto per la conversione.");
              pushToast({
                level: "success",
                title: source === "drop" ? "File trascinato correttamente" : "File selezionato",
                detail: file.name
              });
            }}
            onSelectionError={(message) => {
              console.error("[grillo] file selection error", message);
              pushToast({
                level: "error",
                title: "Caricamento file non riuscito",
                detail: message
              });
            }}
          />

          <section className="panel-minimal">
            <div className="section-head">
              <span>Stato</span>
              <span>{STAGE_TITLES[stats.currentStage]}</span>
            </div>

            <div className="status-block">
              <p className="status-message">{stageMessage}</p>
              <div className="progress-minimal">
                <div
                  className="progress-minimal-fill"
                  style={{ width: `${visiblePercent}%` }}
                />
              </div>
              {isTtsStage ? (
                <div className="progress-subtle">
                  <span>{ttsDetailLabel}</span>
                  <span>Totale job {overallPercent.toFixed(1)}%</span>
                </div>
              ) : null}
              <div className="stats-minimal">
                <div>
                  <span>{progressCaption}</span>
                  <strong>{progressLabel}</strong>
                </div>
                <div>
                  <span>Capitoli</span>
                  <strong>{stats.chaptersFound}</strong>
                </div>
                <div>
                  <span>{chunkStatCaption}</span>
                  <strong>{chunkStatLabel}</strong>
                </div>
                <div>
                  <span>Tempo</span>
                  <strong>{formatElapsed(stats.elapsedMs)}</strong>
                </div>
              </div>
              {isProcessing ? (
                <div className="status-actions">
                  <button
                    type="button"
                    className="button button-ghost"
                    onClick={() => void cancelConversion()}
                  >
                    <StopCircle className="h-4 w-4" />
                    Annulla conversione
                  </button>
                </div>
              ) : null}
            </div>

            {messageCards.length > 0 ? (
              <div className="message-strip">
                {messageCards.map((entry, index) => (
                  <div
                    key={`${entry.message}-${index}`}
                    className={`message-toast is-${entry.level}`}
                  >
                    <div className="message-toast-head">
                      <CircleAlert className="h-4 w-4" />
                      <strong>{entry.message}</strong>
                    </div>
                    {entry.detail ? <p>{entry.detail}</p> : null}
                  </div>
                ))}
              </div>
            ) : null}

            {showDetailedLogs ? (
              <div className="log-inline">
                <div className="section-head">
                  <span>Log</span>
                  <span>{logs.length}</span>
                </div>
                <div className="log-minimal">
                  {logs.length > 0 ? (
                    logs.map((entry, index) => (
                      <div key={`${entry.timestamp}-${index}`} className="log-item">
                        <div className={`log-dot log-${entry.level}`} />
                        <div className="log-item-copy">
                          <div className="log-item-head">
                            <strong>{entry.message}</strong>
                            <span>{new Date(entry.timestamp).toLocaleTimeString()}</span>
                          </div>
                          {entry.detail ? <code>{entry.detail}</code> : null}
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="empty-copy">Nessun log dettagliato disponibile.</p>
                  )}
                </div>
              </div>
            ) : null}
          </section>

          {result ? (
            <section className="panel-minimal">
              <div className="section-head">
                <span>Risultato</span>
                <span>{result.chapters.length} capitoli</span>
              </div>

              <div className="result-summary">
                {result.coverUrl ? (
                  <img
                    src={result.coverUrl}
                    alt={`Copertina di ${result.manifest.title}`}
                    className="result-cover"
                  />
                ) : null}
                <strong>{result.manifest.title}</strong>
                <p>
                  {result.manifest.sourceFile} / {result.finalAudioFiles.length} file finali
                </p>
                <div className="result-actions">
                  <button
                    type="button"
                    className="button button-ghost"
                    onClick={() => window.grillo.openOutputFolder(result.outputDir)}
                  >
                    <FolderOpen className="h-4 w-4" />
                    Apri output
                  </button>
                </div>
              </div>

              {result.previewUrl ? (
                <div className="preview-simple">
                  <Play className="h-4 w-4" />
                  <audio controls src={result.previewUrl} className="w-full" />
                </div>
              ) : null}

              <div className="chapter-list-minimal">
                {result.chapters.map((chapter) => (
                  <div key={chapter.id} className="chapter-item">
                    <div>
                      <strong>{chapter.title}</strong>
                      <p>
                        {chapter.chunkCount} chunk / {chapter.textLength} caratteri
                      </p>
                    </div>
                    {chapter.previewUrl ? (
                      <audio controls src={chapter.previewUrl} className="chapter-audio" />
                    ) : null}
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </section>
      </div>

      <div ref={settingsRef} className="settings-fab-shell">
        <button
          type="button"
          className={`settings-fab-trigger ${isSettingsOpen ? "is-active" : ""}`}
          aria-label="Apri impostazioni"
          aria-expanded={isSettingsOpen}
          onClick={() => setIsSettingsOpen((current) => !current)}
        >
          <Settings2 className="h-4 w-4" />
        </button>
        {isSettingsOpen ? (
          <div
            className="settings-popover panel-minimal"
            role="dialog"
            aria-label="Impostazioni conversione"
          >
            <div className="section-head">
              <span>Impostazioni</span>
              <span>Essenziali</span>
            </div>
            <SettingsPanel
              settings={settings}
              showDetailedLogs={showDetailedLogs}
              onChange={setSettings}
              onToggleDetailedLogs={setShowDetailedLogs}
              onPickReferenceFile={() => void pickReferenceFile()}
            />
          </div>
        ) : null}
      </div>

      {toasts.length > 0 ? (
        <div className="toast-stack" aria-live="polite" aria-atomic="true">
          {toasts.map((toast) => (
            <div key={toast.id} className={`toast-card is-${toast.level}`}>
              <strong>{toast.title}</strong>
              {toast.detail ? <p>{toast.detail}</p> : null}
            </div>
          ))}
        </div>
      ) : null}
    </main>
  );
}
