# Essay Studio

App de escritorio para escritura aumentada con IA — editor + canvas + un consejo de cuatro sabios que anotan, organizan y critican borradores. Pensada para escribir ensayos sobre psicología organizacional.

> Estado: **sesión 4 cerrada**. Editor TipTap + tablero tldraw + **El Empirista** vivo: pega un texto, te genera cinco preguntas streamadas en vivo, las guardas al ensayo. Auth contra el Agent SDK monthly credit de Claude Max (no API key). Los otros 3 sabios llegan en sesión 5. Para el plan completo, ver [CLAUDE.md](CLAUDE.md).

## Stack

- [Tauri 2](https://v2.tauri.app/) — wrapper de escritorio (Rust + WebView nativo)
- [Next.js 16](https://nextjs.org/) (App Router, static export)
- [React 19](https://react.dev/)
- [TypeScript](https://www.typescriptlang.org/) strict
- [Tailwind CSS 4](https://tailwindcss.com/) — tokens en CSS via `@theme`
- [TipTap 3](https://tiptap.dev/) — editor de texto rico con slash commands custom
- [tldraw 5](https://tldraw.dev/) — canvas con override del `NoteShapeUtil` para el visual Pergamino
- [Zustand 5](https://zustand-demo.pmnd.rs/) — state global (ensayo abierto, save status, overlays)
- [Claude Agent SDK](https://docs.claude.com/en/docs/agent-sdk/overview) — sabios via sidecar Node, auth OAuth de Claude Code
- [Playwright](https://playwright.dev/) — suite E2E para atajos, flow y sage (con sidecar stubbed)
- Fuentes: [Newsreader](https://fonts.google.com/specimen/Newsreader), [Inter](https://fonts.google.com/specimen/Inter), [JetBrains Mono](https://fonts.google.com/specimen/JetBrains+Mono) (vía `next/font/google`)

## Requisitos

- Node 20+ (probado con 22.17.0)
- npm 10+
- Rust **1.88 o más reciente** (varias crates transitivas piden `edition2024`)
  - Si tu `rustc --version` es menor: `rustup update stable`
  - Si no tienes rustup: [rustup.rs](https://rustup.rs/)
- macOS / Windows / Linux con dependencias nativas de Tauri:
  - macOS: Xcode Command Line Tools (`xcode-select --install`)
  - Linux: ver [requisitos de Tauri](https://v2.tauri.app/start/prerequisites/)

## Cómo correrlo

```bash
# Instalar deps (proyecto + sidecar de sabios)
npm install
npm run sidecar:install
npm run sidecar:build
npx playwright install chromium

# Vista web suelta (rápido, en localhost:3000) — útil para iterar UI
npm run dev

# App de escritorio completa (Next.js + ventana Tauri + sidecar Node)
npm run tauri:dev
```

> Para que el **Empirista** (y los demás sabios en sesiones futuras) funcionen, necesitas tener [Claude Code](https://claude.com/code) instalado y logueado con tu cuenta Max/Pro. El sidecar reutiliza esas credenciales OAuth (vía macOS Keychain en mac) y consume del **Agent SDK monthly credit** de tu plan — no se cobra a un API key separado.

> ⚠️ La **primera vez** que corres `npm run tauri:dev`, Cargo descarga y compila ~470 crates de Tauri y sus deps. Puede tardar **5-10 minutos**. Las siguientes corridas son segundos.

> En `npm run dev` solo (sin Tauri), las llamadas de persistencia van a fallar porque el bridge `window.__TAURI_INTERNALS__` no existe en un browser puro. Para desarrollar la persistencia real, usa `npm run tauri:dev`.

## Tests

Suite E2E con Playwright que cubre el flow completo (TipTap + tldraw + autosave) contra `next dev` con un stub de Tauri en memoria. **Antes de tocar atajos, edit modes o el flow lista↔editor, corre `npm run test:e2e`.**

```bash
npm run test:e2e          # headless, ~25s
npm run test:e2e:ui       # UI interactiva (debugging)
```

Lo que cubre:

- **Editor** — texto plano, título single-line, slash menu, `⌘B` bold
- **Tablero** — `N` no es sticky, escribir después de crear va al note, atajos no se solapan con typing, counter live, panel contextual asigna autor/kind
- **Flow** — crear ensayo persiste, autosave guarda, breadcrumb vuelve a la lista

Tests del lado Rust:

```bash
cd src-tauri && cargo test
```

Cubren round-trip de persistencia, ordenamiento, sanitización de IDs, escritura atómica.

## Build de producción

```bash
npm run tauri:build
```

Genera el bundle nativo en `src-tauri/target/release/bundle/` (`.dmg` / `.app` en macOS, `.msi` en Windows, `.deb`/`.AppImage` en Linux).

## Scripts disponibles

| Script | Qué hace |
|---|---|
| `npm run dev` | Next.js dev server en `http://localhost:3000` |
| `npm run build` | Build estático → `./out` |
| `npm run lint` | ESLint sobre `src/` |
| `npm run test:e2e` | Suite Playwright headless |
| `npm run test:e2e:ui` | Suite Playwright con UI interactiva |
| `npm run sidecar:install` | Instala deps del sidecar (Agent SDK + tipos) |
| `npm run sidecar:build` | Compila el sidecar Node → `sidecar/dist/sage.js` |
| `npm run tauri:dev` | Arranca Next dev + ventana Tauri + sidecar de sabios |
| `npm run tauri:build` | Empaqueta la app de escritorio |
| `npm run tauri` | CLI de Tauri (passthrough) |

## Estructura

Ver [CLAUDE.md](CLAUDE.md) para el detalle. Resumen:

```
src/
├── app/                       # rutas Next.js (SPA puro: una sola ruta)
├── components/
│   ├── editor/                # TipTap real
│   ├── canvas/                # tldraw real (override NoteShapeUtil)
│   ├── lectura/               # overlay del Interrogatorio
│   ├── council/               # avatares + UI del consejo
│   ├── ui/                    # primitivos compartidos
│   ├── EssayList.tsx
│   ├── Topbar.tsx             # incluye botón "Interrogar"
│   └── Scorebar.tsx
└── lib/
    ├── store.ts               # Zustand (ensayo abierto, save status, overlay)
    ├── storage/               # invoke wrappers + tipos del Essay
    └── agents/                # interrogate() + parsePreguntas + sage://event
src-tauri/                     # storage commands + sidecar lifecycle
sidecar/                       # Node + Claude Agent SDK (sabios)
   ├── src/sage.ts             # JSON-Lines stdin/stdout protocol
   └── dist/sage.js            # compilado (gitignored)
tests/e2e/                     # Playwright (keyboard + flow + sage stubbed)
prompts/                       # personas markdown por sabio
```

## Convenciones

- **Conventional commits** (`feat:`, `fix:`, `chore:`, `docs:`, `refactor:`).
- **TS strict, prohibido `any`.**
- **Sin librerías de componentes externas.** Primitivos propios.
- **API key de Anthropic SOLO desde env** (`ANTHROPIC_API_KEY`). Jamás hardcoded.
- **Antes de tocar keyboard handlers / edit modes**, correr `npm run test:e2e`. La suite existe porque ese subsistema nos ha mordido dos veces.

## Diseño

Dirección visual: Pergamino (D2) + benchmarks circulares (D3 Atelier) + post-its con cinta vintage. Mockeado en HTML por Noé en [claude.ai/design](https://claude.ai/design); los design tokens viven en [src/app/globals.css](src/app/globals.css). Detalle en [CLAUDE.md](CLAUDE.md#diseño-pergamino--atelier-benchmarks).
