import { useEffect, useState } from "react";
import type { AppSnapshot, TursoSettings } from "@shared/contracts";

export function PhoneSettings({ snapshot }: { snapshot: AppSnapshot }) {
  const [form, setForm] = useState<TursoSettings>(snapshot.turso);
  const [message, setMessage] = useState<string | null>(null);
  const [qr, setQr] = useState<{ link: string; image: string } | null>(null);
  const dirty = JSON.stringify(form) !== JSON.stringify(snapshot.turso);

  useEffect(() => {
    void window.grillo.tursoQr().then(setQr);
  }, [snapshot.turso]);

  const save = async () => {
    setMessage(null);
    await window.grillo.saveTurso(form);
    try {
      setMessage(await window.grillo.testTurso());
    } catch (error) {
      setMessage(`Connessione non riuscita: ${(error as Error).message}`);
    }
  };

  const field = (key: keyof TursoSettings, label: string, hint: string, secret = false) => (
    <label className="block">
      <span className="text-sm font-medium">{label}</span>
      <input
        className="field mt-1 font-mono"
        type={secret ? "password" : "text"}
        value={form[key]}
        onChange={(event) => setForm({ ...form, [key]: event.target.value })}
        spellCheck={false}
      />
      <span className="mt-1 block text-xs text-mute">{hint}</span>
    </label>
  );

  return (
    <div className="mx-auto max-w-3xl px-10 pb-16">
      <p className="eyebrow">Ascolto sul telefono</p>
      <h1 className="mt-2 text-4xl font-semibold tracking-tight">Telefono e Turso</h1>
      <p className="mt-3 text-sm leading-relaxed text-mute">
        Ogni capitolo pronto viene caricato sul tuo database Turso. L'app sul telefono legge da lì, quindi puoi
        ascoltare ovunque anche con il Mac spento.
      </p>

      <div className="mt-8 space-y-5 rounded-2xl border border-line bg-white p-6">
        {field("url", "Indirizzo del database", "Es. libsql://grillo-tuonome.turso.io")}
        {field("writeToken", "Token di scrittura (solo per questo Mac)", "turso db tokens create grillo", true)}
        {field(
          "readToken",
          "Token di sola lettura (per il telefono)",
          "turso db tokens create grillo --read-only",
          true
        )}
        {field("pwaUrl", "Indirizzo dell'app per il telefono", "Dove è pubblicata la PWA (es. su Vercel)")}
        <div className="flex items-center gap-3">
          <button className="btn-primary" onClick={save}>
            {dirty ? "Salva e prova la connessione" : "Prova la connessione"}
          </button>
          <button className="btn-ghost" onClick={() => void window.grillo.syncTurso()}>
            Ricarica tutto su Turso
          </button>
        </div>
        {message && <p className="text-sm">{message}</p>}
        <p className="text-xs text-mute">Stato: {snapshot.sync.message}</p>
      </div>

      <div className="mt-8 flex items-center gap-6 rounded-2xl border border-line bg-white p-6">
        {qr ? (
          <>
            <img src={qr.image} className="h-40 w-40 shrink-0" alt="QR per configurare il telefono" />
            <div>
              <p className="font-medium">Inquadra con il telefono</p>
              <p className="mt-1 text-sm text-mute">
                Apre l'app già collegata alla tua libreria. Poi su iPhone: Condividi → "Aggiungi alla schermata Home".
              </p>
              <p className="mt-2 break-all font-mono text-[11px] text-mute">{qr.link.replace(/token=[^&]+/, "token=…")}</p>
            </div>
          </>
        ) : (
          <p className="text-sm text-mute">Inserisci indirizzo e token di sola lettura per ottenere il QR del telefono.</p>
        )}
      </div>
    </div>
  );
}
