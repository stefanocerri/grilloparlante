import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { NewVoiceInput, SavedVoice } from "../shared/contracts";

const NATIVE_AUDIO_EXTENSIONS = new Set([".wav", ".flac", ".ogg"]);
const SUPPORTED_AUDIO_EXTENSIONS = new Set([
  ".wav",
  ".mp3",
  ".m4a",
  ".aiff",
  ".aif",
  ".flac",
  ".ogg"
]);
const MAX_NAME_LENGTH = 60;

function findFfmpeg(): string | null {
  const candidates = [
    process.env.GRILLO_FFMPEG_PATH,
    "/opt/homebrew/bin/ffmpeg",
    "/usr/local/bin/ffmpeg",
    "/usr/bin/ffmpeg"
  ].filter((value): value is string => Boolean(value));

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  const probe = spawnSync("ffmpeg", ["-version"], { stdio: "ignore" });
  return probe.status === 0 ? "ffmpeg" : null;
}

function normalizeName(name: string) {
  return name.replace(/\s+/g, " ").trim().slice(0, MAX_NAME_LENGTH);
}

/**
 * Persistent library of user voices (cloned samples for Qwen, custom style
 * JSON for Supertonic). Every voice gets its own folder under
 * `<userData>/voices/<id>/` so the original file can be moved or deleted
 * without breaking future conversions.
 */
export class VoiceLibrary {
  private readonly indexPath: string;

  constructor(private readonly rootDir: string) {
    this.indexPath = path.join(rootDir, "voices.json");
  }

  get directory() {
    return this.rootDir;
  }

  list(): SavedVoice[] {
    return this.readIndex().filter((voice) => {
      const asset = voice.engine === "qwen" ? voice.referenceAudioPath : voice.voiceStylePath;
      return Boolean(asset && fs.existsSync(asset));
    });
  }

  add(input: NewVoiceInput): SavedVoice {
    const name = normalizeName(input.name ?? "");

    if (!name) {
      throw new Error("Dai un nome alla nuova voce.");
    }

    const voices = this.readIndex();

    if (voices.some((voice) => voice.name.toLowerCase() === name.toLowerCase())) {
      throw new Error(`Esiste gia una voce chiamata "${name}".`);
    }

    const id = `voice-${Date.now().toString(36)}-${crypto.randomBytes(3).toString("hex")}`;
    const voiceDir = path.join(this.rootDir, id);
    fs.mkdirSync(voiceDir, { recursive: true });

    try {
      const voice =
        input.engine === "supertonic"
          ? this.createStyleVoice(id, name, voiceDir, input)
          : this.createCloneVoice(id, name, voiceDir, input);

      voices.push(voice);
      this.writeIndex(voices);
      return voice;
    } catch (error) {
      fs.rmSync(voiceDir, { recursive: true, force: true });
      throw error;
    }
  }

  rename(id: string, nextName: string): SavedVoice {
    const name = normalizeName(nextName ?? "");

    if (!name) {
      throw new Error("Il nome della voce non puo essere vuoto.");
    }

    const voices = this.readIndex();
    const voice = voices.find((item) => item.id === id);

    if (!voice) {
      throw new Error("Voce non trovata.");
    }

    if (voices.some((item) => item.id !== id && item.name.toLowerCase() === name.toLowerCase())) {
      throw new Error(`Esiste gia una voce chiamata "${name}".`);
    }

    voice.name = name;
    this.writeIndex(voices);
    return voice;
  }

  remove(id: string) {
    const voices = this.readIndex();
    const next = voices.filter((voice) => voice.id !== id);

    if (next.length === voices.length) {
      return;
    }

    this.writeIndex(next);

    const voiceDir = path.join(this.rootDir, path.basename(id));
    if (voiceDir.startsWith(this.rootDir + path.sep)) {
      fs.rmSync(voiceDir, { recursive: true, force: true });
    }
  }

  private createCloneVoice(
    id: string,
    name: string,
    voiceDir: string,
    input: NewVoiceInput
  ): SavedVoice {
    const referenceText = (input.referenceText ?? "").trim();

    if (!referenceText) {
      throw new Error(
        "Serve la trascrizione esatta del campione: Qwen la usa per clonare ritmo e timbro."
      );
    }

    let referenceAudioPath: string;
    let source: SavedVoice["source"];

    if (input.recordingWav && input.recordingWav.byteLength > 44) {
      referenceAudioPath = path.join(voiceDir, "sample.wav");
      fs.writeFileSync(referenceAudioPath, Buffer.from(input.recordingWav));
      source = "recording";
    } else if (input.sourcePath) {
      referenceAudioPath = this.importAudioFile(input.sourcePath, voiceDir);
      source = "file";
    } else {
      throw new Error("Scegli un file audio o registra un campione dal microfono.");
    }

    return {
      id,
      name,
      engine: "qwen",
      createdAt: new Date().toISOString(),
      source,
      referenceAudioPath,
      referenceText
    };
  }

  private createStyleVoice(
    id: string,
    name: string,
    voiceDir: string,
    input: NewVoiceInput
  ): SavedVoice {
    const sourcePath = input.sourcePath?.trim();

    if (!sourcePath || !fs.existsSync(sourcePath)) {
      throw new Error("Scegli il file JSON della voce creato con Supertone Voice Builder.");
    }

    try {
      JSON.parse(fs.readFileSync(sourcePath, "utf8"));
    } catch {
      throw new Error("Il file scelto non e un JSON valido.");
    }

    const voiceStylePath = path.join(voiceDir, "style.json");
    fs.copyFileSync(sourcePath, voiceStylePath);

    return {
      id,
      name,
      engine: "supertonic",
      createdAt: new Date().toISOString(),
      source: "style",
      voiceStylePath
    };
  }

  private importAudioFile(sourcePath: string, voiceDir: string) {
    if (!fs.existsSync(sourcePath)) {
      throw new Error(`File audio non trovato: ${sourcePath}`);
    }

    const extension = path.extname(sourcePath).toLowerCase();

    if (!SUPPORTED_AUDIO_EXTENSIONS.has(extension)) {
      throw new Error("Formato audio non supportato. Usa WAV, MP3, M4A, AIFF, FLAC o OGG.");
    }

    const wavTarget = path.join(voiceDir, "sample.wav");
    const ffmpeg = findFfmpeg();

    // Normalizza sempre a WAV mono 24 kHz quando ffmpeg e disponibile:
    // il backend legge il campione con soundfile, che non apre m4a/aiff ovunque.
    if (ffmpeg) {
      const result = spawnSync(
        ffmpeg,
        ["-y", "-loglevel", "error", "-i", sourcePath, "-ac", "1", "-ar", "24000", wavTarget],
        { encoding: "utf8" }
      );

      if (result.status === 0 && fs.existsSync(wavTarget)) {
        return wavTarget;
      }
    }

    if (NATIVE_AUDIO_EXTENSIONS.has(extension) || extension === ".mp3") {
      const copyTarget = path.join(voiceDir, `sample${extension}`);
      fs.copyFileSync(sourcePath, copyTarget);
      return copyTarget;
    }

    throw new Error(
      "Per importare file M4A/AIFF serve ffmpeg (brew install ffmpeg). In alternativa usa un WAV o registra dal microfono."
    );
  }

  private readIndex(): SavedVoice[] {
    try {
      const raw = JSON.parse(fs.readFileSync(this.indexPath, "utf8"));
      return Array.isArray(raw?.voices) ? (raw.voices as SavedVoice[]) : [];
    } catch {
      return [];
    }
  }

  private writeIndex(voices: SavedVoice[]) {
    fs.mkdirSync(this.rootDir, { recursive: true });
    const tempPath = `${this.indexPath}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify({ version: 1, voices }, null, 2));
    fs.renameSync(tempPath, this.indexPath);
  }
}
