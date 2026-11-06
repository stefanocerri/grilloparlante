export interface Position {
  chapter: number;
  time: number;
  updatedAt: number;
}

const key = (bookId: string) => `grillo:pos:${bookId}`;

export function loadPosition(bookId: string): Position | null {
  try {
    return JSON.parse(localStorage.getItem(key(bookId)) ?? "null") as Position | null;
  } catch {
    return null;
  }
}

export function savePosition(bookId: string, chapter: number, time: number) {
  localStorage.setItem(key(bookId), JSON.stringify({ chapter, time, updatedAt: Date.now() }));
}

export function formatClock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

export function formatLength(seconds: number | null | undefined): string {
  if (!seconds) return "";
  const minutes = Math.round(seconds / 60);
  if (minutes < 1) return "< 1 min";
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")} min`;
}
