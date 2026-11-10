import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { AppSnapshot, SystemCheck } from "@shared/contracts";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Cpu,
  Download,
  HardDrive,
  Pause,
  Play,
  Terminal,
  WifiOff
} from "lucide-react";
import { ChannelList, ConnectChannels, connectedChannels } from "./Channels";
import { CopyCommand, Mark, Spinner, Step, StatusIcon, type CheckState } from "./ui";

/**
 * Configurazione guidata al primo avvio, pensata per chi non ha mai aperto il Terminale:
 * 1. benvenuto  2. controllo del Mac (e Python)  3. narratore  4. voce  5. app sul telefono (Turso + QR)  6. fatto.
 * Si può saltare in qualsiasi momento; si rifà dalle Impostazioni.
 */
const STEPS = ["Benvenuto", "Il tuo Mac", "Narratore", "Voce", "Telefono", "Pronto"] as const;

export function Onboarding({ snapshot, onPickFile }: { snapshot: AppSnapshot; onPickFile: (filePath: string) => void }) {
  const [step, setStep] = useState(0);
  const [system, setSystem] = useState<SystemCheck | null>(null);
  const [checking, setChecking] = useState(false);

  const recheck = useCallback(async () => {
    setChecking(true);
    try {
      const [result] = await Promise.all([window.grillo.checkSystem(), window.grillo.refreshRuntime()]);
      setSystem(result);
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    void recheck();
  }, [recheck]);

  const next = () => setStep((value) => Math.min(value + 1, STEPS.length - 1));
  const back = () => setStep((value) => Math.max(value - 1, 0));
  const finish = () => void window.grillo.finishOnboarding();

  const engineReady = snapshot.runtime.state === "ready";
  const diskOk = !system || system.freeDiskGb === null || system.freeDiskGb >= system.requiredDiskGb;
  const macReady = Boolean(system) && diskOk && (engineReady || system!.python.ok);

  let content: ReactNode;
  let footer: ReactNode;

  switch (step) {
    case 0:
      content = <Welcome />;
      footer = (
        <button className="btn-primary btn-lg w-full" onClick={next}>
          Iniziamo <ArrowRight size={15} />
        </button>
      );
      break;
    case 1:
      content = <MacCheck system={system} engineReady={engineReady} checking={checking} onRecheck={recheck} />;
      footer = (
        <Nav onBack={back} onNext={next} nextDisabled={!macReady} nextLabel={macReady ? "Continua" : "In attesa…"} />
      );
      break;
    case 2:
      content = <EngineInstall snapshot={snapshot} />;
      footer = <Nav onBack={back} onNext={next} nextDisabled={!engineReady} />;
      break;
    case 3:
      content = <VoicePick snapshot={snapshot} />;
      footer = <Nav onBack={back} onNext={next} />;
      break;
    case 4:
      content = <PhoneSetup snapshot={snapshot} />;
      footer = (
        <div className="space-y-1.5">
          <Nav onBack={back} onNext={next} nextDisabled={!connectedChannels(snapshot).length} />
          {!connectedChannels(snapshot).length && (
            <button className="btn-ghost btn-sm w-full" onClick={next}>
              Lo faccio più tardi
            </button>
          )}
        </div>
      );
      break;
    default:
      content = <Done snapshot={snapshot} />;
      footer = (
        <div className="flex flex-col gap-2">
          <button
            className="btn-primary btn-lg w-full"
            onClick={async () => {
              const file = await window.grillo.pickBook();
              finish();
              if (file) onPickFile(file);
            }}
          >
            Scegli il primo file
          </button>
          <button className="btn-ghost w-full" onClick={finish}>
            Vai alla libreria
          </button>
        </div>
      );
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-line px-3">
        <Mark />
        <p className="text-sm font-semibold">Grillo parlante</p>
        <span className="text-faint">/</span>
        <p className="flex-1 truncate text-sm text-mute">Configurazione</p>
        {step < STEPS.length - 1 && (
          <button className="btn-ghost btn-sm" onClick={finish} title="Potrai rifarla dalle Impostazioni">
            Salta
          </button>
        )}
      </header>

      <div className="flex shrink-0 items-center gap-1 px-3 pt-3">
        {STEPS.map((name, index) => (
          <span
            key={name}
            title={name}
            className={`h-1 flex-1 rounded-full transition-colors duration-300 ${
              index < step ? "bg-ink" : index === step ? "bg-accent" : "bg-ink/10"
            }`}
          />
        ))}
      </div>
      <p className="eyebrow shrink-0 px-3 pt-2">
        Passo {step + 1} di {STEPS.length} · {STEPS[step]}
      </p>

      <main key={step} className="min-h-0 flex-1 animate-fade-in overflow-y-auto px-3 pb-4 pt-3">
        {content}
      </main>

      <footer className="shrink-0 border-t border-line bg-subtle p-3">{footer}</footer>
    </div>
  );
}

function Nav({
  onBack,
  onNext,
  nextDisabled,
  nextLabel = "Continua",
  nextVariant = "primary"
}: {
  onBack: () => void;
  onNext: () => void;
  nextDisabled?: boolean;
  nextLabel?: string;
  nextVariant?: "primary" | "secondary";
}) {
  return (
    <div className="flex gap-2">
      <button className="btn-secondary" onClick={onBack} title="Indietro">
        <ArrowLeft size={14} />
      </button>
      <button
        className={`${nextVariant === "primary" ? "btn-primary" : "btn-secondary"} flex-1`}
        disabled={nextDisabled}
        onClick={onNext}
      >
        {nextLabel} {!nextDisabled && <ArrowRight size={14} />}
      </button>
    </div>
  );
}

function Title({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="mb-4 space-y-1.5">
      <h1 className="text-[20px] font-semibold leading-tight tracking-tight">{title}</h1>
      {children && <p className="text-sm leading-relaxed text-mute">{children}</p>}
    </div>
  );
}

// --- 1. Benvenuto ------------------------------------------------------------

function Welcome() {
  const points: [ReactNode, string, string][] = [
    [<HardDrive size={15} />, "Tutto sul tuo Mac", "La voce viene creata qui, senza abbonamenti e senza mandare i tuoi libri a nessuno."],
    [<Download size={15} />, "Circa 15 minuti, una volta sola", "Quasi tutto è il download del narratore (circa 5 GB)."],
    [<WifiOff size={15} />, "Poi anche senza internet", "La voce si crea sul Mac senza internet; serve solo per mandare gli audio al telefono."]
  ];
  return (
    <div className="flex flex-col">
      <div className="mb-5 mt-2">
        <Mark size={40} />
      </div>
      <Title title="Benvenuto in Grillo parlante">
        Trasforma PDF, EPUB e articoli in audiolibri con una voce italiana naturale, capitolo per capitolo.
        Ti accompagno passo passo: non serve sapere nulla di tecnico.
      </Title>
      <ul className="card divide-y divide-line">
        {points.map(([icon, title, text]) => (
          <li key={title} className="flex gap-3 p-3">
            <span className="mt-0.5 text-mute">{icon}</span>
            <div>
              <p className="text-sm font-medium">{title}</p>
              <p className="text-xs leading-relaxed text-mute">{text}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

// --- 2. Controllo del Mac ----------------------------------------------------

function CheckRow({ state, title, detail }: { state: CheckState; title: string; detail?: string }) {
  return (
    <li className="flex items-start gap-3 px-3 py-2.5">
      <span className="mt-0.5">
        <StatusIcon state={state} />
      </span>
      <div className="min-w-0">
        <p className="text-sm">{title}</p>
        {detail && <p className="text-xs leading-relaxed text-mute">{detail}</p>}
      </div>
    </li>
  );
}

function brewBin(system: SystemCheck) {
  if (system.homebrew.path) return system.homebrew.path;
  return system.arch === "arm64" ? "/opt/homebrew/bin/brew" : "/usr/local/bin/brew";
}

function MacCheck({
  system,
  engineReady,
  checking,
  onRecheck
}: {
  system: SystemCheck | null;
  engineReady: boolean;
  checking: boolean;
  onRecheck: () => void;
}) {
  if (!system) {
    return (
      <>
        <Title title="Controllo il tuo Mac" />
        <ul className="card divide-y divide-line">
          <CheckRow state="wait" title="Processore" />
          <CheckRow state="wait" title="Spazio libero" />
          <CheckRow state="wait" title="Python" />
        </ul>
      </>
    );
  }

  const apple = system.arch === "arm64";
  const disk = system.freeDiskGb;
  const diskOk = disk === null || disk >= system.requiredDiskGb;
  const pythonOk = engineReady || system.python.ok;

  return (
    <>
      <Title title="Controllo il tuo Mac">
        {pythonOk && diskOk ? "È tutto a posto, puoi continuare." : "Manca ancora qualcosa: ti spiego come sistemarlo."}
      </Title>

      <ul className="card divide-y divide-line">
        <CheckRow
          state={apple ? "ok" : "warn"}
          title={apple ? "Chip Apple" : "Processore Intel"}
          detail={
            apple
              ? `La voce userà la GPU del Mac${system.macosVersion ? ` · macOS ${system.macosVersion}` : ""}.`
              : "Funziona, ma la conversione sarà più lenta."
          }
        />
        <CheckRow
          state={diskOk ? "ok" : "fail"}
          title={disk === null ? "Spazio libero" : `${disk.toLocaleString("it-IT")} GB liberi`}
          detail={
            diskOk
              ? `Ne servono circa ${system.requiredDiskGb} per il narratore.`
              : `Ne servono almeno ${system.requiredDiskGb}. Svuota il Cestino o sposta qualche file, poi ricontrolla.`
          }
        />
        <CheckRow
          state={pythonOk ? "ok" : "fail"}
          title={engineReady ? "Narratore già installato" : system.python.ok ? `Python ${system.python.version}` : "Python non trovato"}
          detail={
            engineReady
              ? "Il prossimo passo è già fatto."
              : system.python.ok
                ? "Serve per installare il narratore."
                : "Serve Python 3.10 o più recente per installare il narratore. Si installa una volta sola."
          }
        />
      </ul>

      {!pythonOk && <PythonGuide system={system} />}

      {(!pythonOk || !diskOk) && (
        <button className="btn-secondary mt-3 w-full" disabled={checking} onClick={onRecheck}>
          {checking ? <Spinner size={13} /> : null} Ricontrolla
        </button>
      )}
    </>
  );
}

function PythonGuide({ system }: { system: SystemCheck }) {
  const brew = brewBin(system);
  let n = 0;
  return (
    <section className="mt-4">
      <p className="mb-3 text-sm font-semibold">Installiamo Python</p>
      <ol>
        <Step n={++n} title="Apri il Terminale">
          <button className="btn-secondary btn-sm" onClick={() => void window.grillo.openTerminal()}>
            <Terminal size={13} /> Apri il Terminale
          </button>
        </Step>
        {!system.homebrew.ok && (
          <Step n={++n} title={<>Installa <b className="font-medium">Homebrew</b>, l'installatore di programmi più usato su Mac</>}>
            <CopyCommand command={'/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"'} />
            <p className="text-xs leading-relaxed text-mute">
              Copia, incolla nel Terminale e premi Invio. Ti chiede la password del Mac: mentre la scrivi non compare
              nulla, è normale. Poi premi ancora Invio e aspetta qualche minuto.
            </p>
          </Step>
        )}
        <Step n={++n} title="Installa Python">
          <CopyCommand command={`${brew} install python@3.12`} />
        </Step>
        <Step n={++n} title="Torna qui e premi Ricontrolla" />
      </ol>
    </section>
  );
}

// --- 3. Narratore ----------------------------------------------------------

function EngineInstall({ snapshot }: { snapshot: AppSnapshot }) {
  const runtime = snapshot.runtime;
  const [showDetail, setShowDetail] = useState(false);
  const percent = Math.round((runtime.progress ?? 0) * 100);

  if (runtime.state === "ready") {
    return (
      <>
        <Title title="Il narratore è pronto">{runtime.message}</Title>
        <div className="card flex items-center gap-3 p-3">
          <StatusIcon state="ok" />
          <div>
            <p className="text-sm font-medium">OmniVoice installato</p>
            <p className="text-xs text-mute">Funziona anche senza internet.</p>
          </div>
        </div>
      </>
    );
  }

  const installing = runtime.state === "installing";
  const failed = runtime.state === "error";

  return (
    <>
      <Title title="Installiamo la voce">
        OmniVoice è il modello che legge ad alta voce. Lo scarico e lo preparo io: tu devi solo premere il pulsante.
      </Title>

      <div className="card p-3">
        <div className="flex items-center gap-2">
          <Cpu size={15} className="text-mute" />
          <p className="flex-1 text-sm font-medium">OmniVoice</p>
          {installing ? (
            <span className="badge-blue font-mono">{percent}%</span>
          ) : failed ? (
            <span className="badge-amber">Da riparare</span>
          ) : (
            <span className="badge-gray">~5 GB</span>
          )}
        </div>
        {installing && (
          <>
            <div className="progress mt-3">
              <div style={{ width: `${percent}%` }} />
            </div>
            <p className="mt-2 truncate font-mono text-2xs text-mute">{runtime.message}</p>
          </>
        )}
        {failed && (
          <div className="mt-3 space-y-2">
            <p className="text-xs text-danger">{runtime.message}</p>
            {runtime.detail && (
              <>
                <button className="text-2xs text-mute underline underline-offset-2" onClick={() => setShowDetail(!showDetail)}>
                  {showDetail ? "Nascondi i dettagli" : "Mostra i dettagli"}
                </button>
                {showDetail && (
                  <pre className="max-h-28 overflow-auto whitespace-pre-wrap rounded-md bg-subtle p-2 font-mono text-2xs text-mute">
                    {runtime.detail}
                  </pre>
                )}
              </>
            )}
          </div>
        )}
        {!installing && (
          <button
            className="btn-primary mt-3 w-full"
            disabled={!runtime.canInstall || runtime.state === "checking"}
            onClick={() => void window.grillo.installRuntime()}
          >
            <Download size={14} /> {failed ? "Riprova" : "Installa il narratore"}
          </button>
        )}
      </div>

      {installing && (
        <p className="note-info mt-3">
          Puoi chiudere questo pannello: l'installazione continua. Tieni il Mac acceso e collegato a internet.
        </p>
      )}
      {!runtime.canInstall && !installing && runtime.state !== "checking" && (
        <p className="note-warn mt-3">Manca Python: torna al passo precedente e segui le istruzioni.</p>
      )}
    </>
  );
}

// --- 4. Voce -----------------------------------------------------------------

function VoicePick({ snapshot }: { snapshot: AppSnapshot }) {
  const [voiceId, setVoiceId] = useState<string>(() => {
    try {
      return JSON.parse(localStorage.getItem("voiceId") ?? "null") ?? snapshot.voices[0]?.id ?? "";
    } catch {
      return snapshot.voices[0]?.id ?? "";
    }
  });
  const [playing, setPlaying] = useState<string | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);

  useEffect(() => () => audio.current?.pause(), []);
  useEffect(() => {
    if (voiceId) localStorage.setItem("voiceId", JSON.stringify(voiceId));
  }, [voiceId]);

  const preview = (id: string, url?: string) => {
    audio.current?.pause();
    if (!url || playing === id) {
      setPlaying(null);
      return;
    }
    audio.current = new Audio(url);
    audio.current.onended = () => setPlaying(null);
    void audio.current.play();
    setPlaying(id);
  };

  return (
    <>
      <Title title="Scegli la voce">Ascolta le anteprime e scegli quella che preferisci. Potrai cambiarla per ogni libro.</Title>
      <div className="card divide-y divide-line overflow-hidden">
        {snapshot.voices.map((voice) => {
          const selected = voice.id === voiceId;
          return (
            <div
              key={voice.id}
              onClick={() => {
                setVoiceId(voice.id);
                preview(voice.id, voice.previewUrl);
              }}
              className={`flex cursor-pointer items-center gap-3 px-3 py-2.5 ${selected ? "bg-accent/[0.06]" : "row-hover"}`}
            >
              <span
                className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                  selected ? "border-accent bg-accent text-white" : "border-ink/20"
                }`}
              >
                {selected && <Check size={10} strokeWidth={3} />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{voice.name}</p>
                <p className="truncate text-xs text-mute">{voice.description}</p>
              </div>
              <button
                className="icon-btn"
                disabled={!voice.previewUrl}
                onClick={(event) => {
                  event.stopPropagation();
                  preview(voice.id, voice.previewUrl);
                }}
                title="Ascolta un'anteprima"
              >
                {playing === voice.id ? <Pause size={13} /> : <Play size={13} />}
              </button>
            </div>
          );
        })}
      </div>
    </>
  );
}

// --- 5. Telefono --------------------------------------------------------------

/** L'ascolto avviene sul telefono: qui si collega Turso e si scaricano le app di ascolto con i QR. */
function PhoneSetup({ snapshot }: { snapshot: AppSnapshot }) {
  const missing = snapshot.channels.filter((channel) => !channel.db).map((channel) => channel.id);
  const names = snapshot.channels.map((channel) => channel.name).join(" e ");
  return (
    <>
      <Title title="Scarica l'app sul telefono">
        Gli audiolibri si ascoltano sul telefono, anche offline. Ogni app ha il suo database gratuito su Turso e riceve
        solo i libri che le mandi; dal telefono puoi anche mandare PDF a Grillo.
      </Title>
      {snapshot.channels.length === 0 ? (
        <div className="space-y-3">
          <p className="text-xs leading-relaxed text-mute">
            Aggiungi la tua app di ascolto (nome e indirizzo), poi collegala. Puoi anche farlo più tardi dalle Impostazioni.
          </p>
          <ChannelList snapshot={snapshot} />
        </div>
      ) : (
        <ol>
          <Step n={1} title={missing.length ? "Collega le app" : "App collegate"}>
            {missing.length > 0 && <ConnectChannels ids={missing} label={`Collega ${names}`} />}
          </Step>
          <Step n={2} title="Inquadra il QR e installa l'app">
            <ChannelList snapshot={snapshot} compact />
          </Step>
        </ol>
      )}
    </>
  );
}

// --- 6. Fatto ----------------------------------------------------------------

function Done({ snapshot }: { snapshot: AppSnapshot }) {
  const rows: [string, boolean][] = [
    ["Narratore", snapshot.runtime.state === "ready"],
    ["Voce scelta", true],
    ["App sul telefono", connectedChannels(snapshot).length > 0]
  ];
  return (
    <>
      <div className="mb-5 mt-2 inline-flex h-10 w-10 items-center justify-center rounded-full bg-ok text-white">
        <Check size={20} strokeWidth={2.5} />
      </div>
      <Title title="Tutto pronto">
        Trascina un PDF, un EPUB o un articolo sull'icona nella barra dei menu, oppure sceglilo qui sotto. Poi decidi tu
        quali capitoli convertire.
      </Title>
      <ul className="card divide-y divide-line">
        {rows.map(([label, ok]) => (
          <li key={label} className="flex items-center gap-3 px-3 py-2.5">
            <StatusIcon state={ok ? "ok" : "warn"} />
            <p className="flex-1 text-sm">{label}</p>
            <span className="text-xs text-mute">{ok ? "fatto" : label === "App sul telefono" ? "dalle Impostazioni" : "da fare"}</span>
          </li>
        ))}
      </ul>
    </>
  );
}
