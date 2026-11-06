export function formatDuration(seconds: number | null | undefined): string {
  if (!seconds || seconds <= 0) return "—";
  const total = Math.round(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hours) return `${hours} h ${String(minutes).padStart(2, "0")} min`;
  if (minutes) return `${minutes} min ${String(secs).padStart(2, "0")} s`;
  return `${secs} s`;
}

export function formatMinutes(minutes: number): string {
  if (minutes < 1) return "< 1 min";
  if (minutes < 60) return `~${Math.round(minutes)} min`;
  return `~${Math.floor(minutes / 60)} h ${String(Math.round(minutes % 60)).padStart(2, "0")} min`;
}

export function formatEta(seconds?: number): string {
  if (seconds === undefined || seconds === null) return "calcolo del tempo…";
  if (seconds < 60) return "meno di un minuto";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `circa ${minutes} min`;
  return `circa ${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")} min`;
}
