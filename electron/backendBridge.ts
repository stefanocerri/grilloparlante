import { ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { pathToFileURL } from "node:url";
import type {
  ConversionResult,
  ConversionSettings,
  InputFileMeta,
  JobEvent,
  JobEventType
} from "../shared/contracts";
import { resolveBackendRoot } from "./runtimeManager";

type JobListener = (event: JobEvent) => void;

const FALLBACK_PYTHONS = ["python3", "python"];

function resolvePythonCommand() {
  const backendRoot = resolveBackendRoot();
  const configured = process.env.GRILLO_PYTHON_PATH;
  const bundled = path.join(backendRoot, ".venv", "bin", "python");

  if (configured && fs.existsSync(configured)) {
    return configured;
  }

  if (fs.existsSync(bundled)) {
    return bundled;
  }

  return FALLBACK_PYTHONS[0];
}

function enrichResult(result: ConversionResult): ConversionResult {
  if (!result.previewFile && result.finalAudioFiles.length > 0) {
    result.previewFile = result.finalAudioFiles[0];
  }

  result.previewUrl = result.previewFile
    ? pathToFileURL(result.previewFile).toString()
    : undefined;

  result.coverUrl = result.coverPath
    ? pathToFileURL(result.coverPath).toString()
    : result.manifest.coverPath
      ? pathToFileURL(result.manifest.coverPath).toString()
      : undefined;

  result.chapters = result.chapters.map((chapter) => ({
    ...chapter,
    previewUrl: chapter.outputPath
      ? pathToFileURL(chapter.outputPath).toString()
      : undefined
  }));

  return result;
}

function looksLikeJsonEvent(line: string) {
  return line.startsWith("{") && line.endsWith("}");
}

function isBenignBackendStderr(line: string) {
  const normalized = line.toLowerCase();
  return (
    normalized.includes("pkg_resources is deprecated as an api") ||
    normalized.includes("the pkg_resources package is slated for removal")
  );
}

export class PythonJobBridge {
  private child: ChildProcessWithoutNullStreams | null = null;

  private activeJobId: string | null = null;

  private cancelRequested = false;

  private finalEventSeen = false;

  private forceKillTimer: NodeJS.Timeout | null = null;

  start(
    file: InputFileMeta,
    settings: ConversionSettings,
    listener: JobListener,
    options?: {
      pythonCommand?: string;
      env?: Record<string, string>;
    }
  ) {
    if (this.child) {
      throw new Error("A conversion job is already running.");
    }

    const backendRoot = resolveBackendRoot();
    const pythonCommand = options?.pythonCommand ?? resolvePythonCommand();
    const args = [
      "-m",
      "app.cli",
      "convert",
      "--input",
      file.path,
      "--settings",
      JSON.stringify(settings)
    ];

    this.activeJobId = `${Date.now()}-${path.basename(file.path)}`;
    this.cancelRequested = false;
    this.finalEventSeen = false;

    listener({
      type: "ready",
      payload: {
        jobId: this.activeJobId,
        file
      },
      timestamp: new Date().toISOString()
    });

    this.child = spawn(pythonCommand, args, {
      cwd: backendRoot,
      env: {
        ...process.env,
        ...options?.env,
        PYTHONUNBUFFERED: "1"
      },
      detached: process.platform !== "win32"
    });

    const stdout = readline.createInterface({
      input: this.child.stdout
    });

    stdout.on("line", (line) => {
      const trimmed = line.trim();

      if (!trimmed) {
        return;
      }

      if (!looksLikeJsonEvent(trimmed)) {
        listener(this.makeLogEvent("info", "Backend output", trimmed));
        return;
      }

      try {
        const parsed = JSON.parse(trimmed) as JobEvent;

        if (
          parsed.type === "result" ||
          parsed.type === "error" ||
          parsed.type === "cancelled"
        ) {
          this.finalEventSeen = true;
        }

        if (parsed.type === "result") {
          parsed.payload = enrichResult(parsed.payload as ConversionResult) as never;
        }

        listener(parsed);
      } catch {
        listener(this.makeLogEvent("warning", "Backend emitted invalid JSON", trimmed));
      }
    });

    this.child.stderr.on("data", (buffer) => {
      const detail = buffer.toString("utf8").trim();
      if (!detail || isBenignBackendStderr(detail)) {
        return;
      }

      listener(
        this.makeLogEvent("warning", "Backend stderr", detail)
      );
    });

    this.child.on("close", (code) => {
      if (this.forceKillTimer) {
        clearTimeout(this.forceKillTimer);
        this.forceKillTimer = null;
      }
      if (code && code !== 0 && !this.cancelRequested && !this.finalEventSeen) {
        listener({
          type: "error",
          payload: {
            message: "Python job exited unexpectedly.",
            detail: `Exit code ${code}`
          },
          timestamp: new Date().toISOString()
        });
      }

      this.reset();
    });

    this.child.on("error", (error) => {
      if (this.forceKillTimer) {
        clearTimeout(this.forceKillTimer);
        this.forceKillTimer = null;
      }
      listener({
        type: "error",
        payload: {
          message: "Unable to launch the local Python backend.",
          detail: error.message
        },
        timestamp: new Date().toISOString()
      });
      this.reset();
    });
  }

  cancel(listener: JobListener) {
    if (!this.child || !this.activeJobId) {
      return;
    }

    this.cancelRequested = true;
    this.finalEventSeen = true;
    this.terminateProcess("SIGTERM");
    listener({
      type: "cancelled",
      payload: {
        jobId: this.activeJobId
      },
      timestamp: new Date().toISOString()
    });
  }

  isRunning() {
    return Boolean(this.child);
  }

  dispose() {
    this.cancelRequested = true;
    this.finalEventSeen = true;
    this.terminateProcess("SIGKILL", false);
    this.reset();
  }

  private makeLogEvent(
    level: "info" | "warning" | "error",
    message: string,
    detail?: string
  ): JobEvent<"log"> {
    return {
      type: "log",
      payload: {
        level,
        message,
        detail
      },
      timestamp: new Date().toISOString()
    };
  }

  private reset() {
    if (this.forceKillTimer) {
      clearTimeout(this.forceKillTimer);
      this.forceKillTimer = null;
    }
    this.child = null;
    this.activeJobId = null;
    this.cancelRequested = false;
    this.finalEventSeen = false;
  }

  private terminateProcess(signal: NodeJS.Signals, scheduleForceKill = true) {
    if (!this.child) {
      return;
    }

    const child = this.child;

    if (this.forceKillTimer) {
      clearTimeout(this.forceKillTimer);
      this.forceKillTimer = null;
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
      this.forceKillTimer = setTimeout(() => {
        this.terminateProcess("SIGKILL", false);
      }, 2000);
    }
  }
}

export function isMac() {
  return process.platform === "darwin";
}

export function toFileUrl(filePath: string) {
  return pathToFileURL(filePath).toString();
}

export type MainChannel = JobEventType;
