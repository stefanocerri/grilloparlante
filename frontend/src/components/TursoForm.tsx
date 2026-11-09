import { useEffect, useState, type ReactNode } from "react";
import type { AppQr, AppSnapshot, ListeningApp, TursoOrgChoice, TursoSettings } from "@shared/contracts";
import { ChevronRight, ExternalLink } from "lucide-react";
import { cleanError, Spinner, StatusIcon } from "./ui";

export function tursoConfigured(snapshot: AppSnapshot) {
  return Boolean(snapshot.turso.url && snapshot.turso.writeToken);
}

/**
 * Strada guidata: un solo "Platform API token" e Grillo crea database e chiavi.
 * Il token resta in questo componente solo finché serve (anche per scegliere l'organizzazione), poi si svuota.
 */
export function TursoSetup({ onDone }: { onDone?: () => void }) {
  const [token, setToken] = useState("");
  const [orgs, setOrgs] = useState<TursoOrgChoice[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  const run = async (org?: string) => {
    setBusy(true);
    setResult(null);
    try {
      const outcome = await window.grillo.setupTurso(token, org);
      if (outcome.status === "choose-org") {
        setOrgs(outcome.orgs);
        return;
      }
      setOrgs(null);
      setToken("");
      setResult({ ok: true, text: outcome.message });
      onDone?.();
    } catch (error) {
      setResult({ ok: false, text: cleanError(error) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <ol className="list-decimal space-y-1 pl-4 text-xs leading-relaxed text-mute marker:font-mono marker:text-faint">
        <li>
          Crea un account gratuito su{" "}
          <a className="inline-flex items-center gap-0.5 text-ink underline underline-offset-2" href="https://app.turso.tech" target="_blank" rel="noreferrer">
            turso.tech <ExternalLink size={10} />
          </a>
          .
        </li>
        <li>
          Nella dashboard apri le impostazioni, sezione <span className="text-ink">API Tokens</span>: crea un token e
          copialo.
        </li>
      </ol>

      <label className="block space-y-1">
        <span className="label">Platform API token</span>
        <input
          className="input font-mono text-xs"
          type="password"
          value={token}
          placeholder="Incolla qui il token"
          spellCheck={false}
          autoComplete="off"
          onChange={(event) => {
            setToken(event.target.value);
            setOrgs(null);
          }}
        />
        <span className="block text-2xs text-faint">Serve solo adesso: Grillo non lo salva.</span>
      </label>

      {orgs ? (
        <div className="space-y-1.5">
          <p className="label">Hai più organizzazioni: dove creo il database?</p>
          <div className="card divide-y divide-line overflow-hidden">
            {orgs.map((org) => (
              <button
                key={org.slug}
                className="row-hover flex w-full items-center gap-2 px-3 py-2 text-left disabled:opacity-50"
                disabled={busy}
                onClick={() => void run(org.slug)}
              >
                <span className="flex-1 text-sm">{org.name === "personal" ? "Personale" : org.name}</span>
                <span className="font-mono text-2xs text-faint">{org.slug}</span>
                <ChevronRight size={13} className="text-faint" />
              </button>
            ))}
          </div>
        </div>
      ) : (
        <button className="btn-primary w-full" disabled={busy || !token.trim()} onClick={() => void run()}>
          {busy && <Spinner size={13} />}
          {busy ? "Configuro…" : "Configura"}
        </button>
      )}
      {busy && <p className="text-2xs text-mute">Creo il database e le chiavi: può volerci qualche secondo.</p>}
      {result && <p className={result.ok ? "note-info" : "note-error"}>{result.text}</p>}
    </div>
  );
}

/** Strada avanzata: indirizzo e chiavi di un database che esiste già. */
export function TursoForm({ snapshot }: { snapshot: AppSnapshot }) {
  const [form, setForm] = useState<TursoSettings>(snapshot.turso);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const dirty =
    form.url !== snapshot.turso.url || form.writeToken !== snapshot.turso.writeToken || form.readToken !== snapshot.turso.readToken;

  useEffect(() => setForm(snapshot.turso), [snapshot.turso]);

  const saveAndTest = async () => {
    setBusy(true);
    setResult(null);
    try {
      if (dirty) await window.grillo.saveTurso({ ...snapshot.turso, url: form.url, writeToken: form.writeToken, readToken: form.readToken });
      setResult({ ok: true, text: await window.grillo.testTurso() });
    } catch (error) {
      setResult({ ok: false, text: cleanError(error) });
    } finally {
      setBusy(false);
    }
  };

  const field = (key: "url" | "writeToken" | "readToken", label: string, placeholder: string, hint?: string, secret = false) => (
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
      {field("readToken", "Chiave di sola lettura", "eyJhbGciOi…", "Va alle app del telefono tramite il QR: può solo leggere.", true)}
      <button className="btn-secondary w-full" disabled={busy || !form.url || !form.writeToken} onClick={saveAndTest}>
        {busy && <Spinner size={13} />}
        {dirty ? "Salva e prova" : "Prova la connessione"}
      </button>
      {result && <p className={result.ok ? "note-info" : "note-error"}>{result.text}</p>}
    </div>
  );
}

/** Blocco richiudibile, per la configurazione avanzata. */
export function Disclosure({ title, children, defaultOpen = false }: { title: string; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <button className="flex items-center gap-1 text-xs font-medium text-mute hover:text-ink" onClick={() => setOpen(!open)}>
        <ChevronRight size={13} className={`transition-transform ${open ? "rotate-90" : ""}`} />
        {title}
      </button>
      {open && <div className="mt-3">{children}</div>}
    </div>
  );
}

/**
 * Un QR per ogni app di ascolto (ilmatta, fomo...). Ognuno apre la sua app già collegata al database:
 * nel link c'è solo la chiave di sola lettura.
 */
export function AppQrs({ snapshot }: { snapshot: AppSnapshot }) {
  const [qrs, setQrs] = useState<AppQr[]>([]);
  useEffect(() => {
    void window.grillo.tursoQr().then(setQrs);
  }, [snapshot.turso]);
  const connected = tursoConfigured(snapshot) && Boolean(snapshot.turso.readToken);

  return (
    <div className="space-y-3">
      {snapshot.turso.apps.map((app) => (
        <AppRow key={app.id} app={app} snapshot={snapshot} qr={qrs.find((item) => item.id === app.id)} connected={connected} />
      ))}
    </div>
  );
}

function AppRow({ app, snapshot, qr, connected }: { app: ListeningApp; snapshot: AppSnapshot; qr?: AppQr; connected: boolean }) {
  const [url, setUrl] = useState(app.url);
  useEffect(() => setUrl(app.url), [app.url]);
  const dirty = url.trim() !== app.url;

  const save = () => {
    if (!dirty) return;
    const apps = snapshot.turso.apps.map((item) => (item.id === app.id ? { ...item, url: url.trim() } : item));
    void window.grillo.saveTurso({ ...snapshot.turso, apps });
  };

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center gap-2 border-b border-line px-3 py-2">
        <StatusIcon state={qr ? "ok" : "warn"} />
        <p className="flex-1 text-sm font-medium">Collega {app.name}</p>
        {qr && (
          <a className="icon-btn -mr-1" href={qr.link.split("#")[0]} target="_blank" rel="noreferrer" title="Apri l'app nel browser">
            <ExternalLink size={13} />
          </a>
        )}
      </div>
      <div className="space-y-3 p-3">
        <div className="flex gap-1.5">
          <input
            className="input font-mono text-xs"
            value={url}
            placeholder={`https://${app.id}.vercel.app`}
            spellCheck={false}
            onChange={(event) => setUrl(event.target.value)}
            onBlur={save}
            onKeyDown={(event) => event.key === "Enter" && save()}
          />
          {dirty && (
            <button className="btn-secondary" onClick={save}>
              Salva
            </button>
          )}
        </div>
        {qr ? (
          <div className="flex items-center gap-3">
            <div className="shrink-0 rounded-md border border-line bg-white p-1.5">
              <img src={qr.image} className="h-28 w-28" alt={`QR per collegare ${app.name}`} />
            </div>
            <p className="text-xs leading-relaxed text-mute">
              Inquadralo con la fotocamera del telefono: si apre {app.name} già collegata. Poi installala: su iPhone
              Condividi → <span className="text-ink">Aggiungi alla schermata Home</span>, su Android menu ⋮ →{" "}
              <span className="text-ink">Installa app</span>.
            </p>
          </div>
        ) : (
          <p className="text-2xs text-faint">
            {!connected
              ? "Il QR compare quando Turso è configurato."
              : "Inserisci l'indirizzo dove hai pubblicato l'app: il QR compare subito."}
          </p>
        )}
      </div>
    </div>
  );
}
