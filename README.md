# Essay Studio

App de escritorio para escritura aumentada con IA — editor + canvas + un consejo de cuatro sabios que anotan, organizan y critican borradores. Pensada para escribir ensayos sobre psicología organizacional.

> Estado: **sesión 3 cerrada**. Editor TipTap real con persistencia local + tablero tldraw con post-its tipados (autor + kind via `meta`). Sabios todavía no existen — llegan en sesión 4. Para el plan de sesiones y memoria persistente del proyecto, ver [CLAUDE.md](CLAUDE.md).

## Stack

- [Tauri 2](https://v2.tauri.app/) — wrapper de escritorio (Rust + WebView nativo)
- [Next.js 16](https://nextjs.org/) (App Router, static export)
- [React 19](https://react.dev/)
- [TypeScript](https://www.typescriptlang.org/) strict
- [Tailwind CSS 4](https://tailwindcss.com/) — tokens en CSS via `@theme`
- [TipTap 3](https://tiptap.dev/) — editor de texto rico con slash commands custom
- [tldraw 5](https://tldraw.dev/) — canvas con override del `NoteShapeUtil` para el visual Pergamino
- [Zustand 5](https://zustand-demo.pmnd.rs/) — state global (ensayo abierto, save status)
- [Playwright](https://playwright.dev/) — suite E2E para atajos y flow
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
# Instalar deps (incluye descargar el binario chromium para Playwright)
npm install
npx playwright install chromium

# Vista web suelta (rápido, en localhost:3000) — útil para iterar UI
npm run dev

# App de escritorio completa (Next.js + ventana Tauri)
npm run tauri:dev
```

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
| `npm run tauri:dev` | Arranca Next dev + ventana Tauri |
| `npm run tauri:build` | Empaqueta la app de escritorio |
| `npm run tauri` | CLI de Tauri (passthrough) |

## Estructura

Ver [CLAUDE.md](CLAUDE.md) para el detalle. Resumen:

```
src/
├── app/                       # rutas Next.js (SPA puro: una sola ruta)
├── components/
│   ├── editor/                # TipTap real
│   │   ├── EditorPane.tsx
│   │   ├── TitleInput.tsx
│   │   ├── SlashMenu.tsx
│   │   └── extensions/
│   │       └── SlashCommand.ts
│   ├── canvas/                # tldraw real
│   │   ├── BoardPane.tsx
│   │   ├── BoardToolbar.tsx
│   │   ├── NoteContextPanel.tsx
│   │   └── note-shape.tsx     # PergaminoNoteShapeUtil (override)
│   ├── council/               # avatares + UI del consejo
│   ├── ui/                    # primitivos compartidos
│   ├── EssayList.tsx
│   ├── Topbar.tsx
│   └── Scorebar.tsx
└── lib/
    ├── store.ts               # Zustand (ensayo abierto, save status)
    ├── storage/               # invoke wrappers + tipos del Essay
    ├── agents/                # orquestación del consejo (sesión 4+)
    └── claude/                # cliente Anthropic API (sesión 4+)
src-tauri/                     # lado Rust de Tauri (storage commands)
tests/e2e/                     # Playwright specs (keyboard + flow)
prompts/                       # prompts MD por sabio (los agrega Noé)
```

## Convenciones

- **Conventional commits** (`feat:`, `fix:`, `chore:`, `docs:`, `refactor:`).
- **TS strict, prohibido `any`.**
- **Sin librerías de componentes externas.** Primitivos propios.
- **API key de Anthropic SOLO desde env** (`ANTHROPIC_API_KEY`). Jamás hardcoded.
- **Antes de tocar keyboard handlers / edit modes**, correr `npm run test:e2e`. La suite existe porque ese subsistema nos ha mordido dos veces.

## Diseño

Dirección visual: Pergamino (D2) + benchmarks circulares (D3 Atelier) + post-its con cinta vintage. Mockeado en HTML por Noé en [claude.ai/design](https://claude.ai/design); los design tokens viven en [src/app/globals.css](src/app/globals.css). Detalle en [CLAUDE.md](CLAUDE.md#diseño-pergamino--atelier-benchmarks).
