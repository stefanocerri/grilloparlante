import { useEffect, useState } from "react";
import type { AppSnapshot, TursoSettings } from "@shared/contracts";
import { FolderOpen, Power, RefreshCw } from "lucide-react";

export function Settings({ snapshot }: { snapshot: AppSnapshot }) {
  const [form, setForm] = useState<TursoSettings>(snapshot.turso);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [qr, setQr] = useState<{ link: string; image: string } | null>(null);

  useEffect(() => {
    void window.grillo.tursoQr().then(setQr);
  }, [snapshot.turso]);
  const dirty = JSON.stringify(form) !== JSON.stringify(snapshot.turso);

  useEffect(() => setForm(snapshot.turso), [snapshot.turso]);

  const saveAndTest = async () => {
    setBusy(true);
    setMessage(null);
    try {
      if (dirty) await window.grillo.saveTurso(form);
      setMessage(await window.grillo.testTurso());
    } catch (error) {
      setMessage((error as Error).message.replace(/^Error invoking remote method '[^']+': (Error: )?/, ""));
    } finally {
      setBusy(false);
    }
  };

  const field = (key: keyof TursoSettings, label: string, placeholder: string, secret = false) => (
    <label className="block">
      <span className="text-[11px] text-mute">{label}</span>
      <input
        className="field mt-0.5"
        type={secret ? "password" : "text"}
        value={form[key]}
        placeholder={placeholder}
        spellCheck={false}
        onChange={(event) => setForm({ ...form, [key]: event.target.value })}
      />
    </label>
  );

  const syncColor =
    snapshot.sync.state === "error"
      ? "bg-warn"
      : snapshot.sync.state === "uploading"
        ? "bg-accent animate-pulse"
        : snapshot.sync.state === "idle"
          ? "bg-ok"
          : "bg-black/20";

  return (
    <div className="flex flex-col gap-4 p-3">
      <section className="card flex flex-col gap-2.5 p-3">
        <div>
          <p className="text-sm font-semibold">Turso</p>
          <p className="text-[11px] leading-relaxed text-mute">
            Ogni capitolo pronto viene caricato sul tuo database Turso; le app di ascolto lo leggono da lì. Le
            notizie scadute vengono tolte da Turso (sul Mac restano).
          </p>
        </div>
        {field("url", "Indirizzo del database", "libsql://grillo-tuonome.turso.io")}
        {field("writeToken", "Token di scrittura (resta su questo Mac)", "turso db tokens create grillo", true)}
        {field("readToken", "Token di sola lettura (per le PWA)", "turso db tokens create grillo --read-only", true)}
        {field("pwaUrl", "Indirizzo della PWA per il telefono", "https://grilloparlante.vercel.app")}
        <div className="flex gap-1.5">
          <button className="btn-primary flex-1" disabled={busy || !form.url || !form.writeToken} onClick={saveAndTest}>
            {dirty ? "Salva e prova" : "Prova la connessione"}
          </button>
          <button
            className="icon-btn border border-line"
            title="Ricarica tutto su Turso"
            disabled={snapshot.sync.state === "off"}
            onClick={() => void window.grillo.syncTurso()}
          >
            <RefreshCw size={14} />
          </button>
        </div>
        {message && <p className="text-[11px] text-mute">{message}</p>}
        <p className="flex items-center gap-1.5 text-[11px] text-mute">
          <span className={`h-2 w-2 shrink-0 rounded-full ${syncColor}`} />
          {snapshot.sync.message}
        </p>
      </section>

      <section className="card flex flex-col items-center gap-2 p-3 text-center">
        <p className="self-start text-sm font-semibold">Telefono</p>
        {qr ? (
          <>
            <img src={qr.image} className="h-36 w-36" alt="QR per collegare il telefono" />
            <p className="text-[11px] leading-relaxed text-mute">
              Inquadralo con il telefono: apre la PWA già collegata. Su iPhone poi Condividi → "Aggiungi alla schermata
              Home".
            </p>
          </>
        ) : (
          <p className="self-start text-[11px] text-mute">
            Inserisci indirizzo e token di sola lettura per avere il QR che collega il telefono.
          </p>
        )}
      </section>

      <section className="card flex flex-col gap-1 p-3">
        <p className="text-sm font-semibold">Libreria</p>
        <button className="flex items-center gap-2 text-left text-[11px] text-mute hover:text-ink" onClick={() => void window.grillo.revealLibrary()}>
          <FolderOpen size={13} className="shrink-0" />
          <span className="truncate">{snapshot.libraryDir}</span>
        </button>
      </section>

      <section className="card flex flex-col gap-1 p-3">
        <p className="text-sm font-semibold">Motore voce</p>
        <p className="text-[11px] text-mute">
          {snapshot.runtime.message}
          {snapshot.runtime.device ? ` · ${snapshot.runtime.device}` : ""}
        </p>
      </section>

      <button className="btn-ghost" onClick={() => void window.grillo.quit()}>
        <Power size={14} /> Esci da Grillo parlante
      </button>
    </div>
  );
}
