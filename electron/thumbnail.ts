import { nativeImage } from "electron";
import fs from "node:fs";
import path from "node:path";
import { bookDir, readBook } from "./library";
import { writeJson } from "./paths";

/** Prima pagina di un PDF, EPUB o testo, con le miniature di QuickLook (macOS). Null se non disponibile. */
export async function firstPage(filePath: string, width = 600) {
  if (process.platform !== "darwin" || !fs.existsSync(filePath)) return null;
  try {
    const image = await nativeImage.createThumbnailFromPath(filePath, { width, height: Math.round(width * 1.4) });
    return image.isEmpty() ? null : image;
  } catch {
    return null;
  }
}

/** Anteprima per l'interfaccia (data URL), prima di importare. */
export async function previewDataUrl(filePath: string) {
  const image = await firstPage(filePath, 360);
  return image ? image.toDataURL() : null;
}

/**
 * Se il libro non ha copertina, usa la prima pagina del file: cover.jpg nella sua cartella.
 * Cambia updatedAt così la copertina arriva anche alle app collegate.
 */
export async function ensureCover(bookId: string, sourcePath: string) {
  const book = readBook(bookId);
  if (!book || book.cover || path.extname(sourcePath).toLowerCase() === ".json") return false;
  const image = await firstPage(sourcePath);
  if (!image) return false;
  fs.writeFileSync(path.join(bookDir(bookId), "cover.jpg"), image.toJPEG(85));
  const fresh = readBook(bookId);
  if (!fresh) return false;
  writeJson(path.join(bookDir(bookId), "book.json"), { ...fresh, cover: "cover.jpg", updatedAt: new Date().toISOString() });
  return true;
}
