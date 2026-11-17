import fs from "node:fs";
import path from "node:path";
import type { VoiceCreateRequest, VoiceJob } from "../shared/contracts";
import { userVoicesDir } from "./paths";
import { PythonRun, runBackend } from "./python";

/** Crea (o elimina) una voce da un campione audio con `python -m app.cli voice-create`. Una alla volta. */
export class VoiceCreator {
  job: VoiceJob | null = null;

  private run: PythonRun | null = null;

  constructor(
    private readonly python: () => string | null,
    private readonly onChange: () => void,
    private readonly log: (line: string) => void
  ) {}

  private set(job: VoiceJob | null) {
    this.job = job;
    this.onChange();
  }

  async create(request: VoiceCreateRequest): Promise<string> {
    const python = this.python();
    if (!python) throw new Error("Prima va installato il narratore.");
    if (this.run) throw new Error("Sto già creando una voce: aspetta che finisca.");
    if (!fs.existsSync(request.filePath)) throw new Error("Non trovo il file del campione.");

    this.set({ state: "running", name: request.name, progress: 0, label: "Avvio…" });
    let voiceId = "";
    let error = "";
    let cancelled = false;
    this.run = runBackend(
      python,
      [
        "voice-create",
        "--input", request.filePath,
        "--name", request.name,
        "--gender", request.gender,
        "--transcript", request.transcript ?? "",
        "--voices-dir", userVoicesDir()
      ],
      (event) => {
        if (event.type === "progress") {
          this.set({
            state: "running",
            name: request.name,
            progress: Number(event.payload.progress ?? 0),
            label: String(event.payload.label ?? "")
          });
        } else if (event.type === "result") voiceId = String(event.payload.id);
        else if (event.type === "error") error = String(event.payload.message ?? "Errore");
        else if (event.type === "cancelled") cancelled = true;
      },
      this.log
    );
    const code = await this.run.done;
    this.run = null;
    if (cancelled) {
      this.set(null);
      throw new Error("Creazione annullata.");
    }
    if (code !== 0 || !voiceId) {
      const message = error || "Non sono riuscito a creare la voce.";
      this.set({ state: "error", name: request.name, progress: 0, label: message });
      throw new Error(message);
    }
    this.set({ state: "done", name: request.name, progress: 1, label: "Voce pronta", voiceId });
    return voiceId;
  }

  cancel() {
    this.run?.stop();
  }

  dismiss() {
    if (!this.run) this.set(null);
  }

  /** Eliminare non richiede il modello: basta togliere i file e la voce da voices.json. */
  delete(voiceId: string) {
    const dir = userVoicesDir();
    const index = path.join(dir, "voices.json");
    let entries: { id: string }[] = [];
    try {
      entries = JSON.parse(fs.readFileSync(index, "utf8"));
    } catch {
      entries = [];
    }
    if (!entries.some((entry) => entry.id === voiceId)) throw new Error("Questa voce non è tra quelle create da te.");
    fs.writeFileSync(index, JSON.stringify(entries.filter((entry) => entry.id !== voiceId), null, 2));
    for (const suffix of [".wav", ".txt", ".preview.mp3", ".orig.wav", ".orig.txt"]) fs.rmSync(path.join(dir, voiceId + suffix), { force: true });
    this.onChange();
  }
}
