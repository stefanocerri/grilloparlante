import { app, clipboard, dialog, ipcMain, nativeTheme, protocol, shell } from "electron";
import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import QRCode from "qrcode";
import type { AppQr, AppSnapshot, BookInfoEdit, Channel, ImportRequest, OnlineMatch, ThemeChoice, TursoSetupOutcome, VoiceCreateRequest, VoiceInfo } from "../shared/contracts";
import { CHANNEL_PROTOCOL_VERSION, type GrilloStatus, type RequestOptions } from "../shared/channel";
import { ChannelLink, ChannelStore, ChannelSync, channelView } from "./channels";
import { bookDir, deleteBook, listBooks, readBook, toView } from "./library";
import { backendRoot, libraryDir, readJson, userDataFile, userVoicesDir, writeJson } from "./paths";
import { VoiceCreator } from "./voiceCreator";
import { getPopover, hidePopover, popoverBackground, withPopoverPinned } from "./popover";
import { ConversionQueue } from "./queue";
import { RuntimeManager } from "./runtime";
import { checkSystem } from "./system";
import { SetupError, setupLink, setupTurso } from "./tursoSetup";
import { createTray, updateTray } from "./tray";
import { libraryWindow, openLibraryWindow } from "./libraryWindow";
import { ensureCover, previewDataUrl } from "./thumbnail";
import { LookupQueue, applyMatch, clearOnline, needsLookup, queryFor, resetManual, saveManual, searchOnline, setManualCover, type LookupQuery } from "./bookLookup";
import { readDetails } from "./bookDetails";

protocol.registerSchemesAsPrivileged([
  { scheme: "grillo", privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true } }
]);

const SUPPORTED = new Set([".pdf", ".epub", ".txt", ".md", ".json"]);
const SYNC_EVERY_MS = 60 * 60 * 1000;
const settingsFile = () => userDataFile("settings.json");
/**
 * Configurazione guidata: chi aveva gia collegato Turso prima che esistesse la consideriamo fatta.
 */
function loadOnboarded(): boolean {
  const stored = readJson<{ onboarded?: boolean; turso?: { url?: string } }>(settingsFile(), {});
  return stored.onboarded ?? Boolean(stored.turso?.url);
}

function saveSettings(patch: Record<string, unknown>) {
  const stored = readJson<Record<string, unknown>>(settingsFile(), {});
  writeJson(settingsFile(), { ...stored, ...patch });
}

let onboarded = loadOnboarded();

function loadTheme(): ThemeChoice {
  const stored = readJson<{ theme?: ThemeChoice }>(settingsFile(), {}).theme;
  return stored === "light" || stored === "dark" ? stored : "system";
}

let theme = loadTheme();

/** Ricerca online delle informazioni sui libri (editore, copertina, descrizione...): accesa se non la spegni. */
let lookupOnline = readJson<{ lookupOnline?: boolean }>(settingsFile(), {}).lookupOnline ?? true;
const lookups = new LookupQueue((bookId) => bookInfoChanged(bookId));

/** Dopo un'importazione (e all'avvio per i libri mai cercati): cerca le informazioni online. */
function lookupLater(bookId: string) {
  const book = readBook(bookId);
  if (lookupOnline && book && needsLookup(book)) lookups.add(bookId);
}

/** Informazioni del libro cambiate: aggiorna l'interfaccia e le app collegate. */
function bookInfoChanged(bookId: string) {
  broadcast();
  for (const sync of syncs.values()) sync.syncBook(bookId);
}
let broadcastTimer: NodeJS.Timeout | null = null;

const runtime = new RuntimeManager(broadcast);
/** Canali (app di ascolto collegate): creati quando l'app è pronta. */
let store: ChannelStore;
const syncs = new Map<string, ChannelSync>();
const links = new Map<string, ChannelLink>();
/** Platform API token di Turso: solo in memoria finché Grillo è aperto, mai su disco. */
let platformToken: string | null = null;

const queue = new ConversionQueue({
  python: () => runtime.python,
  onChange: broadcast,
  onBookChanged: (bookId) => {
    broadcast();
    for (const sync of syncs.values()) sync.syncBook(bookId);
  },
  log: (line) => {
    if (line.trim()) console.log(`[backend] ${line}`);
  }
});

const voiceCreator = new VoiceCreator(() => runtime.python, broadcast, (line) => {
  if (line.trim()) console.log(`[voce] ${line}`);
});

/** Voci incluse nell'app più quelle create dall'utente da un campione. */
function voices(): VoiceInfo[] {
  const list = (dir: string, host: string, custom: boolean) =>
    readJson<Omit<VoiceInfo, "previewUrl">[]>(path.join(dir, "voices.json"), [])
      .filter((voice) => fs.existsSync(path.join(dir, `${voice.id}.wav`)))
      .map((voice) => ({
        ...voice,
        custom,
        previewUrl: fs.existsSync(path.join(dir, `${voice.id}.preview.mp3`))
          ? `grillo://${host}/${voice.id}.preview.mp3`
          : undefined
      }));
  return [...list(path.join(backendRoot(), "voices"), "voices", false), ...list(userVoicesDir(), "uservoices", true)];
}

/** Crea o toglie caricamento e battito dei canali, dopo ogni modifica all'elenco. */
function refreshChannels() {
  for (const channel of store.channels) {
    if (syncs.has(channel.id)) continue;
    const id = channel.id;
    const sync = new ChannelSync(() => store.get(id), (bookId) => store.targetsOf(bookId).includes(id), broadcast);
    const link = new ChannelLink(() => store.get(id), sync, {
      status: grilloStatus,
      importFile: importForChannel,
      enqueue: (bookId, chapters) => queue.enqueue(bookId, chapters),
      queued: (bookId) => {
        const book = readBook(bookId);
        const ready = (book?.chapters ?? []).filter((chapter) => chapter.status === "ready").map((chapter) => chapter.index);
        return [...new Set([...queue.queuedChapters(bookId), ...ready])].sort((a, b) => a - b);
      },
      onInboxChange: broadcast,
      log: (line) => console.log(`[canale] ${line}`)
    });
    syncs.set(id, sync);
    links.set(id, link);
    sync.syncAll();
    link.start();
  }
  for (const [id, sync] of syncs) {
    if (store.get(id)) continue;
    links.get(id)?.stop();
    sync.dispose();
    syncs.delete(id);
    links.delete(id);
  }
}

function defaultVoice() {
  const list = voices();
  return list.find((voice) => voice.id === store.defaultVoiceId)?.id ?? list[0]?.id ?? null;
}

/** Stato che le app vedono nel loro database (semaforo, voci disponibili, coda). */
function grilloStatus(channel: Channel): GrilloStatus {
  const { running, progress, pending } = queue.state();
  const title = running ? readBook(running.bookId)?.title ?? null : null;
  return {
    version: CHANNEL_PROTOCOL_VERSION,
    state: runtime.status.state !== "ready" ? "no-narrator" : running || queue.importing ? "busy" : "ready",
    channel: { id: channel.id, name: channel.name },
    voices: voices().map((voice) => ({ id: voice.id, name: voice.name, gender: voice.gender })),
    defaultVoiceId: defaultVoice(),
    queue: {
      title,
      progress: progress?.progress ?? null,
      pendingChapters: pending.reduce((sum, item) => sum + item.chapters.length, 0)
    }
  };
}

/** File mandato da un'app: importato sul Mac e destinato solo a quell'app. */
async function importForChannel(filePath: string, options: RequestOptions, channelId: string) {
  const voiceId = voices().some((voice) => voice.id === options.voiceId) ? options.voiceId! : defaultVoice();
  if (!voiceId) throw new Error("Nessuna voce disponibile su Grillo.");
  const bookId = await queue.importBook({ filePath, voiceId, speed: options.speed ?? 1 });
  await ensureCover(bookId, filePath);
  lookupLater(bookId);
  store.setTargets(bookId, [channelId]);
  syncs.get(channelId)?.syncBook(bookId);
  broadcast();
  return bookId;
}

/** Capitoli caricati su tutte le destinazioni del libro (per l'icona nuvola). */
function uploadedEverywhere(bookId: string) {
  const targets = store.targetsOf(bookId).filter((id) => store.get(id)?.db);
  if (!targets.length) return [];
  const lists = targets.map((id) => new Set(syncs.get(id)?.uploadedChapters(bookId) ?? []));
  return [...lists[0]].filter((index) => lists.every((list) => list.has(index)));
}

function snapshot(): AppSnapshot {
  return {
    theme,
    onboarded,
    runtime: runtime.status,
    voices: voices(),
    voiceJob: voiceCreator.job,
    books: listBooks().map((book) =>
      toView(book, {
        uploaded: uploadedEverywhere(book.id),
        targets: store.targetsOf(book.id),
        queued: queue.queuedChapters(book.id),
        running: queue.runningChapters(book.id)
      })
    ),
    queue: queue.state(),
    channels: store.channels.map((channel) => channelView(channel, syncs.get(channel.id))),
    inbox: [...links.values()].flatMap((link) => link.inbox),
    defaultVoiceId: defaultVoice(),
    libraryDir: libraryDir(),
    lookupOnline
  };
}

function broadcast() {
  if (broadcastTimer) return;
  broadcastTimer = setTimeout(() => {
    broadcastTimer = null;
    const current = snapshot();
    updateTray(current);
    const popover = getPopover();
    if (!popover.isDestroyed()) popover.webContents.send("app:snapshot", current);
    libraryWindow()?.webContents.send("app:snapshot", current);
  }, 120);
}

/** grillo://library/<bookId>/<file> e grillo://voices/<file>, con supporto Range per l'audio. */
function serveFile(request: Request): Response {
  const url = new URL(request.url);
  const parts = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
  const root =
    url.host === "voices"
      ? path.join(backendRoot(), "voices")
      : url.host === "uservoices"
        ? userVoicesDir()
        : path.join(libraryDir(), "books");
  const file = path.resolve(root, ...parts);
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    return new Response("Non trovato", { status: 404 });
  }

  const size = fs.statSync(file).size;
  const ext = path.extname(file).toLowerCase();
  const type =
    ext === ".mp3"
      ? "audio/mpeg"
      : ext === ".png"
        ? "image/png"
        : ext === ".wav"
          ? "audio/wav"
          : ext === ".txt"
            ? "text/plain; charset=utf-8"
            : "image/jpeg";
  // L'interfaccia (anche da http://127.0.0.1 in sviluppo) legge il testo dei capitoli con fetch.
  const cors = { "Access-Control-Allow-Origin": "*" };
  const range = /bytes=(\d*)-(\d*)/.exec(request.headers.get("range") ?? "");

  if (range) {
    const start = range[1] ? Number(range[1]) : 0;
    const end = range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
    const stream = Readable.toWeb(fs.createReadStream(file, { start, end })) as ReadableStream;
    return new Response(stream, {
      status: 206,
      headers: {
        "Content-Type": type,
        "Content-Length": String(end - start + 1),
        "Content-Range": `bytes ${start}-${end}/${size}`,
        "Accept-Ranges": "bytes",
        ...cors
      }
    });
  }

  const stream = Readable.toWeb(fs.createReadStream(file)) as ReadableStream;
  return new Response(stream, {
    headers: { "Content-Type": type, "Content-Length": String(size), "Accept-Ranges": "bytes", ...cors }
  });
}

function sendDroppedFile(files: string[]) {
  const file = files.find((item) => SUPPORTED.has(path.extname(item).toLowerCase()));
  if (!file) return;
  const popover = getPopover();
  const send = () => popover.webContents.send("file:dropped", file);
  if (popover.webContents.isLoading()) popover.webContents.once("did-finish-load", send);
  else send();
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.whenReady().then(() => {
    // App da barra dei menu: niente icona nel Dock (vedi anche LSUIElement nel package.json).
    if (process.platform === "darwin") app.dock?.hide();
    protocol.handle("grillo", serveFile);
    getPopover();
    createTray({ onFilesDropped: sendDroppedFile, onQuit: () => app.quit() });
    void runtime.refresh();
    store = new ChannelStore(settingsFile());
    refreshChannels();
    // Libri importati prima della ricerca online: le informazioni arrivano piano piano, uno alla volta.
    for (const book of listBooks()) lookupLater(book.id);
    setInterval(() => {
      for (const sync of syncs.values()) sync.syncAll();
    }, SYNC_EVERY_MS);
    // themeSource cambia anche prefers-color-scheme nell'interfaccia: il CSS non deve sapere altro.
    nativeTheme.themeSource = theme;
    nativeTheme.on("updated", () => {
      const popover = getPopover();
      if (!popover.isDestroyed()) popover.setBackgroundColor(popoverBackground());
      libraryWindow()?.setBackgroundColor(popoverBackground());
    });
    broadcast();
  });
}

// Chiudere il pannello non chiude l'app: resta nella barra dei menu.
app.on("window-all-closed", () => undefined);

app.on("before-quit", () => queue.dispose());

// --- IPC ---------------------------------------------------------------------

ipcMain.handle("app:snapshot", () => snapshot());

ipcMain.handle("app:hide", () => hidePopover());

ipcMain.handle("app:quit", () => app.quit());

ipcMain.handle("runtime:install", () => runtime.install());

ipcMain.handle("runtime:refresh", () => runtime.refresh());

ipcMain.handle("system:check", () => checkSystem());

ipcMain.handle("onboarding:finish", () => {
  onboarded = true;
  saveSettings({ onboarded });
  broadcast();
});

ipcMain.handle("theme:set", (_event, next: ThemeChoice) => {
  theme = next === "light" || next === "dark" ? next : "system";
  nativeTheme.themeSource = theme;
  saveSettings({ theme });
  broadcast();
});

ipcMain.handle("onboarding:restart", () => {
  onboarded = false;
  saveSettings({ onboarded });
  broadcast();
});

/** Apre il Terminale: nella configurazione guidata l'utente ci incolla i comandi copiati. */
ipcMain.handle("app:open-terminal", () => shell.openPath("/System/Applications/Utilities/Terminal.app"));

ipcMain.handle("clipboard:write", (_event, text: string) => clipboard.writeText(text));

ipcMain.handle("dialog:pick-book", () =>
  withPopoverPinned(async () => {
    const result = await dialog.showOpenDialog({
      properties: ["openFile"],
      filters: [{ name: "Libri e articoli", extensions: ["pdf", "epub", "txt", "md", "json"] }]
    });
    return result.canceled ? null : result.filePaths[0];
  })
);

ipcMain.handle("dialog:confirm", (_event, message: string, detail?: string) =>
  withPopoverPinned(async () => {
    const result = await dialog.showMessageBox({
      type: "warning",
      buttons: ["Elimina", "Annulla"],
      defaultId: 1,
      cancelId: 1,
      message,
      detail
    });
    return result.response === 0;
  })
);

ipcMain.handle("voice:pick-sample", () =>
  withPopoverPinned(async () => {
    const result = await dialog.showOpenDialog({
      properties: ["openFile"],
      filters: [{ name: "Audio", extensions: ["wav", "mp3", "m4a", "flac", "ogg", "aac"] }]
    });
    return result.canceled ? null : result.filePaths[0];
  })
);

ipcMain.handle("voice:create", (_event, request: VoiceCreateRequest) => voiceCreator.create(request));

ipcMain.handle("voice:cancel", () => voiceCreator.cancel());

ipcMain.handle("voice:dismiss", () => voiceCreator.dismiss());

ipcMain.handle("voice:delete", (_event, voiceId: string) => voiceCreator.delete(voiceId));

ipcMain.handle("book:import", async (_event, request: ImportRequest) => {
  const bookId = await queue.importBook(request);
  await ensureCover(bookId, request.filePath);
  lookupLater(bookId);
  store.defaultVoiceId = request.voiceId;
  store.setTargets(bookId, request.targets ?? []);
  for (const sync of syncs.values()) sync.syncBook(bookId);
  if (request.convertAll) {
    const book = readBook(bookId);
    const pending = (book?.chapters ?? []).filter((chapter) => chapter.status !== "ready").map((chapter) => chapter.index);
    queue.enqueue(bookId, pending);
  }
  return bookId;
});

/** Prima pagina del file scelto, da mostrare prima di importarlo. */
ipcMain.handle("file:preview", (_event, filePath: string) => previewDataUrl(filePath));

ipcMain.handle("book:convert", (_event, bookId: string, chapters: number[]) => queue.enqueue(bookId, chapters));

ipcMain.handle("queue:cancel", () => queue.cancelAll());

ipcMain.handle("book:reveal", (_event, bookId: string) => shell.openPath(bookDir(bookId)));

ipcMain.handle("library:reveal", () => shell.openPath(libraryDir()));

ipcMain.handle("library:open", (_event, bookId?: string) => {
  hidePopover();
  openLibraryWindow(bookId);
});

ipcMain.handle("book:delete", async (_event, bookId: string) => {
  queue.dequeueBook(bookId);
  deleteBook(bookId);
  broadcast();
  store.forgetBook(bookId);
  await Promise.all([...syncs.values()].map((sync) => sync.removeRemote(bookId).catch(() => undefined)));
});

// --- Informazioni sul libro (online e a mano) ------------------------------------

ipcMain.handle("lookup:set", (_event, enabled: boolean) => {
  lookupOnline = Boolean(enabled);
  saveSettings({ lookupOnline });
  if (lookupOnline) for (const book of listBooks()) lookupLater(book.id);
  broadcast();
});

/** Cerca online: senza domanda usa ISBN, titolo e autore del libro. */
ipcMain.handle("book:info-search", async (_event, bookId: string, query?: LookupQuery) => {
  const book = readBook(bookId);
  if (!book) throw new Error("Libro non trovato");
  const auto = queryFor(book, readDetails(bookDir(bookId)).manual);
  const matches = await searchOnline(query && (query.text || query.title || query.isbn) ? query : auto);
  // Con l'ISBN e nessun risultato riprovo con titolo e autore.
  if (!matches.length && !query && auto.isbn) return searchOnline({ ...auto, isbn: undefined });
  return matches;
});

ipcMain.handle("book:info-apply", async (_event, bookId: string, match: OnlineMatch) => {
  await applyMatch(bookId, match);
  bookInfoChanged(bookId);
});

ipcMain.handle("book:info-clear-online", (_event, bookId: string) => {
  clearOnline(bookId);
  bookInfoChanged(bookId);
});

ipcMain.handle("book:info-save", (_event, bookId: string, edit: BookInfoEdit) => {
  saveManual(bookId, edit);
  bookInfoChanged(bookId);
});

ipcMain.handle("book:info-reset", (_event, bookId: string) => {
  resetManual(bookId);
  bookInfoChanged(bookId);
});

ipcMain.handle("book:info-cover", async (_event, bookId: string) => {
  const result = await withPopoverPinned(() =>
    dialog.showOpenDialog({
      title: "Scegli la copertina",
      properties: ["openFile"],
      filters: [{ name: "Immagini", extensions: ["jpg", "jpeg", "png", "webp"] }]
    })
  );
  if (result.canceled || !result.filePaths[0]) return false;
  setManualCover(bookId, result.filePaths[0]);
  bookInfoChanged(bookId);
  return true;
});

/** Destinazioni di un libro: i canali aggiunti ricevono il libro, quelli tolti lo perdono (sul Mac resta). */
ipcMain.handle("book:targets", (_event, bookId: string, targets: string[]) => {
  store.setTargets(bookId, targets);
  for (const sync of syncs.values()) sync.syncBook(bookId);
  broadcast();
});

/** Un database appena creato può impiegare qualche secondo a rispondere: riprovo un po' prima di arrendermi. */
async function testWithRetry(sync: ChannelSync, attempts = 6): Promise<string> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await sync.testConnection();
    } catch (error) {
      if (attempt >= attempts) throw error;
      await new Promise((resolve) => setTimeout(resolve, 2500));
    }
  }
}

function attachDb(id: string, db: Channel["db"]) {
  store.update(id, { db });
  syncs.get(id)?.reset();
  links.get(id)?.poke();
  broadcast();
}

ipcMain.handle("channel:add", (_event, name: string, appUrl: string) => {
  const channel = store.add(name, appUrl);
  refreshChannels();
  broadcast();
  return channel.id;
});

ipcMain.handle("channel:update", (_event, id: string, patch: { name?: string; appUrl?: string; rescanDone?: boolean }) => {
  store.update(id, { name: patch.name, appUrl: patch.appUrl, rescanDone: patch.rescanDone });
  broadcast();
});

/** Scollega e toglie l'app da Grillo. Il suo database su Turso resta (si elimina dalla dashboard di Turso). */
ipcMain.handle("channel:remove", (_event, id: string) => {
  store.remove(id);
  refreshChannels();
  broadcast();
});

ipcMain.handle("channel:has-token", () => Boolean(platformToken));

/**
 * Collega una o più app: per ognuna crea (o riusa) il database grillo-<id> con la Platform API e due chiavi
 * complete, una per Grillo e una per l'app. Il Platform API token resta solo in memoria.
 */
ipcMain.handle(
  "channel:connect",
  async (_event, ids: string[], token?: string, org?: string): Promise<TursoSetupOutcome> => {
    const useToken = token?.trim() || platformToken;
    if (!useToken) throw new Error("Serve il Platform API token di Turso.");
    const done: string[] = [];
    try {
      for (const id of ids) {
        const channel = store.get(id);
        if (!channel) continue;
        const result = await setupTurso(useToken, org, { dbName: `grillo-${id}` });
        if (result.status === "choose-org") return result;
        platformToken = useToken;
        attachDb(id, { name: `grillo-${id}`, url: result.url, token: result.writeToken, appToken: result.appToken, appCanWrite: true });
        await testWithRetry(syncs.get(id)!).catch((error: Error) => {
          throw new SetupError(
            `Il database di ${channel.name} è pronto, ma la prova di connessione non è riuscita: ${error.message}. Riprova tra un minuto.`
          );
        });
        done.push(channel.name);
      }
      return { status: "done", message: done.length ? `Collegate: ${done.join(", ")}.` : "Niente da collegare." };
    } catch (error) {
      if (error instanceof SetupError) throw new Error(error.message);
      throw new Error(`Collegamento non riuscito: ${(error as Error).message}`);
    }
  }
);

/** Configurazione avanzata: un database che esiste già. */
ipcMain.handle("channel:manual", async (_event, id: string, db: { url: string; token: string; appToken?: string }) => {
  const appToken = db.appToken?.trim() || db.token.trim();
  attachDb(id, { name: "manuale", url: db.url.trim(), token: db.token.trim(), appToken, appCanWrite: appToken === db.token.trim() });
  return testWithRetry(syncs.get(id)!, 1);
});

ipcMain.handle("channel:test", (_event, id: string) => {
  const sync = syncs.get(id);
  if (!sync) throw new Error("App non trovata.");
  return sync.testConnection();
});

ipcMain.handle("channel:sync", () => {
  for (const sync of syncs.values()) sync.syncAll();
});

/** Un QR per ogni app collegata con un indirizzo: database e chiave dell'app nel frammento #, mai al server. */
ipcMain.handle("channel:qr", async (): Promise<AppQr[]> => {
  const ready = store.channels.filter((channel) => channel.db && channel.appUrl);
  return Promise.all(
    ready.map(async (channel) => {
      const link = setupLink(channel.appUrl, channel.db!.url, channel.db!.appToken, { channel: channel.id, name: channel.name });
      return { id: channel.id, name: channel.name, link, image: await QRCode.toDataURL(link, { errorCorrectionLevel: "L", margin: 4, width: 1024 }) };
    })
  );
});
