import { useEffect, useState } from "react";
import { ArrowLeft, Settings as SettingsIcon } from "lucide-react";
import { BookDetail } from "./components/BookDetail";
import { Home } from "./components/Home";
import { NewItem } from "./components/NewItem";
import { RuntimeSetup } from "./components/RuntimeSetup";
import { Settings } from "./components/Settings";
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

  if (!snapshot) return <div className="h-full" />;

  const book = view.kind === "book" ? snapshot.books.find((item) => item.id === view.id) : undefined;
  const engineReady = snapshot.runtime.state === "ready";
  const title =
    view.kind === "new" ? "Nuovo" : view.kind === "settings" ? "Impostazioni" : view.kind === "book" ? "" : "Grillo parlante";

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-11 shrink-0 items-center gap-1 border-b border-line px-2">
        {view.kind !== "home" ? (
          <button className="icon-btn" onClick={() => setView({ kind: "home" })} title="Indietro">
            <ArrowLeft size={16} />
          </button>
        ) : (
          <span className="w-1" />
        )}
        <p className="flex-1 truncate text-sm font-semibold">{title}</p>
        {view.kind !== "settings" && (
          <button className="icon-btn" onClick={() => setView({ kind: "settings" })} title="Impostazioni">
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
          <BookDetail book={book} snapshot={snapshot} onDeleted={() => setView({ kind: "home" })} />
        ) : (
          <Home
            snapshot={snapshot}
            onPickFile={(filePath) => setView({ kind: "new", filePath })}
            onOpenBook={(id) => setView({ kind: "book", id })}
          />
        )}
      </main>
    </div>
  );
}
