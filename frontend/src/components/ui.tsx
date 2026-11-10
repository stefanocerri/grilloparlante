import { lazy, Suspense, useState, type ReactNode } from "react";
import { Check, Copy, Loader2, X } from "lucide-react";
import markUrl from "../../../assets/tray.svg";

/** Logo: la sagoma del grillo (assets/tray.svg) nel colore del testo, quindi nera sul chiaro e bianca sullo scuro. */
export function Mark({ size = 24 }: { size?: number }) {
  const mask = `url("${markUrl}") center / contain no-repeat`;
  return <span className="inline-block shrink-0 bg-ink" style={{ width: size, height: size, mask, WebkitMask: mask }} />;
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
