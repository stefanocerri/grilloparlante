import { useState } from "react";
import { Connection } from "../lib/config";

export function Setup({ onConnect }: { onConnect: (connection: Connection) => void }) {
  const [db, setDb] = useState("");
  const [token, setToken] = useState("");

  return (
    <div className="safe-top mx-auto flex min-h-screen max-w-md flex-col px-6 pb-10">
      <img src="/icons/icon-192.png" className="mt-10 h-16 w-16 rounded-2xl" alt="" />
      <h1 className="mt-6 text-3xl font-semibold tracking-tight">Grillo parlante</h1>
      <p className="mt-2 text-mute">
        I tuoi audiolibri, capitolo per capitolo. Per collegare la libreria inquadra il QR nella sezione
        <b> Telefono e Turso</b> dell'app sul Mac.
      </p>

      {__TURSO_PROXY__ && (
        <button
          className="mt-8 w-full rounded-full bg-accent py-3 font-semibold text-white"
          onClick={() => onConnect({ db: "/turso", token: import.meta.env.VITE_DEMO_TOKEN ?? "scrivi" })}
        >
          Usa il database di prova
        </button>
      )}

      <details className="mt-8 rounded-2xl border border-line bg-panel p-4">
        <summary className="cursor-pointer text-sm font-medium">Oppure inserisci i dati a mano</summary>
        <label className="mt-4 block text-sm">
          Indirizzo del database
          <input
            className="mt-1 w-full rounded-xl border border-line bg-white px-3 py-2 font-mono text-sm"
            placeholder="libsql://grillo-tuonome.turso.io"
            value={db}
            onChange={(event) => setDb(event.target.value)}
            autoCapitalize="off"
            autoCorrect="off"
          />
        </label>
        <label className="mt-3 block text-sm">
          Token di sola lettura
          <input
            className="mt-1 w-full rounded-xl border border-line bg-white px-3 py-2 font-mono text-sm"
            type="password"
            value={token}
            onChange={(event) => setToken(event.target.value)}
          />
        </label>
        <button
          className="mt-4 w-full rounded-full bg-ink py-3 font-medium text-paper disabled:opacity-40"
          disabled={!db.trim() || !token.trim()}
          onClick={() => onConnect({ db: db.trim(), token: token.trim() })}
        >
          Collega
        </button>
      </details>
    </div>
  );
}
