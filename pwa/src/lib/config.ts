export interface Connection {
  db: string;
  token: string;
}

const KEY = "grillo:connection";

export function loadConnection(): Connection | null {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) ?? "null") as Connection | null;
    return value?.db && value?.token ? value : null;
  } catch {
    return null;
  }
}

export function saveConnection(connection: Connection | null) {
  if (connection) localStorage.setItem(KEY, JSON.stringify(connection));
  else localStorage.removeItem(KEY);
}

/** Il QR dell'app Mac apre /#setup?db=...&token=... : salviamo e puliamo l'indirizzo. */
export function consumeSetupLink(): Connection | null {
  const hash = window.location.hash;
  if (!hash.startsWith("#setup?")) return null;
  const params = new URLSearchParams(hash.slice("#setup?".length));
  const db = params.get("db");
  const token = params.get("token");
  history.replaceState(null, "", window.location.pathname);
  if (!db || !token) return null;
  const connection = { db, token };
  saveConnection(connection);
  return connection;
}

/** Indirizzo del database: "/turso" in sviluppo diventa assoluto sull'origine della pagina. */
export function resolveDbUrl(db: string) {
  return db.startsWith("/") ? `${window.location.origin}${db}` : db;
}
