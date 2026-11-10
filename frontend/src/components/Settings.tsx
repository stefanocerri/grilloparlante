import type { ReactNode } from "react";
import type { AppSnapshot, ThemeChoice } from "@shared/contracts";
import { FolderOpen, Monitor, Moon, Power, RefreshCw, Sun, Wand2 } from "lucide-react";
import { AppQrs, Disclosure, TursoForm, TursoSetup, tursoConfigured } from "./TursoForm";

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

  const configured = tursoConfigured(snapshot);

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
        <div className="space-y-4">
          {configured ? (
            <div className="space-y-1">
              <p className="flex items-center gap-1.5 text-xs">
                <span className={`dot ${syncDot}`} />
                {snapshot.sync.message}
              </p>
              <p className="truncate font-mono text-2xs text-faint">{snapshot.turso.url}</p>
            </div>
          ) : (
            <TursoSetup />
          )}
          <Disclosure title={configured ? "Modifica a mano" : "Configurazione avanzata (ho già un database)"}>
            <TursoForm snapshot={snapshot} />
          </Disclosure>
          {configured && (
            <Disclosure title="Configura di nuovo con un Platform API token">
              <TursoSetup />
            </Disclosure>
          )}
        </div>
      </Section>

      <Section title="App di ascolto" description="Un QR per ogni app del telefono. Nel QR c'è solo la chiave di sola lettura.">
        <AppQrs snapshot={snapshot} />
      </Section>

      <Section title="Aspetto">
        <ThemePicker value={snapshot.theme} />
      </Section>

      <Section title="Narratore" description="OmniVoice, il modello che legge i tuoi libri. Gira sul Mac, anche senza internet.">
        <p className="text-xs text-mute">{snapshot.runtime.message}</p>
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

const THEMES: { id: ThemeChoice; label: string; icon: typeof Sun }[] = [
  { id: "system", label: "Sistema", icon: Monitor },
  { id: "light", label: "Chiaro", icon: Sun },
  { id: "dark", label: "Scuro", icon: Moon }
];

/** Chiaro, scuro o come Impostazioni di Sistema → Aspetto. */
function ThemePicker({ value }: { value: ThemeChoice }) {
  return (
    <div className="flex gap-0.5 rounded-md border border-line bg-subtle p-0.5">
      {THEMES.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          onClick={() => void window.grillo.setTheme(id)}
          className={`flex h-7 flex-1 items-center justify-center gap-1.5 rounded text-xs font-medium transition-colors ${
            value === id ? "bg-bg text-ink shadow-[0_0_0_1px_rgb(var(--line))]" : "text-mute hover:text-ink"
          }`}
        >
          <Icon size={13} /> {label}
        </button>
      ))}
    </div>
  );
}
