import type { RuntimeStatus } from "@shared/contracts";

export function RuntimeSetup({ runtime }: { runtime: RuntimeStatus }) {
  const installing = runtime.state === "installing";
  const checking = runtime.state === "checking";

  return (
    <div className="flex h-full items-center justify-center p-10">
      <div className="w-full max-w-lg rounded-3xl border border-line bg-panel p-8">
        <p className="eyebrow">Primo avvio</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Installiamo la voce</h1>
        <p className="mt-3 text-sm leading-relaxed text-mute">
          Grillo parlante usa OmniVoice, un modello vocale che gira interamente sul tuo Mac. Va scaricato una
          sola volta (circa 5 GB tra PyTorch e il modello). Poi funziona anche senza internet.
        </p>

        <div className="mt-6 rounded-2xl bg-white p-4">
          <p className="text-sm font-medium">{runtime.message}</p>
          {runtime.detail && <p className="mt-1 whitespace-pre-wrap text-xs text-mute">{runtime.detail}</p>}
          {runtime.installHint && (
            <p className="mt-2 text-xs">
              Nel Terminale: <code className="rounded bg-black/5 px-1.5 py-0.5">{runtime.installHint}</code>
            </p>
          )}
          {installing && (
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-black/5">
              <div
                className="h-full bg-accent transition-all duration-700"
                style={{ width: `${Math.round((runtime.progress ?? 0) * 100)}%` }}
              />
            </div>
          )}
        </div>

        <button
          className="btn-primary mt-6 w-full py-3"
          disabled={!runtime.canInstall || installing || checking}
          onClick={() => void window.grillo.installRuntime()}
        >
          {installing ? "Installazione in corso…" : runtime.state === "error" ? "Ripara il motore voce" : "Installa il motore voce"}
        </button>
      </div>
    </div>
  );
}
