import { useEffect, useState, type ReactNode } from "react";
import type { BookInfoEdit, BookView, InfoSource, OnlineMatch } from "@shared/contracts";
import { BookOpen, Check, ExternalLink, Globe, ImagePlus, Pencil, RotateCcw, Search, X } from "lucide-react";
import { languageName, yearOf } from "../lib/format";
import { Spinner } from "./ui";

type Mode = "view" | "search" | "edit";

const SOURCE_LABEL: Record<InfoSource, string> = { file: "dal file", online: "online", manual: "a mano" };

/**
 * Informazioni sul libro: arrivano da sole (file + Google Books / Open Library) e si correggono a mano.
 * `wide` per la finestra Libreria, altrimenti compatta per il pannello.
 */
export function BookInfoPanel({ book, wide = false }: { book: BookView; wide?: boolean }) {
  const [mode, setMode] = useState<Mode>("view");
  useEffect(() => setMode("view"), [book.id]);

  if (mode === "search") return <InfoSearch book={book} onClose={() => setMode("view")} />;
  if (mode === "edit") return <InfoEdit book={book} onClose={() => setMode("view")} />;

  const info = book.info ?? {};
  const sources = book.infoSources ?? {};
  const lookup = book.lookup;
  const hasManual = Object.values(sources).includes("manual");
  const rows: [string, string, ReactNode][] = [];
  if (info.publisher) rows.push(["publisher", "Editore", info.publisher]);
  if (info.publishedDate) rows.push(["publishedDate", "Pubblicato", info.publishedDate]);
  if (info.language) rows.push(["language", "Lingua", languageName(info.language)]);
  if (info.pages) rows.push(["pages", "Pagine", String(info.pages)]);
  if (info.isbn) rows.push(["isbn", "ISBN", <span className="select-text font-mono text-xs">{info.isbn}</span>]);
  if (info.subjects?.length)
    rows.push([
      "subjects",
      "Argomenti",
      <span className="flex flex-wrap gap-1">
        {info.subjects.slice(0, 8).map((subject) => (
          <span key={subject} className="badge-gray">
            {subject}
          </span>
        ))}
      </span>
    ]);

  return (
    <section className={`card overflow-hidden ${wide ? "" : "text-xs"}`}>
      <div className="flex items-center gap-1 border-b border-line px-3 py-1.5">
        <p className="label flex-1">Informazioni</p>
        <button className="icon-btn" title="Cerca online" onClick={() => setMode("search")}>
          <Search size={13} />
        </button>
        <button className="icon-btn -mr-1.5" title="Modifica a mano" onClick={() => setMode("edit")}>
          <Pencil size={13} />
        </button>
      </div>

      <div className="space-y-2.5 p-3">
        {lookup?.state === "searching" && (
          <p className="flex items-center gap-1.5 text-xs text-mute">
            <Spinner size={12} /> Cerco editore, copertina e descrizione online…
          </p>
        )}

        {rows.length > 0 && (
          <dl className={`grid gap-x-3 gap-y-1.5 ${wide ? "grid-cols-[7rem_1fr]" : "grid-cols-[5.5rem_1fr]"}`}>
            {rows.map(([key, label, value]) => (
              <Row key={key} label={label} source={sources[key]}>
                {value}
              </Row>
            ))}
          </dl>
        )}

        {info.description && <Description text={info.description} source={sources.description} wide={wide} />}

        {!rows.length && !info.description && lookup?.state !== "searching" && (
          <p className="text-xs leading-relaxed text-mute">
            {lookup?.state === "error"
              ? `Ricerca online non riuscita: ${lookup.message}`
              : lookup?.state === "not-found" && lookup.message
                ? `${lookup.message}.`
                : "Ancora nessuna informazione."}{" "}
            Puoi cercarle online o scriverle a mano.
          </p>
        )}

        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-2xs text-faint">
          {sources.title === "online" || sources.author === "online" || rows.some(([key]) => sources[key] === "online") ? (
            <span className="flex items-center gap-1">
              <Globe size={11} /> {lookup?.message ?? "Trovate online"}
              {book.fileTitle && book.fileTitle !== book.title && sources.title === "online" && (
                <span title="Titolo nei metadati del file"> · nel file: «{book.fileTitle}»</span>
              )}
            </span>
          ) : lookup?.state === "not-found" && rows.length ? (
            <span>{lookup.message}</span>
          ) : null}
          <span className="flex-1" />
          {hasManual && (
            <button
              className="flex items-center gap-1 hover:text-ink"
              title="Togli le correzioni a mano e torna alle informazioni automatiche"
              onClick={() => void window.grillo.resetBookInfo(book.id)}
            >
              <RotateCcw size={11} /> Ripristina automatiche
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

function Row({ label, source, children }: { label: string; source?: InfoSource; children: ReactNode }) {
  return (
    <>
      <dt className="pt-px text-xs text-mute">{label}</dt>
      <dd className="flex min-w-0 items-start gap-2 text-xs">
        <span className="min-w-0 flex-1 break-words">{children}</span>
        {source && source !== "file" && <span className="shrink-0 font-mono text-2xs text-faint">{SOURCE_LABEL[source]}</span>}
      </dd>
    </>
  );
}

function Description({ text, source, wide }: { text: string; source?: InfoSource; wide: boolean }) {
  const [open, setOpen] = useState(false);
  const long = text.length > (wide ? 600 : 260);
  return (
    <div>
      <p className={`select-text whitespace-pre-line text-xs leading-relaxed text-ink/85 ${!open && long ? (wide ? "line-clamp-[8]" : "line-clamp-4") : ""}`}>
        {text}
      </p>
      <p className="mt-1 flex gap-2 text-2xs text-faint">
        {long && (
          <button className="hover:text-ink" onClick={() => setOpen(!open)}>
            {open ? "Mostra meno" : "Mostra tutto"}
          </button>
        )}
        {source && source !== "file" && <span className="font-mono">descrizione {SOURCE_LABEL[source]}</span>}
      </p>
    </div>
  );
}

/** Cerca il libro online e sceglie quello giusto (copertina, editore, descrizione arrivano da lì). */
function InfoSearch({ book, onClose }: { book: BookView; onClose: () => void }) {
  const [text, setText] = useState(() => [book.title, book.author].filter(Boolean).join(" "));
  const [results, setResults] = useState<OnlineMatch[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [applying, setApplying] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const usingOnline = book.infoSources?.title === "online" || Object.values(book.infoSources ?? {}).includes("online");

  const run = async (query?: { text?: string; isbn?: string }) => {
    setBusy(true);
    setError(null);
    try {
      setResults(await window.grillo.searchBookInfo(book.id, query));
    } catch (failure) {
      setError(cleanError(failure));
      setResults([]);
    } finally {
      setBusy(false);
    }
  };

  // Prima ricerca da sola, con ISBN, titolo e autore del libro.
  useEffect(() => {
    void run();
  }, [book.id]);

  const submit = () => {
    const value = text.trim();
    const isbn = value.replace(/[\s-]/g, "");
    void run(/^(97[89])?\d{9}[\dXx]$/.test(isbn) ? { isbn } : { text: value });
  };

  const apply = async (match: OnlineMatch) => {
    setApplying(match.id);
    try {
      await window.grillo.applyBookInfo(book.id, match);
      onClose();
    } catch (failure) {
      setError(cleanError(failure));
    } finally {
      setApplying(null);
    }
  };

  return (
    <section className="card overflow-hidden">
      <div className="flex items-center gap-1 border-b border-line px-3 py-1.5">
        <p className="label flex-1">Cerca online</p>
        <button className="icon-btn -mr-1.5" title="Chiudi" onClick={onClose}>
          <X size={13} />
        </button>
      </div>
      <div className="space-y-2 p-3">
        <form
          className="flex gap-1.5"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <input className="input h-7 text-xs" value={text} placeholder="Titolo, autore o ISBN" onChange={(event) => setText(event.target.value)} />
          <button className="btn-secondary btn-sm" disabled={busy || !text.trim()}>
            {busy ? <Spinner size={12} /> : <Search size={12} />}
          </button>
        </form>

        {error && <p className="note-error">{error}</p>}
        {results && !results.length && !error && !busy && (
          <p className="text-xs text-mute">Nessun risultato. Prova con meno parole, solo il cognome dell'autore o l'ISBN.</p>
        )}

        <ul className="max-h-80 space-y-1 overflow-y-auto">
          {results?.map((match) => (
            <li key={`${match.provider}:${match.id}`} className="flex gap-2.5 rounded-md p-1.5 row-hover">
              {match.coverUrl ? (
                <img src={match.coverUrl} className="h-14 w-10 shrink-0 rounded object-cover ring-1 ring-line" alt="" loading="lazy" />
              ) : (
                <span className="flex h-14 w-10 shrink-0 items-center justify-center rounded border border-line bg-subtle">
                  <BookOpen size={13} className="text-faint" />
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="line-clamp-2 text-xs font-medium">
                  {match.title}
                  {match.subtitle && <span className="font-normal text-mute"> — {match.subtitle}</span>}
                </p>
                {match.author && <p className="truncate text-2xs text-mute">{match.author}</p>}
                <p className="truncate font-mono text-2xs text-faint">
                  {[match.publisher, yearOf(match.publishedDate), match.provider === "google" ? "Google Books" : "Open Library"]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end justify-between">
                <button className="btn-secondary btn-sm" disabled={Boolean(applying)} onClick={() => void apply(match)}>
                  {applying === match.id ? <Spinner size={12} /> : <Check size={12} />} Usa
                </button>
                {match.link && (
                  <a className="text-faint hover:text-ink" href={match.link} target="_blank" rel="noreferrer" title="Apri la scheda online">
                    <ExternalLink size={11} />
                  </a>
                )}
              </div>
            </li>
          ))}
        </ul>

        {usingOnline && (
          <button
            className="text-2xs text-faint hover:text-danger"
            onClick={() => {
              void window.grillo.clearOnlineInfo(book.id);
              onClose();
            }}
          >
            Il libro trovato prima era sbagliato: toglilo
          </button>
        )}
      </div>
    </section>
  );
}

/** Correzioni a mano: vincono su quelle trovate da sole. Un campo svuotato resta vuoto. */
function InfoEdit({ book, onClose }: { book: BookView; onClose: () => void }) {
  const info = book.info ?? {};
  const [form, setForm] = useState({
    title: book.title,
    author: book.author ?? "",
    publisher: info.publisher ?? "",
    publishedDate: info.publishedDate ?? "",
    language: info.language ?? "",
    isbn: info.isbn ?? "",
    subjects: (info.subjects ?? []).join(", "),
    description: info.description ?? ""
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (key: keyof typeof form) => (event: { target: { value: string } }) => setForm({ ...form, [key]: event.target.value });

  const save = async () => {
    if (!form.title.trim()) {
      setError("Il titolo non può essere vuoto.");
      return;
    }
    setSaving(true);
    const edit: BookInfoEdit = {
      ...form,
      subjects: form.subjects
        .split(/[,;]/)
        .map((subject) => subject.trim())
        .filter(Boolean)
    };
    try {
      await window.grillo.saveBookInfo(book.id, edit);
      onClose();
    } catch (failure) {
      setError(cleanError(failure));
      setSaving(false);
    }
  };

  return (
    <section className="card overflow-hidden">
      <div className="flex items-center gap-1 border-b border-line px-3 py-1.5">
        <p className="label flex-1">Modifica informazioni</p>
        <button className="icon-btn -mr-1.5" title="Annulla" onClick={onClose}>
          <X size={13} />
        </button>
      </div>
      <form
        className="space-y-2 p-3"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <Field label="Titolo">
          <input className="input h-7 text-xs" value={form.title} onChange={set("title")} />
        </Field>
        <Field label="Autore">
          <input className="input h-7 text-xs" value={form.author} onChange={set("author")} placeholder="Nome Cognome, Altro Autore" />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Editore">
            <input className="input h-7 text-xs" value={form.publisher} onChange={set("publisher")} />
          </Field>
          <Field label="Anno o data">
            <input className="input h-7 font-mono text-xs" value={form.publishedDate} onChange={set("publishedDate")} placeholder="2010" />
          </Field>
          <Field label="Lingua">
            <input className="input h-7 font-mono text-xs" value={form.language} onChange={set("language")} placeholder="it" />
          </Field>
          <Field label="ISBN">
            <input className="input h-7 font-mono text-xs" value={form.isbn} onChange={set("isbn")} />
          </Field>
        </div>
        <Field label="Argomenti (separati da virgola)">
          <input className="input h-7 text-xs" value={form.subjects} onChange={set("subjects")} placeholder="Romanzo, Storia" />
        </Field>
        <Field label="Descrizione">
          <textarea
            className="input h-28 resize-y py-1.5 text-xs leading-relaxed"
            value={form.description}
            onChange={set("description")}
          />
        </Field>

        {error && <p className="note-error">{error}</p>}

        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          <button type="button" className="btn-ghost btn-sm" onClick={() => void window.grillo.pickBookCover(book.id)}>
            <ImagePlus size={12} /> Copertina…
          </button>
          <span className="flex-1" />
          <button type="button" className="btn-secondary btn-sm" onClick={onClose}>
            Annulla
          </button>
          <button className="btn-primary btn-sm" disabled={saving}>
            {saving ? <Spinner size={12} /> : <Check size={12} />} Salva
          </button>
        </div>
        <p className="text-2xs leading-relaxed text-faint">
          Quello che scrivi qui vince su ciò che Grillo trova da solo. Il libro resta nella stessa cartella; anche le app
          collegate ricevono le informazioni nuove.
        </p>
      </form>
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="label">{label}</span>
      {children}
    </label>
  );
}

function cleanError(error: unknown) {
  return String((error as Error)?.message ?? error).replace(/^Error invoking remote method '[^']+': (Error: )?/, "");
}

/** Riga breve sotto l'autore: editore · anno. */
export function infoLine(book: BookView) {
  return [book.info?.publisher, yearOf(book.info?.publishedDate)].filter(Boolean).join(" · ");
}
