import { ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import readline from "node:readline";
import { backendRoot } from "./paths";

export interface PythonEvent {
  type: string;
  payload: Record<string, unknown>;
}

export interface PythonRun {
  child: ChildProcessWithoutNullStreams;
  done: Promise<number>;
  stop: () => void;
}

/** Avvia `python -m app.cli ...` nel backend e passa ogni riga JSON di stdout a onEvent. */
export function runBackend(
  python: string,
  args: string[],
  onEvent: (event: PythonEvent) => void,
  onLog: (line: string) => void = () => undefined
): PythonRun {
  const child = spawn(python, ["-m", "app.cli", ...args], {
    cwd: backendRoot(),
    env: { ...process.env, PYTHONUNBUFFERED: "1", PYTHONWARNINGS: "ignore" },
    detached: process.platform !== "win32"
  });

  readline.createInterface({ input: child.stdout }).on("line", (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    try {
      onEvent(JSON.parse(trimmed) as PythonEvent);
    } catch {
      onLog(trimmed);
    }
  });
  readline.createInterface({ input: child.stderr }).on("line", (line) => onLog(line));

  const done = new Promise<number>((resolve) => {
    child.on("close", (code) => resolve(code ?? 1));
    child.on("error", (error) => {
      onEvent({ type: "error", payload: { message: `Impossibile avviare Python: ${error.message}` } });
      resolve(1);
    });
  });

  const stop = () => {
    try {
      if (process.platform !== "win32" && child.pid) process.kill(-child.pid, "SIGTERM");
      else child.kill("SIGTERM");
    } catch {
      /* gia terminato */
    }
    setTimeout(() => {
      try {
        if (child.exitCode === null && child.pid) process.kill(-child.pid, "SIGKILL");
      } catch {
        /* gia terminato */
      }
    }, 4000);
  };

  return { child, done, stop };
}
