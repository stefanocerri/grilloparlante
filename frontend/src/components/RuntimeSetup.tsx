import type { RuntimeStatus } from "@shared/contracts";
import { Download } from "lucide-react";

/** Se il narratore manca (es. configurazione saltata): stessa cosa del passo 3 della guida, in breve. */
export function RuntimeSetup({ runtime }: { runtime: RuntimeStatus }) {
  const installing = runtime.state === "installing";
  const checking = runtime.state === "checking";
  const percent = Math.round((runtime.progress ?? 0) * 100);

  return (
    <div className="p-3">
      <div className="card p-4">
        <p className="eyebrow">Narratore</p>
        <h1 className="mt-1.5 text-base font-semibold">Installiamo la voce</h1>
        <p className="mt-1.5 text-xs leading-relaxed text-mute">
          Grillo parlante usa OmniVoice, un modello che gira interamente sul tuo Mac. Si scarica una volta sola
          (circa 5 GB), poi funziona anche senza internet.
        </p>

        <div className="mt-4 rounded-md border border-line bg-subtle p-3">
          <div className="flex items-center gap-2">
            <p className="flex-1 text-sm font-medium">{runtime.message}</p>
            {installing && <span className="font-mono text-xs text-mute">{percent}%</span>}
          </div>
          {runtime.detail && <p className="mt-1 whitespace-pre-wrap text-xs text-mute">{runtime.detail}</p>}
          {runtime.installHint && (
            <p className="mt-2 text-xs text-mute">
              Nel Terminale: <code className="rounded border border-line bg-bg px-1.5 py-0.5 font-mono">{runtime.installHint}</code>
            </p>
          )}
          {installing && (
            <div className="progress mt-3">
              <div style={{ width: `${percent}%` }} />
            </div>
          )}
        </div>

        <button
          className="btn-primary mt-4 w-full"
          disabled={!runtime.canInstall || installing || checking}
          onClick={() => void window.grillo.installRuntime()}
        >
          <Download size={14} />
          {installing ? "Installazione in corso…" : runtime.state === "error" ? "Ripara il narratore" : "Installa il narratore"}
        </button>
        <button className="btn-ghost mt-1 w-full" onClick={() => void window.grillo.restartOnboarding()}>
          Apri la configurazione guidata
        </button>
      </div>
    </div>
  );
}
