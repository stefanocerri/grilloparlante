import { app } from "electron";
import { ChildProcessWithoutNullStreams, spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import type { RuntimeEvent, RuntimeProgress, RuntimeStatus } from "../shared/contracts";

interface ManagedRuntimeMetadata {
  runtimeId: string;
  runtimeVersion: string;
  appVersion: string;
  arch: string;
  pythonPath: string;
  source?: string;
  installedAt?: string;
}

const RUNTIME_FAMILY = "qwen";
const LEGACY_RUNTIME_FAMILIES = ["luxtts", "xtts"];
const INSTALL_HINT = "brew install python@3.11";
const MIN_BOOTSTRAP_PYTHON = [3, 11] as const;
const IGNORED_PYTHON_WARNING =
  "ignore:pkg_resources is deprecated as an API:UserWarning";

function emitRuntimeEvent(
  emit: (event: RuntimeEvent) => void,
  type: RuntimeEvent["type"],
  payload: RuntimeEvent["payload"]
) {
  emit({
    type,
    payload,
    timestamp: new Date().toISOString()
  } as RuntimeEvent);
}

export function resolveBackendRoot() {
  return app.isPackaged
    ? path.join(process.resourcesPath, "backend")
    : path.join(app.getAppPath(), "backend");
}

function resolveRuntimeManifestPath() {
  return path.join(resolveBackendRoot(), "runtime", "managed_runtime_manifest.json");
}

function readRuntimeManifest() {
  const manifestPath = resolveRuntimeManifestPath();
  return JSON.parse(fs.readFileSync(manifestPath, "utf8")) as {
    runtimeId: string;
    runtimeVersion: string;
    displayName?: string;
    packageSpec?: string;
    modelName?: string;
    promptText?: string;
  };
}

function resolveRuntimeDir() {
  const manifest = readRuntimeManifest();
  return path.join(
    app.getPath("userData"),
    "runtimes",
    RUNTIME_FAMILY,
    `${manifest.runtimeVersion}-${app.getVersion()}-${process.arch}`
  );
}

function resolveMetadataPath(runtimeDir = resolveRuntimeDir()) {
  return path.join(runtimeDir, "runtime.json");
}

function resolveLegacyRuntimeDirs() {
  const root = path.join(app.getPath("userData"), "runtimes");
  return LEGACY_RUNTIME_FAMILIES.map((family) => path.join(root, family));
}

function resolveObsoleteCurrentFamilyRuntimeDirs(currentRuntimeDir = resolveRuntimeDir()) {
  const familyRoot = path.dirname(currentRuntimeDir);
  if (!fs.existsSync(familyRoot)) {
    return [] as string[];
  }

  return fs
    .readdirSync(familyRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(familyRoot, entry.name))
    .filter((candidate) => candidate !== currentRuntimeDir);
}

function resolveHealthcheckScript() {
  return path.join(resolveBackendRoot(), "runtime", "healthcheck_managed_runtime.py");
}

function resolveDevelopmentPythonCommand() {
  const backendRoot = resolveBackendRoot();
  const configured = process.env.GRILLO_PYTHON_PATH;
  const bundled = path.join(backendRoot, ".venv", "bin", "python");

  if (configured && fs.existsSync(configured)) {
    return configured;
  }

  if (fs.existsSync(bundled)) {
    return bundled;
  }

  return "python3";
}

function resolvePythonExecutable(command: string) {
  const result = spawnSync(command, ["-c", "import sys; print(sys.executable)"], {
    encoding: "utf8"
  });

  if (result.status !== 0) {
    return undefined;
  }

  const resolved = result.stdout.trim();
  return resolved || undefined;
}

function parsePythonVersion(command: string) {
  const result = spawnSync(
    command,
    ["-c", "import sys; print(f'{sys.version_info[0]}.{sys.version_info[1]}.{sys.version_info[2]}')"],
    {
      encoding: "utf8"
    }
  );

  if (result.status !== 0) {
    return undefined;
  }

  const raw = result.stdout.trim();
  const parts = raw.split(".").map((segment) => Number(segment));

  if (parts.length < 2 || parts.some((value) => Number.isNaN(value))) {
    return undefined;
  }

  return {
    raw,
    major: parts[0],
    minor: parts[1],
    patch: parts[2] ?? 0
  };
}

function isSupportedBootstrapVersion(command: string) {
  const version = parsePythonVersion(command);
  if (!version) {
    return false;
  }

  if (version.major > MIN_BOOTSTRAP_PYTHON[0]) {
    return true;
  }

  return (
    version.major === MIN_BOOTSTRAP_PYTHON[0] &&
    version.minor >= MIN_BOOTSTRAP_PYTHON[1]
  );
}

export class ManagedRuntimeManager {
  private statusCache: RuntimeStatus | null = null;

  private installProcess: ChildProcessWithoutNullStreams | null = null;

  private lastInstallError: string | null = null;

  private installForceKillTimer: NodeJS.Timeout | null = null;

  constructor(private readonly emit: (event: RuntimeEvent) => void) {}

  private resolveBootstrapPython() {
    const candidates = [
      process.env.GRILLO_BOOTSTRAP_PYTHON_PATH,
      path.join(process.resourcesPath, "python", "bin", "python3"),
      "/opt/homebrew/bin/python3.13",
      "/opt/homebrew/bin/python3.12",
      "/opt/homebrew/bin/python3.11",
      "/usr/local/bin/python3.13",
      "/usr/local/bin/python3.12",
      "/usr/local/bin/python3.11",
      process.env.GRILLO_PYTHON_PATH,
      path.join(resolveBackendRoot(), ".venv", "bin", "python"),
      resolvePythonExecutable("python3"),
      resolvePythonExecutable("python")
    ].filter((value): value is string => Boolean(value));

    for (const candidate of candidates) {
      if (!fs.existsSync(candidate)) {
        continue;
      }

      if (isSupportedBootstrapVersion(candidate)) {
        return candidate;
      }
    }

    return undefined;
  }

  private readMetadata(runtimeDir: string) {
    const metadataPath = resolveMetadataPath(runtimeDir);
    if (!fs.existsSync(metadataPath)) {
      return null;
    }

    try {
      return JSON.parse(fs.readFileSync(metadataPath, "utf8")) as ManagedRuntimeMetadata;
    } catch {
      return null;
    }
  }

  private buildBaseStatus(overrides: Partial<RuntimeStatus> = {}): RuntimeStatus {
    const manifest = readRuntimeManifest();
    const runtimeDir = resolveRuntimeDir();
    const metadataPath = resolveMetadataPath(runtimeDir);
    const isPackaged = app.isPackaged;

    return {
      runtimeId: manifest.runtimeId,
      runtimeVersion: manifest.runtimeVersion,
      mode: isPackaged ? "managed" : "development",
      state: "checking",
      isPackaged,
      arch: process.arch,
      appVersion: app.getVersion(),
      runtimeDir,
      metadataPath,
      message: "Controllo del runtime vocale in corso.",
      conversionBlocked: isPackaged,
      installRequired: true,
      fallbackAllowed: !isPackaged,
      fallbackActive: !isPackaged,
      canInstall: Boolean(this.resolveBootstrapPython()),
      canRepair: Boolean(this.resolveBootstrapPython()),
      canRemove: fs.existsSync(runtimeDir),
      source: manifest.packageSpec ?? manifest.displayName,
      ...overrides
    };
  }

  private buildMissingStatus() {
    const bootstrapPython = this.resolveBootstrapPython();
    const isPackaged = app.isPackaged;

    return this.buildBaseStatus({
      state: "missing",
      message: isPackaged
        ? "Installa il motore voce per attivare Qwen beta."
        : "Il motore voce beta non e pronto. In sviluppo puoi continuare con il fallback placeholder.",
      detail: this.lastInstallError
        ? this.lastInstallError
        : bootstrapPython
          ? undefined
        : "Non ho trovato un Python bootstrap disponibile per preparare il runtime gestito.",
      installHint: bootstrapPython ? undefined : INSTALL_HINT,
      conversionBlocked: isPackaged,
      installRequired: true,
      fallbackActive: !isPackaged,
      canInstall: Boolean(bootstrapPython),
      canRepair: Boolean(bootstrapPython),
      canRemove: false
    });
  }

  private runHealthcheck(pythonPath: string) {
    const manifest = readRuntimeManifest();
    const command = [resolveHealthcheckScript()];

    if (manifest.modelName) {
      command.push("--model-name", manifest.modelName);
    }

    const completed = spawnSync(pythonPath, command, {
      cwd: resolveBackendRoot(),
      encoding: "utf8"
    });

    const raw = completed.stdout.trim().split("\n").filter(Boolean).at(-1);
    let parsed: { ok?: boolean; error?: string } = {};

    if (raw) {
      try {
        parsed = JSON.parse(raw) as { ok?: boolean; error?: string };
      } catch {
        parsed = {};
      }
    }

    return {
      ok: completed.status === 0 && parsed.ok === true,
      detail:
        parsed.error ??
        completed.stderr.trim() ??
        completed.stdout.trim() ??
        "Managed runtime healthcheck failed."
    };
  }

  async getStatus(force = false): Promise<RuntimeStatus> {
    if (!force && this.statusCache && !this.installProcess) {
      return this.statusCache;
    }

    if (this.installProcess && this.statusCache) {
      return this.statusCache;
    }

    const runtimeDir = resolveRuntimeDir();
    const metadata = this.readMetadata(runtimeDir);

    if (!metadata) {
      const missing = this.buildMissingStatus();
      this.statusCache = missing;
      return missing;
    }

    if (metadata.arch !== process.arch) {
      const errored = this.buildBaseStatus({
        state: "error",
        message: "Il runtime installato non corrisponde all'architettura del Mac.",
        detail: `Atteso ${process.arch}, trovato ${metadata.arch}.`,
        conversionBlocked: app.isPackaged,
        installRequired: true,
        fallbackActive: !app.isPackaged,
        pythonPath: metadata.pythonPath,
        canInstall: Boolean(this.resolveBootstrapPython()),
        canRepair: Boolean(this.resolveBootstrapPython()),
        canRemove: true
      });
      this.statusCache = errored;
      return errored;
    }

    if (metadata.appVersion !== app.getVersion()) {
      const outdated = this.buildBaseStatus({
        state: "error",
        message: "Il runtime voce deve essere aggiornato per questa versione dell'app.",
        detail: `Runtime ${metadata.appVersion}, app ${app.getVersion()}.`,
        conversionBlocked: app.isPackaged,
        installRequired: true,
        fallbackActive: !app.isPackaged,
        pythonPath: metadata.pythonPath,
        canInstall: Boolean(this.resolveBootstrapPython()),
        canRepair: Boolean(this.resolveBootstrapPython()),
        canRemove: true
      });
      this.statusCache = outdated;
      return outdated;
    }

    if (!metadata.pythonPath || !fs.existsSync(metadata.pythonPath)) {
      const broken = this.buildBaseStatus({
        state: "error",
        message: "Il runtime voce e incompleto.",
        detail: "L'eseguibile Python del runtime gestito non e disponibile.",
        conversionBlocked: app.isPackaged,
        installRequired: true,
        fallbackActive: !app.isPackaged,
        canInstall: Boolean(this.resolveBootstrapPython()),
        canRepair: Boolean(this.resolveBootstrapPython()),
        canRemove: true
      });
      this.statusCache = broken;
      return broken;
    }

    const health = this.runHealthcheck(metadata.pythonPath);
    if (!health.ok) {
      const errored = this.buildBaseStatus({
        state: "error",
        message: app.isPackaged
          ? "Il motore voce richiede una riparazione."
          : "Qwen beta non e sano nel runtime gestito. Puoi ripararlo o continuare con il fallback.",
        detail: health.detail,
        conversionBlocked: app.isPackaged,
        installRequired: true,
        fallbackActive: !app.isPackaged,
        pythonPath: metadata.pythonPath,
        canInstall: Boolean(this.resolveBootstrapPython()),
        canRepair: Boolean(this.resolveBootstrapPython()),
        canRemove: true
      });
      this.statusCache = errored;
      return errored;
    }

    const ready = this.buildBaseStatus({
      state: "ready",
      message: "Motore voce pronto.",
      detail: "Qwen e pronto. Per il clone voce devi comunque selezionare un sample reale nelle impostazioni.",
      conversionBlocked: false,
      installRequired: false,
      fallbackActive: false,
      canInstall: false,
      canRepair: true,
      canRemove: true,
      pythonPath: metadata.pythonPath,
      source: metadata.source ?? readRuntimeManifest().packageSpec
    });
    this.statusCache = ready;
    return ready;
  }

  private setStatus(status: RuntimeStatus) {
    this.statusCache = status;
    emitRuntimeEvent(this.emit, "status", status);
  }

  private setProgress(progress: RuntimeProgress) {
    emitRuntimeEvent(this.emit, "progress", progress);
  }

  async install(mode: "install" | "repair" = "install") {
    if (this.installProcess) {
      throw new Error("Un'installazione del runtime e gia in corso.");
    }

    const bootstrapPython = this.resolveBootstrapPython();
    if (!bootstrapPython) {
      const errored = this.buildBaseStatus({
        state: "error",
        message: "Non posso preparare il runtime voce automaticamente.",
        detail:
          this.lastInstallError ??
          "Python bootstrap non trovato o versione inferiore a 3.11.",
        installHint: INSTALL_HINT,
        conversionBlocked: app.isPackaged,
        installRequired: true,
        fallbackActive: !app.isPackaged,
        canInstall: false,
        canRepair: false,
        canRemove: fs.existsSync(resolveRuntimeDir())
      });
      this.setStatus(errored);
      throw new Error(`${errored.message} ${errored.installHint ?? ""}`.trim());
    }

    const runtimeDir = resolveRuntimeDir();
    fs.mkdirSync(runtimeDir, { recursive: true });
    this.lastInstallError = null;

    const installer = path.join(resolveBackendRoot(), "runtime", "install_managed_runtime.py");
    this.installProcess = spawn(
      bootstrapPython,
      [
        installer,
        "--runtime-dir",
        runtimeDir,
        "--backend-root",
        resolveBackendRoot(),
        "--app-version",
        app.getVersion(),
        "--arch",
        process.arch
      ],
      {
        cwd: resolveBackendRoot(),
        env: {
          ...process.env,
          GRILLO_BOOTSTRAP_PYTHON_PATH: bootstrapPython
        },
        detached: process.platform !== "win32"
      }
    );

    for (const legacyDir of resolveLegacyRuntimeDirs()) {
      if (fs.existsSync(legacyDir)) {
        fs.rmSync(legacyDir, { recursive: true, force: true });
      }
    }

    for (const obsoleteDir of resolveObsoleteCurrentFamilyRuntimeDirs(runtimeDir)) {
      fs.rmSync(obsoleteDir, { recursive: true, force: true });
    }

    this.setStatus(
      this.buildBaseStatus({
        state: "installing",
        message:
          mode === "repair"
            ? "Riparazione del motore voce in corso."
            : "Installazione del motore voce in corso.",
        detail: `Python bootstrap: ${bootstrapPython}`,
        conversionBlocked: true,
        installRequired: true,
        fallbackActive: false,
        canInstall: false,
        canRepair: false,
        canRemove: false
      })
    );

    const stdout = readline.createInterface({
      input: this.installProcess.stdout
    });

    stdout.on("line", (line) => {
      const trimmed = line.trim();
      if (!trimmed) {
        return;
      }

      try {
        const parsed = JSON.parse(trimmed) as RuntimeEvent;
        if (parsed.type === "progress") {
          this.setProgress(parsed.payload as RuntimeProgress);
          if (
            parsed.payload.state === "error" &&
            typeof parsed.payload.detail === "string" &&
            parsed.payload.detail.trim()
          ) {
            this.lastInstallError = parsed.payload.detail.trim();
          }
        }
      } catch {
        this.setProgress({
          state: "installing",
          step: "log",
          message: "Installer runtime",
          detail: trimmed
        });
      }
    });

    this.installProcess.stderr.on("data", (buffer) => {
      this.setProgress({
        state: "installing",
        step: "stderr",
        message: "Log runtime",
        detail: buffer.toString("utf8").trim()
      });
    });

    return await new Promise<RuntimeStatus>((resolve, reject) => {
      this.installProcess?.on("close", async (code) => {
        if (this.installForceKillTimer) {
          clearTimeout(this.installForceKillTimer);
          this.installForceKillTimer = null;
        }
        this.installProcess = null;
        const status = await this.getStatus(true);
        this.setStatus(status);

        if (code === 0 && status.state === "ready") {
          resolve(status);
          return;
        }

        reject(
          new Error(
            status.detail ??
              `Installazione del runtime non riuscita (exit code ${code ?? "unknown"}).`
          )
        );
      });

      this.installProcess?.on("error", async (error) => {
        if (this.installForceKillTimer) {
          clearTimeout(this.installForceKillTimer);
          this.installForceKillTimer = null;
        }
        this.installProcess = null;
        this.lastInstallError = error.message;
        const status = this.buildBaseStatus({
          state: "error",
          message: "Avvio installer runtime non riuscito.",
          detail: error.message,
          conversionBlocked: app.isPackaged,
          installRequired: true,
          fallbackActive: !app.isPackaged,
          canInstall: Boolean(this.resolveBootstrapPython()),
          canRepair: Boolean(this.resolveBootstrapPython()),
          canRemove: fs.existsSync(resolveRuntimeDir())
        });
        this.setStatus(status);
        reject(error);
      });
    });
  }

  async remove() {
    if (this.installProcess) {
      throw new Error("Attendi la fine dell'installazione prima di rimuovere il runtime.");
    }

    const current = await this.getStatus(true);
    if (!fs.existsSync(current.runtimeDir)) {
      const missing = this.buildMissingStatus();
      this.setStatus(missing);
      return missing;
    }

    this.setStatus({
      ...current,
      state: "removing",
      message: "Rimozione del motore voce in corso.",
      conversionBlocked: true,
      canInstall: false,
      canRepair: false,
      canRemove: false
    });

    fs.rmSync(current.runtimeDir, { recursive: true, force: true });
    for (const legacyDir of resolveLegacyRuntimeDirs()) {
      if (fs.existsSync(legacyDir)) {
        fs.rmSync(legacyDir, { recursive: true, force: true });
      }
    }
    for (const obsoleteDir of resolveObsoleteCurrentFamilyRuntimeDirs(current.runtimeDir)) {
      if (fs.existsSync(obsoleteDir)) {
        fs.rmSync(obsoleteDir, { recursive: true, force: true });
      }
    }
    const next = await this.getStatus(true);
    this.setStatus(next);
    return next;
  }

  dispose() {
    if (!this.installProcess) {
      return;
    }

    this.terminateInstallProcess("SIGKILL", false);
    this.installProcess = null;
  }

  async buildLaunchContext(options: { engine?: string } = {}) {
    const runtimeStatus = await this.getStatus();
    const existingWarnings = process.env.PYTHONWARNINGS?.trim();
    const env: Record<string, string> = {
      GRILLO_RUNTIME_INFO_JSON: JSON.stringify({
        runtimeId: runtimeStatus.runtimeId,
        runtimeVersion: runtimeStatus.runtimeVersion,
        mode: runtimeStatus.mode,
        revision: runtimeStatus.revision,
        pythonPath: runtimeStatus.pythonPath,
        source: runtimeStatus.source
      }),
      GRILLO_ALLOW_PLACEHOLDER_FALLBACK:
        runtimeStatus.fallbackAllowed && runtimeStatus.state !== "ready" ? "1" : "0",
      COQUI_TOS_AGREED: "1",
      NUMBA_DISABLE_JIT: "1",
      PYTHONWARNINGS: existingWarnings
        ? `${existingWarnings},${IGNORED_PYTHON_WARNING}`
        : IGNORED_PYTHON_WARNING
    };

    const manifest = readRuntimeManifest();
    if (manifest.modelName) {
      env.GRILLO_QWEN_MODEL = manifest.modelName;
    }

    // Only the Qwen engine needs the managed runtime. Other engines
    // (Supertonic, placeholder) run in the local dev/venv interpreter, which
    // already ships their dependencies.
    const requiresManagedRuntime = options.engine === "qwen";
    const pythonCommand =
      requiresManagedRuntime && runtimeStatus.state === "ready" && runtimeStatus.pythonPath
        ? runtimeStatus.pythonPath
        : resolveDevelopmentPythonCommand();

    return {
      runtimeStatus,
      pythonCommand,
      env
    };
  }

  private terminateInstallProcess(signal: NodeJS.Signals, scheduleForceKill = true) {
    if (!this.installProcess) {
      return;
    }

    const child = this.installProcess;

    if (this.installForceKillTimer) {
      clearTimeout(this.installForceKillTimer);
      this.installForceKillTimer = null;
    }

    try {
      if (process.platform !== "win32" && child.pid) {
        process.kill(-child.pid, signal);
      } else {
        child.kill(signal);
      }
    } catch {
      try {
        child.kill(signal);
      } catch {
        return;
      }
    }

    if (scheduleForceKill && signal !== "SIGKILL") {
      this.installForceKillTimer = setTimeout(() => {
        this.terminateInstallProcess("SIGKILL", false);
      }, 2000);
    }
  }
}
