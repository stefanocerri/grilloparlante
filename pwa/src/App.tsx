import { useCallback, useEffect, useState } from "react";
import { BookDetail } from "./components/BookDetail";
import { Library } from "./components/Library";
import { FullPlayer, MiniPlayer } from "./components/Player";
import { Setup } from "./components/Setup";
import { Connection, consumeSetupLink, loadConnection, saveConnection } from "./lib/config";
import { cachedBooks, coverUrl, fetchBooks, RemoteBook } from "./lib/library";
import { PlayerProvider, usePlayer } from "./lib/player";

export function App() {
  const [connection, setConnection] = useState<Connection | null>(() => consumeSetupLink() ?? loadConnection());

  if (!connection) {
    return (
      <Setup
        onConnect={(value) => {
          saveConnection(value);
          setConnection(value);
        }}
      />
    );
  }

  return (
    <PlayerProvider connection={connection}>
      <Shell connection={connection} />
    </PlayerProvider>
  );
}

function currentRoute(): string | null {
  const match = /^#\/book\/(.+)$/.exec(window.location.hash);
  return match ? decodeURIComponent(match[1]) : null;
}

function Shell({ connection }: { connection: Connection }) {
  const player = usePlayer();
  const [books, setBooks] = useState<RemoteBook[]>(cachedBooks);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(currentRoute);
  const [expanded, setExpanded] = useState(false);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      setBooks(await fetchBooks(connection));
    } catch (failure) {
      setError(navigator.onLine ? `Impossibile leggere la libreria: ${(failure as Error).message}` : "Sei offline: mostro i libri salvati.");
    } finally {
      setRefreshing(false);
    }
  }, [connection]);

  useEffect(() => {
    void refresh();
    const onFocus = () => document.visibilityState === "visible" && void refresh();
    document.addEventListener("visibilitychange", onFocus);
    const onHash = () => setOpenId(currentRoute());
    window.addEventListener("hashchange", onHash);
    return () => {
      document.removeEventListener("visibilitychange", onFocus);
      window.removeEventListener("hashchange", onHash);
    };
  }, [refresh]);

  const open = (book: RemoteBook) => {
    window.location.hash = `/book/${encodeURIComponent(book.id)}`;
  };
  const book = books.find((item) => item.id === openId) ?? null;

  return (
    <>
      {book ? (
        <BookDetail connection={connection} book={book} onBack={() => history.length > 1 ? history.back() : (window.location.hash = "")} />
      ) : (
        <Library
          connection={connection}
          books={books}
          refreshing={refreshing}
          error={error}
          onRefresh={() => void refresh()}
          onOpen={open}
          onResume={(item) => {
            void coverUrl(connection, item).then((cover) => player.play(item, undefined, cover));
            setExpanded(true);
          }}
        />
      )}
      {!expanded && <MiniPlayer onExpand={() => setExpanded(true)} />}
      {expanded && <FullPlayer onClose={() => setExpanded(false)} />}
    </>
  );
}
