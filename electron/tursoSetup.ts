// Configurazione automatica di Turso con la Platform API (https://docs.turso.tech/api-reference).
// Riceve un "Platform API token" e crea (o riusa) gruppo, database "grillo" e le due chiavi del database.
// Il Platform API token non viene salvato: serve solo durante questa chiamata.
// Nessuna dipendenza da Electron, così si può provare con Node contro un server finto.

export const DATABASE_NAME = "grillo";
const DEFAULT_API = "https://api.turso.tech";
const REGION_URL = "https://region.turso.io";
/** Per un utente in Italia: prima Francoforte, poi le altre europee. */
const EUROPE_PREFERENCE = ["aws-eu-central-1", "aws-eu-west-1", "aws-eu-west-2", "aws-eu-west-3", "fra", "ams", "cdg", "lhr"];

export interface TursoOrg {
  slug: string;
  name: string;
  type: string;
}

export type SetupResult =
  | { status: "choose-org"; orgs: TursoOrg[] }
  | {
      status: "done";
      org: string;
      group: string;
      createdGroup: boolean;
      createdDatabase: boolean;
      url: string;
      writeToken: string;
      readToken: string;
    };

/** Errore con un messaggio in italiano semplice, da mostrare così com'è. */
export class SetupError extends Error {}

interface Options {
  apiBase?: string;
  regionUrl?: string;
  fetch?: typeof fetch;
}

class PlatformApi {
  constructor(
    private readonly token: string,
    private readonly base: string,
    private readonly http: typeof fetch
  ) {}

  async call<T>(method: string, path: string, body?: unknown): Promise<{ status: number; data: T }> {
    let response: Response;
    try {
      response = await this.http(`${this.base}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${this.token}`,
          ...(body === undefined ? {} : { "Content-Type": "application/json" })
        },
        body: body === undefined ? undefined : JSON.stringify(body)
      });
    } catch {
      throw new SetupError("Non riesco a raggiungere Turso. Controlla la connessione a internet e riprova.");
    }
    const text = await response.text();
    let data: unknown = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { error: text };
    }
    return { status: response.status, data: data as T };
  }

  /** Come call, ma gli stati diversi da 2xx (tranne quelli in `allow`) diventano errori leggibili. */
  async ok<T>(method: string, path: string, body?: unknown, allow: number[] = []): Promise<{ status: number; data: T }> {
    const result = await this.call<T>(method, path, body);
    if ((result.status >= 200 && result.status < 300) || allow.includes(result.status)) return result;
    throw explain(result.status, (result.data as { error?: string })?.error);
  }
}

function explain(status: number, message?: string): SetupError {
  const detail = (message ?? "").toLowerCase();
  if (status === 401 || status === 403) {
    return new SetupError(
      "Turso non accetta questo token. Controlla di aver copiato tutto il Platform API token (non la chiave di un database) e che non sia stato revocato."
    );
  }
  if (status === 402 || /limit|quota|plan|upgrade|exceed/.test(detail)) {
    return new SetupError(
      "Il piano gratuito di Turso ha raggiunto un limite (numero di database o di gruppi). Elimina un database che non usi dalla dashboard di Turso, oppure usa la configurazione avanzata con un database che hai già."
    );
  }
  if (status >= 500) return new SetupError("Turso in questo momento non risponde bene. Riprova tra qualche minuto.");
  return new SetupError(`Turso ha risposto con un errore (${status})${message ? `: ${message}` : ""}.`);
}

async function chooseLocation(api: PlatformApi, http: typeof fetch, regionUrl: string): Promise<string> {
  const { data } = await api.ok<{ locations?: Record<string, string> }>("GET", "/v1/locations");
  const codes = Object.keys(data.locations ?? {});
  if (!codes.length) throw new SetupError("Turso non ha restituito nessuna località in cui creare il database.");

  try {
    const closest = (await (await http(regionUrl)).json()) as { client?: string };
    const match = codes.find((code) => code === closest.client || code.endsWith(`-${closest.client}`));
    if (match) return match;
  } catch {
    /* region.turso.io non raggiungibile: va bene la preferenza europea */
  }
  return (
    EUROPE_PREFERENCE.find((code) => codes.includes(code)) ??
    codes.find((code) => code.includes("eu-")) ??
    codes[0]
  );
}

/**
 * Esegue tutta la configurazione. Si può ripetere: gruppo e database esistenti vengono riusati.
 * Con più organizzazioni e senza `org` restituisce l'elenco da cui far scegliere.
 */
export async function setupTurso(platformToken: string, org?: string, options: Options = {}): Promise<SetupResult> {
  const token = platformToken.trim().replace(/^Bearer\s+/i, "");
  if (!token) throw new SetupError("Incolla il Platform API token di Turso.");
  const http = options.fetch ?? fetch;
  const api = new PlatformApi(token, (options.apiBase ?? DEFAULT_API).replace(/\/+$/, ""), http);

  // 1. Organizzazione
  let slug = org;
  if (!slug) {
    const { data } = await api.ok<TursoOrg[]>("GET", "/v1/organizations");
    const orgs = (Array.isArray(data) ? data : []).map((item) => ({ slug: item.slug, name: item.name, type: item.type }));
    if (!orgs.length) throw new SetupError("Questo account Turso non ha nessuna organizzazione.");
    if (orgs.length > 1) return { status: "choose-org", orgs };
    slug = orgs[0].slug;
  }
  const orgPath = `/v1/organizations/${encodeURIComponent(slug)}`;

  // 2. Gruppo: il primo esistente, altrimenti "default" nella località più vicina
  const { data: groupList } = await api.ok<{ groups?: { name: string }[] }>("GET", `${orgPath}/groups`);
  let group = groupList.groups?.[0]?.name;
  let createdGroup = false;
  if (!group) {
    const location = await chooseLocation(api, http, options.regionUrl ?? REGION_URL);
    const created = await api.ok<{ group?: { name: string } }>("POST", `${orgPath}/groups`, { name: "default", location }, [409]);
    group = created.data.group?.name ?? "default";
    createdGroup = created.status !== 409;
  }

  // 3. Database "grillo": creato, oppure riusato se c'è già (409)
  const created = await api.ok<{ database?: { Hostname?: string } }>(
    "POST",
    `${orgPath}/databases`,
    { name: DATABASE_NAME, group },
    [409]
  );
  const createdDatabase = created.status !== 409;
  let hostname = created.data.database?.Hostname;
  if (!hostname) {
    const { data } = await api.ok<{ database?: { Hostname?: string } }>("GET", `${orgPath}/databases/${DATABASE_NAME}`);
    hostname = data.database?.Hostname;
  }
  if (!hostname) throw new SetupError("Turso non ha restituito l'indirizzo del database.");

  // 4. Chiavi del database, senza scadenza
  const tokenPath = `${orgPath}/databases/${DATABASE_NAME}/auth/tokens?expiration=never&authorization=`;
  const write = await api.ok<{ jwt?: string }>("POST", `${tokenPath}full-access`);
  const read = await api.ok<{ jwt?: string }>("POST", `${tokenPath}read-only`);
  if (!write.data.jwt || !read.data.jwt) throw new SetupError("Turso non ha restituito le chiavi del database.");

  return {
    status: "done",
    org: slug,
    group,
    createdGroup,
    createdDatabase,
    url: `libsql://${hostname}`,
    writeToken: write.data.jwt,
    readToken: read.data.jwt
  };
}

/**
 * Link del QR, nel formato che le app di ascolto leggono (ilmatta: src/lib/config.ts):
 * <url-app>/#setup?db=<url libsql>&token=<chiave di sola lettura>. Sta nel frammento #, quindi non arriva mai al server.
 */
export function setupLink(appUrl: string, db: string, readToken: string): string {
  const params = new URLSearchParams({ db, token: readToken });
  return `${appUrl.trim().replace(/\/+$/, "")}/#setup?${params.toString()}`;
}
