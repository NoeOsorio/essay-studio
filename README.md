# Essay Studio

App de escritorio para escritura aumentada con IA — editor + canvas + un consejo de cuatro sabios que anotan, organizan y critican borradores. Pensada para escribir ensayos sobre psicología organizacional.

> Estado: **sesión 1**. Shell visual de la vista de escritura listo, sin IA ni persistencia reales todavía. Para el plan de sesiones y memoria persistente del proyecto, ver [CLAUDE.md](CLAUDE.md).

## Stack

- [Tauri 2](https://v2.tauri.app/) — wrapper de escritorio (Rust + WebView nativo)
- [Next.js 16](https://nextjs.org/) (App Router, static export)
- [React 19](https://react.dev/)
- [TypeScript](https://www.typescriptlang.org/) strict
- [Tailwind CSS 4](https://tailwindcss.com/) — tokens en CSS via `@theme`
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
# Instalar deps
npm install

# Vista web suelta (rápido, en localhost:3000)
npm run dev

# App de escritorio completa (Next.js + ventana Tauri)
npm run tauri:dev
```

> ⚠️ La **primera vez** que corres `npm run tauri:dev`, Cargo descarga y compila ~470 crates de Tauri y sus deps. Puede tardar **5-10 minutos**. Las siguientes corridas son segundos.

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
| `npm run tauri:dev` | Arranca Next dev + ventana Tauri |
| `npm run tauri:build` | Empaqueta la app de escritorio |
| `npm run tauri` | CLI de Tauri (passthrough) |

## Estructura

Ver [CLAUDE.md](CLAUDE.md) para el detalle. Resumen:

```
src/
├── app/                  # rutas Next.js
├── components/
│   ├── editor/           # placeholder, TipTap (futuro)
│   ├── canvas/           # placeholder, tldraw (futuro)
│   ├── council/          # avatares + UI del consejo de sabios
│   ├── ui/               # primitivos compartidos
│   ├── Topbar.tsx
│   └── Scorebar.tsx
└── lib/
    ├── agents/           # orquestación del consejo (futuro)
    ├── claude/           # cliente Anthropic API (futuro)
    └── storage/          # persistencia local (futuro)
src-tauri/                # lado Rust de Tauri
prompts/                  # prompts MD por sabio
```

## Convenciones

- **Conventional commits** (`feat:`, `fix:`, `chore:`, `docs:`, `refactor:`).
- **TS strict, prohibido `any`.**
- **Sin librerías de componentes externas.** Primitivos propios.
- **API key de Anthropic SOLO desde env** (`ANTHROPIC_API_KEY`). Jamás hardcoded.

## Diseño

Dirección visual: Pergamino (D2) + benchmarks circulares (D3 Atelier) + post-its con cinta vintage. Mockeado en HTML por Noé en [claude.ai/design](https://claude.ai/design); los design tokens viven en [src/app/globals.css](src/app/globals.css). Detalle en [CLAUDE.md](CLAUDE.md#diseño-pergamino--atelier-benchmarks).
