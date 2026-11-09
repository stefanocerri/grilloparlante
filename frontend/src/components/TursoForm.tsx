import { useEffect, useState } from "react";
import type { AppSnapshot, TursoSettings } from "@shared/contracts";
import { cleanError, Spinner } from "./ui";

/** Indirizzo e chiavi di Turso, con "Salva e prova". Usato nelle Impostazioni e nella configurazione guidata. */
export function TursoForm({
  snapshot,
  onConnected,
  showPwaUrl = true
}: {
  snapshot: AppSnapshot;
  onConnected?: () => void;
  showPwaUrl?: boolean;
}) {
  const [form, setForm] = useState<TursoSettings>(snapshot.turso);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const dirty = JSON.stringify(form) !== JSON.stringify(snapshot.turso);

  useEffect(() => setForm(snapshot.turso), [snapshot.turso]);

  const saveAndTest = async () => {
    setBusy(true);
    setResult(null);
    try {
      if (dirty) await window.grillo.saveTurso(form);
      setResult({ ok: true, text: await window.grillo.testTurso() });
      onConnected?.();
    } catch (error) {
      setResult({ ok: false, text: cleanError(error) });
    } finally {
      setBusy(false);
    }
  };

  const field = (key: keyof TursoSettings, label: string, placeholder: string, hint?: string, secret = false) => (
    <label className="block space-y-1">
      <span className="label">{label}</span>
      <input
        className="input font-mono text-xs"
        type={secret ? "password" : "text"}
        value={form[key]}
        placeholder={placeholder}
        spellCheck={false}
        autoComplete="off"
        onChange={(event) => setForm({ ...form, [key]: event.target.value })}
      />
      {hint && <span className="block text-2xs text-faint">{hint}</span>}
    </label>
  );

  return (
    <div className="space-y-3">
      {field("url", "Indirizzo del database", "libsql://grillo-tuonome.turso.io")}
      {field("writeToken", "Chiave di scrittura", "eyJhbGciOi…", "Resta su questo Mac: serve per caricare.", true)}
      {field("readToken", "Chiave di sola lettura", "eyJhbGciOi…", "Va al telefono tramite il QR: può solo leggere.", true)}
      {showPwaUrl && field("pwaUrl", "Indirizzo dell'app per il telefono", "https://ilmatta.vercel.app")}
      <button className="btn-primary w-full" disabled={busy || !form.url || !form.writeToken} onClick={saveAndTest}>
        {busy && <Spinner size={13} />}
        {dirty ? "Salva e prova" : "Prova la connessione"}
      </button>
      {result && <p className={result.ok ? "note-info" : "note-error"}>{result.text}</p>}
    </div>
  );
}

/** QR che apre l'app del telefono già collegata al database. */
export function PhoneQr({ snapshot }: { snapshot: AppSnapshot }) {
  const [qr, setQr] = useState<{ link: string; image: string } | null>(null);
  useEffect(() => {
    void window.grillo.tursoQr().then(setQr);
  }, [snapshot.turso]);

  if (!qr) {
    return <p className="text-xs text-mute">Inserisci indirizzo e chiave di sola lettura per avere il QR del telefono.</p>;
  }
  return (
    <div className="flex items-center gap-3">
      <div className="shrink-0 rounded-md border border-line bg-white p-1.5">
        <img src={qr.image} className="h-28 w-28" alt="QR per collegare il telefono" />
      </div>
      <p className="text-xs leading-relaxed text-mute">
        Inquadralo con la fotocamera del telefono: si apre l'app di ascolto già collegata. Su iPhone poi tocca
        Condividi → <span className="text-ink">Aggiungi alla schermata Home</span>.
      </p>
    </div>
  );
}
