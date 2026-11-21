import type { ImportRequest, JobProgress, QueueItem, QueueState } from "../shared/contracts";
import { libraryDir } from "./paths";
import { PythonRun, runBackend } from "./python";

interface QueueHooks {
  python: () => string | null;
  onChange: () => void;
  onBookChanged: (bookId: string) => void;
  log: (line: string) => void;
}

/** Coda delle conversioni: un processo Python alla volta, capitoli raggruppati per libro. */
export class ConversionQueue {
  running: QueueItem | null = null;

  pending: QueueItem[] = [];

  progress: JobProgress | null = null;

  importing: string | null = null;

  lastError: string | null = null;

  private current: PythonRun | null = null;

  constructor(private readonly hooks: QueueHooks) {}

  state(): QueueState {
    return {
      running: this.running,
      pending: this.pending,
      progress: this.progress,
      importing: this.importing,
      lastError: this.lastError
    };
  }

  /** Capitoli in coda per la conversione in audio (`mode` "translate": quelli in coda solo per la traduzione). */
  queuedChapters(bookId: string, mode: "convert" | "translate" = "convert"): number[] {
    const items = [...(this.running ? [this.running] : []), ...this.pending];
    return [
      ...new Set(
        items.filter((item) => item.bookId === bookId && (item.mode ?? "convert") === mode).flatMap((item) => item.chapters)
      )
    ];
  }

  runningChapters(bookId: string): number[] {
    return this.running?.bookId === bookId && this.running.mode !== "translate" ? this.running.chapters : [];
  }

  /** Il libro ha qualcosa in coda o in corso (conversione o traduzione). */
  busy(bookId: string): boolean {
    return [...(this.running ? [this.running] : []), ...this.pending].some((item) => item.bookId === bookId);
  }

  /** Lingua di un file prima di importarlo ("it", "en"...), null se non si riesce a leggerlo. */
  async detectLanguage(filePath: string): Promise<string | null> {
    const python = this.hooks.python();
    if (!python) return null;
    let language: string | null = null;
    const run = runBackend(
      python,
      ["language", "--input", filePath],
      (event) => {
        if (event.type === "result") language = String(event.payload.language);
      },
      this.hooks.log
    );
    await run.done;
    return language;
  }

  /** Accende o spegne la traduzione di un libro (veloce: non passa dalla coda). */
  async setTranslation(bookId: string, enabled: boolean): Promise<void> {
    const python = this.requirePython();
    let error = "";
    const run = runBackend(
      python,
      ["translation", "--book", bookId, enabled ? "--on" : "--off", "--library", libraryDir()],
      (event) => {
        if (event.type === "error") error = String(event.payload.message);
      },
      this.hooks.log
    );
    const code = await run.done;
    this.hooks.onBookChanged(bookId);
    this.hooks.onChange();
    if (code !== 0 || error) throw new Error(error || "Non sono riuscito a cambiare la lingua del libro.");
  }

  /** Passo 1: estrae testo e capitoli. Veloce, non passa dalla coda. */
  async importBook(request: ImportRequest): Promise<string> {
    const python = this.requirePython();
    this.importing = request.filePath.split("/").pop() ?? request.filePath;
    this.lastError = null;
    this.hooks.onChange();

    let bookId = "";
    let error = "";
    const run = runBackend(
      python,
      [
        "import", "--input", request.filePath, "--voice", request.voiceId, "--speed", String(request.speed),
        "--library", libraryDir(), ...(request.translate ? ["--translate"] : [])
      ],
      (event) => {
        if (event.type === "result") bookId = String(event.payload.bookId);
        if (event.type === "error") error = String(event.payload.message);
      },
      this.hooks.log
    );
    await run.done;
    this.importing = null;
    if (!bookId) {
      this.lastError = error || "Importazione non riuscita.";
      this.hooks.onChange();
      throw new Error(this.lastError);
    }
    this.hooks.onBookChanged(bookId);
    this.hooks.onChange();
    return bookId;
  }

  /** Passo 2: mette in coda i capitoli da convertire (o, con mode "translate", solo da tradurre). */
  enqueue(bookId: string, chapters: number[], mode: "convert" | "translate" = "convert") {
    // Un capitolo già in coda per la conversione verrà comunque tradotto prima: non serve metterlo anche lì.
    const already = new Set([...this.queuedChapters(bookId), ...(mode === "translate" ? this.queuedChapters(bookId, "translate") : [])]);
    const fresh = chapters.filter((index) => !already.has(index));
    if (!fresh.length) return;
    this.lastError = null;
    this.pending.push({ bookId, chapters: fresh.sort((a, b) => a - b), ...(mode === "translate" ? { mode } : {}) });
    this.hooks.onChange();
    void this.next();
  }

  /** Ferma la conversione in corso e svuota la coda (i pezzi gia fatti restano). */
  cancelAll() {
    this.pending = [];
    this.current?.stop();
    this.hooks.onChange();
  }

  dequeueBook(bookId: string) {
    this.pending = this.pending.filter((item) => item.bookId !== bookId);
    if (this.running?.bookId === bookId) this.current?.stop();
    this.hooks.onChange();
  }

  dispose() {
    this.pending = [];
    this.current?.stop();
  }

  private requirePython() {
    const python = this.hooks.python();
    if (!python) throw new Error("Il narratore non è pronto.");
    return python;
  }

  private async next() {
    if (this.running || !this.pending.length) return;
    let python: string;
    try {
      python = this.requirePython();
    } catch (error) {
      this.lastError = (error as Error).message;
      this.pending = [];
      this.hooks.onChange();
      return;
    }

    const item = this.pending.shift()!;
    this.running = item;
    const translating = item.mode === "translate";
    this.progress = { bookId: item.bookId, progress: 0, label: translating ? "Avvio del traduttore…" : "Avvio del narratore…" };
    this.hooks.onChange();

    let failure = "";
    this.current = runBackend(
      python,
      [translating ? "translate" : "convert", "--book", item.bookId, "--chapters", item.chapters.join(","), "--library", libraryDir()],
      (event) => {
        if (event.type === "progress") {
          this.progress = event.payload as unknown as JobProgress;
          this.hooks.onChange();
        } else if (event.type === "chapter" || event.type === "translated") {
          this.hooks.onBookChanged(item.bookId);
        } else if (event.type === "log") {
          this.progress = { ...(this.progress ?? { bookId: item.bookId, progress: 0 }), label: String(event.payload.message) };
          this.hooks.onChange();
        } else if (event.type === "error") {
          failure = String(event.payload.message);
          this.hooks.log(String(event.payload.detail ?? ""));
        }
      },
      this.hooks.log
    );

    await this.current.done;
    this.current = null;
    this.running = null;
    this.progress = null;
    if (failure) this.lastError = failure;
    this.hooks.onBookChanged(item.bookId);
    this.hooks.onChange();
    void this.next();
  }
}
