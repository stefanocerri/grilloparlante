import type { ReactNode } from "react";
import type { AppSnapshot, ThemeChoice } from "@shared/contracts";
import { FolderOpen, Monitor, Moon, Power, Sun, Wand2 } from "lucide-react";
import { ChannelList } from "./Channels";
import { CustomVoices } from "./VoiceCreate";

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

export function Settings({ snapshot, onNewVoice }: { snapshot: AppSnapshot; onNewVoice: () => void }) {
  return (
    <div className="flex flex-col gap-3 p-3">
      <Section
        title="App collegate"
        description="Ogni app ha il suo database su Turso e riceve solo i libri che mandi a lei. I libri restano sempre anche sul Mac."
      >
        <ChannelList snapshot={snapshot} />
      </Section>

      <Section title="Voci" description="Oltre alle quattro voci incluse puoi crearne di nuove da un campione audio.">
        <CustomVoices snapshot={snapshot} onNew={onNewVoice} />
      </Section>

      <Section title="Aspetto">
        <ThemePicker value={snapshot.theme} />
      </Section>

      <Section title="Narratore" description="OmniVoice, il modello che legge i tuoi libri. Gira sul Mac, anche senza internet.">
        <p className="text-xs text-mute">{snapshot.runtime.message}</p>
      </Section>

      <Section title="Libreria sul Mac" description="Una cartella per libro, con testo, copertina e MP3 di ogni capitolo.">
        <button
          className="flex w-full items-center gap-2 text-left font-mono text-2xs text-mute hover:text-ink"
          onClick={() => void window.grillo.revealLibrary()}
        >
          <FolderOpen size={13} className="shrink-0" />
          <span className="truncate">{snapshot.libraryDir}/books</span>
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
