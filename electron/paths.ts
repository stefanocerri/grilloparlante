import { app } from "electron";
import fs from "node:fs";
import path from "node:path";

export function backendRoot() {
  return app.isPackaged ? path.join(process.resourcesPath, "backend") : path.join(app.getAppPath(), "backend");
}

/** Libreria visibile nel Finder: ~/Documents/Grillo Parlante */
export function libraryDir() {
  const dir = process.env.GRILLO_LIBRARY_DIR || path.join(app.getPath("documents"), "Grillo Parlante");
  fs.mkdirSync(path.join(dir, "books"), { recursive: true });
  return dir;
}

/** Voci create dall'utente da un campione: ~/Library/Application Support/Grillo parlante/voices */
export function userVoicesDir() {
  const dir = path.join(app.getPath("userData"), "voices");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function userDataFile(name: string) {
  return path.join(app.getPath("userData"), name);
}

export function readJson<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as T;
  } catch {
    return fallback;
  }
}

export function writeJson(file: string, value: unknown) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const partial = `${file}.part`;
  fs.writeFileSync(partial, JSON.stringify(value, null, 2));
  fs.renameSync(partial, file);
}
