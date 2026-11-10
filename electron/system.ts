import { app } from "electron";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import type { SystemCheck } from "../shared/contracts";
import { bootstrapPython, pythonVersion } from "./runtime";

/** PyTorch, OmniVoice e il modello occupano circa 5 GB: chiediamo un po' di margine. */
const REQUIRED_DISK_GB = 8;

function homebrewPath(): string | null {
  for (const candidate of ["/opt/homebrew/bin/brew", "/usr/local/bin/brew"]) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function macosVersion(): string | null {
  if (process.platform !== "darwin") return null;
  const result = spawnSync("sw_vers", ["-productVersion"], { encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : null;
}

async function freeDiskGb(): Promise<number | null> {
  try {
    const stats = await fs.promises.statfs(app.getPath("userData"));
    return Math.round(((stats.bavail * stats.bsize) / 1024 ** 3) * 10) / 10;
  } catch {
    return null;
  }
}

/** Tutto quello che serve sapere prima di installare il narratore, senza chiedere nulla all'utente. */
export async function checkSystem(): Promise<SystemCheck> {
  const python = bootstrapPython();
  const version = python ? pythonVersion(python) : null;
  const brew = homebrewPath();
  return {
    arch: process.arch === "arm64" ? "arm64" : os.arch(),
    macosVersion: macosVersion(),
    python: { ok: Boolean(python), version: version ? version.join(".") : null, path: python ?? null },
    homebrew: { ok: Boolean(brew), path: brew },
    freeDiskGb: await freeDiskGb(),
    requiredDiskGb: REQUIRED_DISK_GB
  };
}
