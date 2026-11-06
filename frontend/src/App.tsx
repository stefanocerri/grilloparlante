import { useEffect, useState } from "react";
import { BookPage } from "./components/BookPage";
import { JobBar } from "./components/JobBar";
import { NewBook } from "./components/NewBook";
import { PhoneSettings } from "./components/PhoneSettings";
import { RuntimeSetup } from "./components/RuntimeSetup";
import { Sidebar, View } from "./components/Sidebar";
import { useSnapshot } from "./lib/useSnapshot";

export function App() {
  const snapshot = useSnapshot();
  const [view, setView] = useState<View>({ kind: "new" });

  useEffect(() => {
    if (view.kind === "book" && snapshot && !snapshot.books.some((book) => book.id === view.id)) {
      setView({ kind: "new" });
    }
  }, [snapshot, view]);

  if (!snapshot) return <div className="drag h-full" />;

  const book = view.kind === "book" ? snapshot.books.find((item) => item.id === view.id) : undefined;
  const engineReady = snapshot.runtime.state === "ready";

  return (
    <div className="flex h-full">
      <Sidebar snapshot={snapshot} view={view} onNavigate={setView} />
      <main className="flex min-w-0 flex-1 flex-col">
        <div className="drag h-14 shrink-0" />
        <div className="flex-1 overflow-y-auto">
          {view.kind === "phone" ? (
            <PhoneSettings snapshot={snapshot} />
          ) : book ? (
            <BookPage book={book} snapshot={snapshot} onDeleted={() => setView({ kind: "new" })} />
          ) : !engineReady ? (
            <RuntimeSetup runtime={snapshot.runtime} />
          ) : (
            <NewBook snapshot={snapshot} onImported={(id) => setView({ kind: "book", id })} />
          )}
        </div>
        <JobBar snapshot={snapshot} />
      </main>
    </div>
  );
}
