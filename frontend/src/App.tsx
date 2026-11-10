import { useEffect, useState } from "react";
import type { AppSnapshot } from "@shared/contracts";
import { ArrowLeft, Settings as SettingsIcon } from "lucide-react";
import { BookDetail } from "./components/BookDetail";
import { Home } from "./components/Home";
import { NewItem } from "./components/NewItem";
import { Onboarding } from "./components/Onboarding";
import { RuntimeSetup } from "./components/RuntimeSetup";
import { Settings } from "./components/Settings";
import { Mark } from "./components/ui";
import { useSnapshot } from "./lib/useSnapshot";

type View = { kind: "home" } | { kind: "new"; filePath: string } | { kind: "book"; id: string } | { kind: "settings" };

export function App() {
  const snapshot = useSnapshot();
  const [view, setView] = useState<View>({ kind: "home" });

  // File trascinato sull'icona nella barra dei menu.
  useEffect(() => window.grillo.onFileDropped((filePath) => setView({ kind: "new", filePath })), []);

  useEffect(() => {
    if (view.kind === "book" && snapshot && !snapshot.books.some((book) => book.id === view.id)) {
      setView({ kind: "home" });
    }
  }, [snapshot, view]);

  if (!snapshot) return <div className="h-full bg-bg" />;

  if (!snapshot.onboarded) {
    return <Onboarding snapshot={snapshot} onPickFile={(filePath) => setView({ kind: "new", filePath })} />;
  }

  const book = view.kind === "book" ? snapshot.books.find((item) => item.id === view.id) : undefined;
  const engineReady = snapshot.runtime.state === "ready";
  const crumb =
    view.kind === "new" ? "Nuovo" : view.kind === "settings" ? "Impostazioni" : view.kind === "book" ? book?.title : null;
  const home = () => setView({ kind: "home" });

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-line px-3">
        {view.kind === "home" ? (
          <Mark />
        ) : (
          <button className="icon-btn -ml-1" onClick={home} title="Indietro">
            <ArrowLeft size={16} />
          </button>
        )}
        <button className="shrink-0 text-sm font-semibold" onClick={home}>
          Grillo parlante
        </button>
        {crumb && (
          <>
            <span className="text-faint">/</span>
            <p className="min-w-0 truncate text-sm text-mute">{crumb}</p>
          </>
        )}
        <span className="flex-1" />
        {view.kind !== "settings" && (
          <button className="icon-btn -mr-1" onClick={() => setView({ kind: "settings" })} title="Impostazioni">
            <SettingsIcon size={15} />
          </button>
        )}
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto">
        {view.kind === "settings" ? (
          <Settings snapshot={snapshot} />
        ) : !engineReady ? (
          <RuntimeSetup runtime={snapshot.runtime} />
        ) : view.kind === "new" ? (
          <NewItem
            snapshot={snapshot}
            filePath={view.filePath}
            onChangeFile={(filePath) => setView({ kind: "new", filePath })}
            onImported={(id) => setView({ kind: "book", id })}
          />
        ) : book ? (
          <BookDetail book={book} snapshot={snapshot} onDeleted={home} />
        ) : (
          <Home
            snapshot={snapshot}
            onPickFile={(filePath) => setView({ kind: "new", filePath })}
            onOpenBook={(id) => setView({ kind: "book", id })}
          />
        )}
      </main>

      <StatusBar snapshot={snapshot} onOpenSettings={() => setView({ kind: "settings" })} />
    </div>
  );
}

/** Barra in basso: stato del narratore e di Turso, sempre visibile. */
function StatusBar({ snapshot, onOpenSettings }: { snapshot: AppSnapshot; onOpenSettings: () => void }) {
  const runtime = snapshot.runtime;
  const engine =
    runtime.state === "ready"
      ? { dot: "bg-ok", text: runtime.device === "mps" ? "Narratore pronto · GPU" : "Narratore pronto" }
      : runtime.state === "installing"
        ? { dot: "bg-accent animate-pulse", text: "Installazione…" }
        : runtime.state === "checking"
          ? { dot: "bg-faint", text: "Controllo…" }
          : { dot: "bg-danger", text: "Narratore da installare" };
  const sync =
    snapshot.sync.state === "off"
      ? { dot: "bg-faint/50", text: "Telefono non collegato" }
      : snapshot.sync.state === "uploading"
        ? { dot: "bg-accent animate-pulse", text: "Carico su Turso…" }
        : snapshot.sync.state === "error"
          ? { dot: "bg-danger", text: "Errore Turso" }
          : { dot: "bg-ok", text: "Turso" };

  return (
    <footer className="flex h-8 shrink-0 items-center gap-3 border-t border-line bg-subtle px-3 text-2xs text-mute">
      <span className="flex items-center gap-1.5" title={runtime.message}>
        <span className={`dot ${engine.dot}`} />
        {engine.text}
      </span>
      <span className="flex-1" />
      <button className="flex items-center gap-1.5 hover:text-ink" title={snapshot.sync.message} onClick={onOpenSettings}>
        <span className={`dot ${sync.dot}`} />
        {sync.text}
      </button>
    </footer>
  );
}
