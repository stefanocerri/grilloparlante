import type { RuntimeProgress, RuntimeStatus } from "@shared/contracts";

interface RuntimeSetupPanelProps {
  runtimeStatus: RuntimeStatus | null;
  runtimeProgress: RuntimeProgress | null;
  isBusy: boolean;
  onInstall: () => void;
  onRepair: () => void;
  onRemove: () => void;
  onOpenFolder: () => void;
}

export function RuntimeSetupPanel({
  runtimeStatus,
  runtimeProgress,
  isBusy,
  onInstall,
  onRepair,
  onRemove,
  onOpenFolder
}: RuntimeSetupPanelProps) {
  if (!runtimeStatus) {
    return (
      <section className="panel-minimal runtime-panel">
        <div className="section-head">
          <span>Motore voce</span>
          <span>Controllo</span>
        </div>
        <div className="runtime-panel-body">
          <p className="status-message">Controllo del runtime Qwen in corso.</p>
        </div>
      </section>
    );
  }

  const labelMap: Record<RuntimeStatus["state"], string> = {
    checking: "Controllo",
    missing: "Da installare",
    installing: "Installazione",
    ready: "Pronto",
    error: "Errore",
    removing: "Rimozione"
  };

  const effectiveProgress =
    runtimeProgress?.progress ??
    (runtimeStatus.state === "ready" ? 1 : runtimeStatus.state === "installing" ? 0.12 : 0);

  return (
    <section className="panel-minimal runtime-panel">
      <div className="section-head">
        <span>Motore voce</span>
        <span>{labelMap[runtimeStatus.state]}</span>
      </div>

      <div className="runtime-panel-body">
        <div className="runtime-panel-topline">
          <strong>{runtimeStatus.message}</strong>
          <span className={`runtime-badge is-${runtimeStatus.state}`}>
            {labelMap[runtimeStatus.state]}
          </span>
        </div>

        <p className="runtime-panel-copy">
          {runtimeProgress?.message ??
            runtimeStatus.detail ??
            (runtimeStatus.state === "ready"
              ? "Il backend locale usera il runtime gestito Qwen. Per parlare con una voce reale devi selezionare un sample nelle impostazioni."
              : runtimeStatus.fallbackAllowed
                ? "In sviluppo puoi continuare con il fallback placeholder finche non installi Qwen beta."
                : "Completa il setup prima di avviare la conversione.")}
        </p>

        {runtimeStatus.state === "installing" && (
          <div className="progress-minimal runtime-progress">
            <div
              className="progress-minimal-fill"
              style={{ width: `${Math.round(effectiveProgress * 100)}%` }}
            />
          </div>
        )}

        {runtimeProgress?.step ? (
          <p className="runtime-step">
            Step: <strong>{runtimeProgress.step}</strong>
          </p>
        ) : null}

        {runtimeProgress?.detail ? (
          <code className="runtime-code">{runtimeProgress.detail}</code>
        ) : null}

        {runtimeStatus.installHint ? (
          <code className="runtime-code">{runtimeStatus.installHint}</code>
        ) : null}

        <div className="runtime-actions">
          {runtimeStatus.state === "missing" ? (
            <button
              type="button"
              className="button"
              onClick={onInstall}
              disabled={!runtimeStatus.canInstall || isBusy}
            >
              Installa motore
            </button>
          ) : null}

          {runtimeStatus.state === "error" ? (
            <button
              type="button"
              className="button"
              onClick={onRepair}
              disabled={!runtimeStatus.canRepair || isBusy}
            >
              Ripara motore
            </button>
          ) : null}

          {runtimeStatus.canRemove ? (
            <button
              type="button"
              className="button button-ghost"
              onClick={onRemove}
              disabled={isBusy}
            >
              Rimuovi runtime
            </button>
          ) : null}

          {runtimeStatus.canRemove || runtimeStatus.state === "ready" ? (
            <button
              type="button"
              className="button button-ghost"
              onClick={onOpenFolder}
              disabled={isBusy}
            >
              Apri cartella runtime
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}
