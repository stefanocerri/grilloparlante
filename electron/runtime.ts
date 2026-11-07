import { app } from "electron";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import type { RuntimeStatus } from "../shared/contracts";
import { backendRoot, readJson } from "./paths";

const INSTALL_HINT = "brew install python@3.12";

function runtimeDir() {
  const manifest = readJson<{ runtimeId: string; runtimeVersion: string }>(
    path.join(backendRoot(), "runtime", "managed_runtime_manifest.json"),
    { runtimeId: "omnivoice", runtimeVersion: "1" }
  );
  return path.join(app.getPath("userData"), "runtime", `${manifest.runtimeId}-v${manifest.runtimeVersion}`);
}

function pythonVersion(command: string): [number, number] | null {
  const result = spawnSync(command, ["-c", "import sys; print(sys.version_info[0], sys.version_info[1])"], {
    encoding: "utf8"
  });
  if (result.status !== 0) return null;
  const [major, minor] = result.stdout.trim().split(" ").map(Number);
  return Number.isFinite(major) && Number.isFinite(minor) ? [major, minor] : null;
}

function bootstrapPython(): string | undefined {
  const candidates = [
    process.env.GRILLO_BOOTSTRAP_PYTHON_PATH,
    "/opt/homebrew/bin/python3.12",
    "/opt/homebrew/bin/python3.11",
    "/opt/homebrew/bin/python3.13",
    "/usr/local/bin/python3.12",
    "/usr/local/bin/python3.11",
    "/usr/local/bin/python3.13",
    "python3.12",
    "python3.11",
    "python3"
  ].filter((value): value is string => Boolean(value));

  for (const candidate of candidates) {
    if (candidate.includes("/") && !fs.existsSync(candidate)) continue;
    const version = pythonVersion(candidate);
    if (version && (version[0] > 3 || (version[0] === 3 && version[1] >= 10))) return candidate;
  }
  return undefined;
}

export class RuntimeManager {
  status: RuntimeStatus = { state: "checking", message: "Controllo del motore voce…", canInstall: false };

  python: string | null = null;

  private installing = false;

  constructor(private readonly onChange: () => void) {}

  /** Python da usare: variabile d'ambiente o .venv in sviluppo, altrimenti il runtime installato. */
  private candidatePython(): string | null {
    if (process.env.GRILLO_PYTHON_PATH && fs.existsSync(process.env.GRILLO_PYTHON_PATH)) {
      return process.env.GRILLO_PYTHON_PATH;
    }
    if (!app.isPackaged) {
      const dev = path.join(backendRoot(), ".venv", "bin", "python");
      if (fs.existsSync(dev)) return dev;
    }
    const managed = readJson<{ pythonPath?: string; appVersion?: string } | null>(
      path.join(runtimeDir(), "runtime.json"),
      null
    );
    if (managed?.pythonPath && fs.existsSync(managed.pythonPath)) return managed.pythonPath;
    return null;
  }

  private set(status: RuntimeStatus) {
    this.status = status;
    this.onChange();
  }

  async refresh() {
    if (this.installing) return;
    const python = this.candidatePython();
    const canInstall = Boolean(bootstrapPython());

    if (!python) {
      this.python = null;
      this.set({
        state: "missing",
        message: "Il motore voce non è ancora installato.",
        detail: canInstall
          ? "Serve una sola volta: circa 5 GB tra PyTorch e il modello OmniVoice."
          : "Per installarlo serve Python 3.10 o più recente.",
        canInstall,
        installHint: canInstall ? undefined : INSTALL_HINT
      });
      return;
    }

    const health = await new Promise<{ ok: boolean; device?: string; error?: string }>((resolve) => {
      const child = spawn(python, [path.join(backendRoot(), "runtime", "healthcheck_managed_runtime.py")], {
        cwd: backendRoot()
      });
      let out = "";
      child.stdout.on("data", (chunk) => (out += chunk.toString()));
      child.on("close", () => {
        try {
          resolve(JSON.parse(out.trim().split("\n").pop() || "{}"));
        } catch {
          resolve({ ok: false, error: out.trim() || "Controllo del motore non riuscito." });
        }
      });
      child.on("error", (error) => resolve({ ok: false, error: error.message }));
    });

    if (health.ok) {
      this.python = python;
      const device = health.device === "mps" ? "chip Apple (GPU)" : health.device === "cuda" ? "GPU NVIDIA" : "CPU";
      this.set({ state: "ready", message: `Motore voce pronto su ${device}.`, device: health.device, canInstall });
    } else {
      this.python = null;
      this.set({
        state: "error",
        message: "Il motore voce va riparato.",
        detail: health.error,
        canInstall
      });
    }
  }

  async install() {
    const bootstrap = bootstrapPython();
    if (!bootstrap) {
      this.set({
        state: "error",
        message: "Non trovo Python 3.10 o più recente.",
        canInstall: false,
        installHint: INSTALL_HINT
      });
      return;
    }

    this.installing = true;
    this.set({ state: "installing", message: "Preparazione…", progress: 0, canInstall: false });

    const child = spawn(
      bootstrap,
      [
        path.join(backendRoot(), "runtime", "install_managed_runtime.py"),
        "--runtime-dir",
        runtimeDir(),
        "--backend-root",
        backendRoot(),
        "--app-version",
        app.getVersion(),
        "--arch",
        process.arch
      ],
      { cwd: backendRoot() }
    );

    let lastDetail = "";
    readline.createInterface({ input: child.stdout }).on("line", (line) => {
      try {
        const event = JSON.parse(line) as {
          payload: { state: string; message: string; progress: number; detail?: string };
        };
        lastDetail = event.payload.detail ?? lastDetail;
        if (event.payload.state === "installing") {
          this.set({
            state: "installing",
            message: event.payload.message,
            progress: event.payload.progress,
            canInstall: false
          });
        }
      } catch {
        /* riga non JSON: ignorata */
      }
    });
    child.stderr.on("data", (chunk) => (lastDetail = chunk.toString().slice(-2000)));

    const code = await new Promise<number>((resolve) => child.on("close", (value) => resolve(value ?? 1)));
    this.installing = false;
    if (code !== 0) {
      this.set({
        state: "error",
        message: "Installazione non riuscita.",
        detail: lastDetail,
        canInstall: true
      });
      return;
    }
    await this.refresh();
  }
}
