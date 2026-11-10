import { lazy, Suspense, useState, type ReactNode } from "react";
import { Check, Copy, Loader2, X } from "lucide-react";

/** Logo: fumetto con onda sonora, come l'icona dell'app (assets/icon.svg) e quella nella barra dei menu. */
export function Mark({ size = 20 }: { size?: number }) {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-[22%] bg-ink text-bg"
      style={{ width: size, height: size }}
    >
      <svg viewBox="200 260 624 560" width={Math.round(size * 0.6)} height={Math.round(size * 0.6)} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
        <path d="M330 300 h364 a70 70 0 0 1 70 70 v220 a70 70 0 0 1 -70 70 h-214 l-122 96 v-96 h-28 a70 70 0 0 1 -70 -70 v-220 a70 70 0 0 1 70 -70 z" strokeWidth="52" />
        <path d="M412 440 v80 M476 400 v160 M548 418 v124 M612 452 v56" strokeWidth="48" />
      </svg>
    </span>
  );
}

export function Spinner({ size = 14, className = "" }: { size?: number; className?: string }) {
  return <Loader2 size={size} className={`animate-spin ${className}`} />;
}

export type CheckState = "ok" | "fail" | "warn" | "wait";

/** Cerchio con spunta / croce / punto esclamativo, come nelle checklist di deploy. */
export function StatusIcon({ state }: { state: CheckState }) {
  if (state === "wait") return <Spinner size={16} className="text-faint" />;
  const style =
    state === "ok" ? "bg-ok text-white" : state === "fail" ? "bg-danger text-white" : "bg-warn text-white";
  return (
    <span className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${style}`}>
      {state === "ok" ? (
        <Check size={10} strokeWidth={3} />
      ) : state === "fail" ? (
        <X size={10} strokeWidth={3} />
      ) : (
        <span className="text-[10px] font-bold leading-none">!</span>
      )}
    </span>
  );
}

/** Comando da incollare nel Terminale, con pulsante "copia". */
export function CopyCommand({ command }: { command: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await window.grillo.copy(command);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };
  return (
    <div className="flex items-start gap-2 rounded-md border border-line bg-subtle py-1 pl-2.5 pr-1">
      <span className="select-none py-1 font-mono text-xs leading-4 text-faint">$</span>
      <code className="min-w-0 flex-1 py-1 [overflow-wrap:anywhere] font-mono text-xs leading-4">{command}</code>
      <button className="icon-btn h-6 w-6" onClick={copy} title="Copia">
        {copied ? <Check size={13} className="text-ok" /> : <Copy size={13} />}
      </button>
    </div>
  );
}

/** Passo numerato dentro una guida. */
export function Step({ n, title, children }: { n: number; title: ReactNode; children?: ReactNode }) {
  return (
    <li className="group relative flex gap-3 pb-4 last:pb-0">
      <span className="absolute left-[9px] top-6 h-[calc(100%-24px)] w-px bg-line group-last:hidden" />
      <span className="relative z-10 inline-flex h-[19px] w-[19px] shrink-0 items-center justify-center rounded-full border border-line bg-bg font-mono text-2xs text-mute">
        {n}
      </span>
      <div className="min-w-0 flex-1 space-y-2">
        <p className="text-sm leading-[19px]">{title}</p>
        {children}
      </div>
    </li>
  );
}

/** Messaggio di errore di Electron senza il prefisso "Error invoking remote method...". */
export function cleanError(error: unknown) {
  return String((error as Error)?.message ?? error).replace(/^Error invoking remote method '[^']+': (Error: )?/, "");
}

const GrilloModel = lazy(() => import("./GrilloModel"));

/** Il Grillo 3D che gira: three.js si carica a parte, senza rallentare l'apertura del pannello. */
export function Grillo3D({ size = 150 }: { size?: number }) {
  return (
    <div className="shrink-0" style={{ width: size, height: size }}>
      <Suspense fallback={null}>
        <GrilloModel size={size} />
      </Suspense>
    </div>
  );
}
