import type { ReactNode } from "react";
import type { AppSnapshot } from "@shared/contracts";
import { FolderOpen, Power, RefreshCw, Wand2 } from "lucide-react";
import { PhoneQr, TursoForm } from "./TursoForm";

function Section({ title, description, children, action }: { title: string; description?: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="card overflow-hidden">
      <div className="flex items-start gap-2 border-b border-line px-3 py-2.5">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{title}</p>
          {description && <p className="mt-0.5 text-xs leading-relaxed text-mute">{description}</p>}
        </div>
        {action}
      </div>
      <div className="p-3">{children}</div>
    </section>
  );
}

export function Settings({ snapshot }: { snapshot: AppSnapshot }) {
  const syncDot =
    snapshot.sync.state === "error"
      ? "bg-danger"
      : snapshot.sync.state === "uploading"
        ? "bg-accent animate-pulse"
        : snapshot.sync.state === "idle"
          ? "bg-ok"
          : "bg-faint/50";

  return (
    <div className="flex flex-col gap-3 p-3">
      <Section
        title="Turso"
        description="Ogni capitolo pronto viene caricato sul tuo database; l'app del telefono lo legge da lì. Le notizie scadute vengono tolte da Turso (sul Mac restano)."
        action={
          <button
            className="icon-btn -mr-1"
            title="Ricarica tutto su Turso"
            disabled={snapshot.sync.state === "off"}
            onClick={() => void window.grillo.syncTurso()}
          >
            <RefreshCw size={14} />
          </button>
        }
      >
        <TursoForm snapshot={snapshot} />
        <p className="mt-3 flex items-center gap-1.5 text-2xs text-mute">
          <span className={`dot ${syncDot}`} />
          {snapshot.sync.message}
        </p>
      </Section>

      <Section title="Telefono">
        <PhoneQr snapshot={snapshot} />
      </Section>

      <Section title="Motore voce">
        <p className="text-xs text-mute">
          {snapshot.runtime.message}
          {snapshot.runtime.device ? ` · ${snapshot.runtime.device}` : ""}
        </p>
      </Section>

      <Section title="Libreria">
        <button
          className="flex w-full items-center gap-2 text-left font-mono text-2xs text-mute hover:text-ink"
          onClick={() => void window.grillo.revealLibrary()}
        >
          <FolderOpen size={13} className="shrink-0" />
          <span className="truncate">{snapshot.libraryDir}</span>
        </button>
      </Section>

      <div className="flex gap-2">
        <button className="btn-secondary flex-1" onClick={() => void window.grillo.restartOnboarding()}>
          <Wand2 size={14} /> Configurazione guidata
        </button>
        <button className="btn-secondary flex-1" onClick={() => void window.grillo.quit()}>
          <Power size={14} /> Esci
        </button>
      </div>
    </div>
  );
}
