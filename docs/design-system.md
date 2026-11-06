# Design System

## Direction

Editorial dashboard con energia brutalist / modernist:
- tipografia molto grande
- superfici nette
- poco rumore visivo
- accento cromatico forte
- molto spazio bianco
- logica da magazine più che da admin panel

## Palette

- `paper`: `#f4efe6`
- `panel`: `rgba(255, 251, 244, 0.92)`
- `ink`: `#15120f`
- `mute`: `#6f685f`
- `line`: `rgba(21, 18, 15, 0.12)`
- `accent`: `#ff6a3d`
- `warn`: `#ef4444`
- `ok`: `#1d8b5d`

## Typography

- display: `"Avenir Next Condensed", "Avenir Next", "Helvetica Neue", sans-serif`
- body: `"Avenir Next", "Helvetica Neue", sans-serif`
- mono: `"IBM Plex Mono", "SF Mono", "Menlo", monospace`

Scale:
- super headline: `clamp(3rem, 7vw, 6.8rem)`
- large headline: `clamp(2.4rem, 5vw, 4.4rem)`
- medium headline: `clamp(1.5rem, 3vw, 2.2rem)`
- eyebrow labels: `11px` uppercase con tracking ampio

## Spacing

Ritmo principale:
- outer shell: `28px`
- panel padding: `22px`
- inner block padding: `18px`
- grid gaps: `12px`, `16px`, `22px`

## Borders

- quasi tutto usa `1px solid var(--color-line)`
- niente card tonde soft-SaaS
- bordi usati come struttura grafica, non solo separatori

## Buttons

- primary: fondo `ink`, testo bianco, uppercase
- ghost: trasparente, stesso bordo del primary
- hover: lieve lift verticale

## Inputs and dropzone

- superfici semitrasparenti su sfondo chiaro
- area drag & drop con copy forte e stato file visibile
- campi lineari, leggibili, poco decorati

## Progress

- barra unica larga
- fill gradiente `ink -> accent`
- percentuale grande e tipografica

## Logs

- pannello dedicato
- monospaced details
- dot status per livello evento
- tono informativo prima, tecnico sotto

## Empty and error states

- copy chiara, calma, non allarmista
- dettaglio tecnico espandibile
- stessa grammatica visiva del resto della UI
