# Input JSON (articoli e notiziari)

Il convertitore accetta file `.json` con testo **già pulito e scritto per l'ascolto**.
Chi produce il file (per esempio l'app notizie) si occupa di trovare, scegliere e
riassumere; il convertitore si limita a generare l'audio.

Esempi pronti: [`backend/examples/articolo.json`](../backend/examples/articolo.json),
[`backend/examples/notiziario.json`](../backend/examples/notiziario.json).

## Campi principali

| Campo | Obbligatorio | Note |
|---|---|---|
| `schemaVersion` | consigliato | Oggi `1`. Serve a cambiare il formato senza rompere nulla. |
| `kind` | consigliato | `articolo` (default), `notiziario`, `libro`, `documentazione`. Finisce nel manifest e la PWA lo usa per le sezioni. |
| `title` | sì | Titolo dell'articolo o del notiziario. |
| `language` | no | Es. `it`. Se nelle impostazioni la lingua è "auto", viene usata questa. |
| `author`, `source`, `url` | no | Metadati mostrati nella PWA. |
| `publishedAt`, `expiresAt` | no | Date ISO 8601. `expiresAt` permette alla PWA di eliminare le notizie vecchie. |

## Tre forme possibili

1. **Articolo singolo**: `text` (o `paragraphs`) direttamente nell'oggetto principale. Diventa una traccia.
2. **Lista di articoli**: `items: [ { title, text | paragraphs, source?, url?, author?, publishedAt? } ]`.
3. **Notiziario a sezioni**: `sections: [ { title, items: [...] } ]`.

Ogni articolo diventa un capitolo (una traccia), quindi nella PWA si salta da una
notizia all'altra.

**Viene letto solo il testo** (`text` / `paragraphs`). Titolo, sezione, fonte, autore,
link e date non vengono letti: restano come metadati da mostrare nella PWA.

## Testo

- `text`: paragrafi separati da una riga vuota (`\n\n`); gli a capo singoli vengono ignorati.
- `paragraphs`: in alternativa, una lista di stringhe, una per paragrafo.
- Il testo viene letto così com'è: niente HTML, niente "clicca qui" o "nella foto",
  meglio scrivere per esteso sigle e numeri che suonerebbero male.

Se il file non è valido, la conversione si ferma con un messaggio che indica il problema
(es. `articolo 2: manca 'title'`).
