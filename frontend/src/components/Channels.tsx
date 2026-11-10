import { useEffect, useState, type ReactNode } from "react";
import type { AppQr, AppSnapshot, ChannelView, TursoOrgChoice } from "@shared/contracts";
import { ChevronRight, ExternalLink, Plus, RefreshCw, Trash2 } from "lucide-react";
import { cleanError, Spinner } from "./ui";

export const connectedChannels = (snapshot: AppSnapshot) => snapshot.channels.filter((channel) => channel.db);

/** Pallino di stato di un'app collegata. */
export function channelDot(channel: ChannelView) {
  if (!channel.db) return "bg-faint/50";
  if (channel.sync.state === "error") return "bg-danger";
  if (channel.sync.state === "uploading") return "bg-accent animate-pulse";
  return "bg-ok";
}

/** Blocco richiudibile. */
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
 * Collega una o più app: con il Platform API token di Turso Grillo crea per ognuna il suo database.
 * Il token resta in memoria finché Grillo è aperto: dopo la prima volta basta un clic.
 */
export function ConnectChannels({ ids, label, onDone }: { ids: string[]; label: string; onDone?: () => void }) {
  const [hasToken, setHasToken] = useState<boolean | null>(null);
  const [token, setToken] = useState("");
  const [orgs, setOrgs] = useState<TursoOrgChoice[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    void window.grillo.hasPlatformToken().then(setHasToken);
  }, []);

  const run = async (org?: string) => {
    setBusy(true);
    setResult(null);
    try {
      const outcome = await window.grillo.connectChannels(ids, token || undefined, org);
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
      setHasToken(await window.grillo.hasPlatformToken());
    } finally {
      setBusy(false);
    }
  };

  if (hasToken === null) return null;
  const needToken = !hasToken;

  return (
    <div className="space-y-3">
      {needToken && (
        <>
          <ol className="list-decimal space-y-1 pl-4 text-xs leading-relaxed text-mute marker:font-mono marker:text-faint">
            <li>
              Crea un account gratuito su{" "}
              <a className="inline-flex items-center gap-0.5 text-ink underline underline-offset-2" href="https://app.turso.tech" target="_blank" rel="noreferrer">
                turso.tech <ExternalLink size={10} />
              </a>
              .
            </li>
            <li>
              Nella dashboard apri le impostazioni, sezione <span className="text-ink">API Tokens</span>: crea un token e copialo.
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
            <span className="block text-2xs text-faint">Resta in memoria finché Grillo è aperto: non viene salvato.</span>
          </label>
        </>
      )}

      {orgs ? (
        <div className="space-y-1.5">
          <p className="label">Hai più organizzazioni: dove creo i database?</p>
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
        <button className="btn-primary w-full" disabled={busy || (needToken && !token.trim()) || !ids.length} onClick={() => void run()}>
          {busy && <Spinner size={13} />}
          {busy ? "Collego…" : label}
        </button>
      )}
      {busy && <p className="text-2xs text-mute">Creo i database e le chiavi: può volerci qualche secondo.</p>}
      {result && <p className={result.ok ? "note-info" : "note-error"}>{result.text}</p>}
    </div>
  );
}

/** Elenco delle app collegate (Impostazioni e guida): stato, indirizzo, QR, collegamento. */
export function ChannelList({ snapshot, compact = false }: { snapshot: AppSnapshot; compact?: boolean }) {
  const [qrs, setQrs] = useState<AppQr[]>([]);
  const [adding, setAdding] = useState(false);
  useEffect(() => {
    void window.grillo.channelQrs().then(setQrs);
  }, [snapshot.channels]);

  return (
    <div className="space-y-3">
      {snapshot.channels.map((channel) => (
        <ChannelCard key={channel.id} channel={channel} qr={qrs.find((qr) => qr.id === channel.id)} compact={compact} />
      ))}
      {!compact &&
        (adding ? (
          <AddChannel onClose={() => setAdding(false)} />
        ) : (
          <button className="btn-secondary w-full" onClick={() => setAdding(true)}>
            <Plus size={14} /> Aggiungi un'app
          </button>
        ))}
    </div>
  );
}

function ChannelCard({ channel, qr, compact }: { channel: ChannelView; qr?: AppQr; compact: boolean }) {
  const [url, setUrl] = useState(channel.appUrl);
  const [connecting, setConnecting] = useState(false);
  const [test, setTest] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => setUrl(channel.appUrl), [channel.appUrl]);
  const dirty = url.trim() !== channel.appUrl;
  const save = () => dirty && void window.grillo.updateChannel(channel.id, { appUrl: url });

  const remove = async () => {
    const ok = await window.grillo.confirm(
      `Togliere ${channel.name} da Grillo?`,
      "I libri restano sul Mac. Il suo database su Turso non viene cancellato: puoi eliminarlo dalla dashboard di Turso."
    );
    if (ok) await window.grillo.removeChannel(channel.id);
  };

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center gap-2 border-b border-line px-3 py-2">
        <span className={`dot ${channelDot(channel)}`} />
        <p className="flex-1 truncate text-sm font-medium">{channel.name}</p>
        <span className="truncate text-2xs text-mute">{channel.db ? channel.sync.message : "Da collegare"}</span>
        {!compact && (
          <button className="icon-btn -mr-1 hover:text-danger" title="Togli da Grillo" onClick={remove}>
            <Trash2 size={13} />
          </button>
        )}
      </div>
      <div className="space-y-3 p-3">
        <div className="flex gap-1.5">
          <input
            className="input font-mono text-xs"
            value={url}
            placeholder={`https://${channel.id}.vercel.app`}
            spellCheck={false}
            onChange={(event) => setUrl(event.target.value)}
            onBlur={save}
            onKeyDown={(event) => event.key === "Enter" && save()}
          />
          {qr && (
            <a className="icon-btn h-8 w-8 border border-line" href={channel.appUrl} target="_blank" rel="noreferrer" title="Apri l'app">
              <ExternalLink size={13} />
            </a>
          )}
        </div>

        {qr ? (
          <div className="flex items-center gap-3">
            <div className="shrink-0 rounded-md border border-line bg-white p-1.5">
              <img src={qr.image} className="h-28 w-28" alt={`QR per collegare ${channel.name}`} />
            </div>
            <p className="text-xs leading-relaxed text-mute">
              Inquadralo con il telefono: si apre {channel.name} già collegata. Poi installala: su iPhone Condividi →{" "}
              <span className="text-ink">Aggiungi alla schermata Home</span>, su Android menu ⋮ →{" "}
              <span className="text-ink">Installa app</span>.
            </p>
          </div>
        ) : channel.db ? (
          <p className="text-2xs text-faint">Inserisci l'indirizzo dell'app: il QR compare subito.</p>
        ) : compact ? (
          <p className="text-2xs text-faint">Collegala al passo 1: poi compare il QR.</p>
        ) : connecting ? (
          <ConnectChannels ids={[channel.id]} label={`Collega ${channel.name}`} onDone={() => setConnecting(false)} />
        ) : (
          <button className="btn-primary w-full" onClick={() => setConnecting(true)}>
            Collega {channel.name}
          </button>
        )}

        {channel.db && !channel.db.appCanWrite && (
          <p className="note-warn">
            Collegata alla vecchia maniera: l'app può ascoltare ma non mandarti file. Collegala di nuovo qui sotto per
            abilitarlo (il QR cambia).
          </p>
        )}

        {!compact && (
          <div className="space-y-2">
            {channel.db && (
              <div className="flex gap-1.5">
                <button
                  className="btn-secondary btn-sm"
                  onClick={async () => {
                    setTest(null);
                    try {
                      setTest({ ok: true, text: await window.grillo.testChannel(channel.id) });
                    } catch (error) {
                      setTest({ ok: false, text: cleanError(error) });
                    }
                  }}
                >
                  Prova la connessione
                </button>
                <button className="btn-ghost btn-sm" onClick={() => void window.grillo.syncChannels()} title="Ricarica tutto">
                  <RefreshCw size={12} /> Ricarica
                </button>
              </div>
            )}
            {test && <p className={test.ok ? "note-info" : "note-error"}>{test.text}</p>}
            <Disclosure title={channel.db ? "Collega di nuovo" : "Configurazione avanzata (ho già un database)"}>
              {channel.db ? (
                <ConnectChannels ids={[channel.id]} label={`Ricollega ${channel.name}`} />
              ) : (
                <ManualDb channelId={channel.id} />
              )}
            </Disclosure>
          </div>
        )}
      </div>
    </div>
  );
}

/** Database che esiste già: indirizzo e chiavi a mano. */
function ManualDb({ channelId }: { channelId: string }) {
  const [form, setForm] = useState({ url: "", token: "", appToken: "" });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const field = (key: keyof typeof form, label: string, placeholder: string, hint?: string, secret = false) => (
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
      {field("token", "Chiave completa (resta sul Mac)", "turso db tokens create <db>", undefined, true)}
      {field("appToken", "Chiave per l'app (facoltativa)", "uguale alla precedente se vuota", "Se è di sola lettura, l'app può ascoltare ma non mandarti file.", true)}
      <button
        className="btn-secondary w-full"
        disabled={busy || !form.url || !form.token}
        onClick={async () => {
          setBusy(true);
          setResult(null);
          try {
            setResult({ ok: true, text: await window.grillo.connectManual(channelId, form) });
          } catch (error) {
            setResult({ ok: false, text: cleanError(error) });
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy && <Spinner size={13} />} Salva e prova
      </button>
      {result && <p className={result.ok ? "note-info" : "note-error"}>{result.text}</p>}
    </div>
  );
}

function AddChannel({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  return (
    <div className="card space-y-3 p-3">
      <p className="text-sm font-medium">Nuova app</p>
      <label className="block space-y-1">
        <span className="label">Nome</span>
        <input className="input" value={name} placeholder="Es. podcast" onChange={(event) => setName(event.target.value)} />
      </label>
      <label className="block space-y-1">
        <span className="label">Indirizzo (si può aggiungere dopo)</span>
        <input className="input font-mono text-xs" value={url} placeholder="https://mia-app.vercel.app" onChange={(event) => setUrl(event.target.value)} />
      </label>
      <p className="text-2xs leading-relaxed text-faint">
        Per crearne una parti dal guscio <span className="font-mono">stefanocerri/skal</span>: legge solo i libri che mandi a lei.
      </p>
      <div className="flex gap-2">
        <button className="btn-secondary flex-1" onClick={onClose}>
          Annulla
        </button>
        <button
          className="btn-primary flex-1"
          disabled={!name.trim()}
          onClick={async () => {
            await window.grillo.addChannel(name, url);
            onClose();
          }}
        >
          Aggiungi
        </button>
      </div>
    </div>
  );
}

/** Scelta delle destinazioni di un libro: il Mac sempre, più le app collegate. */
export function TargetPicker({
  snapshot,
  value,
  onChange
}: {
  snapshot: AppSnapshot;
  value: string[];
  onChange: (targets: string[]) => void;
}) {
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((item) => item !== id) : [...value, id]);
  return (
    <div className="flex flex-wrap gap-1.5">
      <span className="badge-gray h-7 rounded-md px-2.5 text-xs" title={snapshot.libraryDir}>
        Mac · sempre
      </span>
      {snapshot.channels.map((channel) => {
        const on = value.includes(channel.id);
        const disabled = !channel.db;
        return (
          <button
            key={channel.id}
            disabled={disabled}
            onClick={() => toggle(channel.id)}
            title={disabled ? "Da collegare nelle Impostazioni" : undefined}
            className={`inline-flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors disabled:opacity-40 ${
              on ? "border-accent bg-accent/10 text-accent" : "border-line text-mute hover:border-ink/20 hover:text-ink"
            }`}
          >
            <span className={`dot h-1.5 w-1.5 ${on ? "bg-accent" : "bg-faint/50"}`} />
            {channel.name}
          </button>
        );
      })}
    </div>
  );
}
