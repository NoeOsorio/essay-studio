# Essay Studio

App de escritorio para escritura aumentada con IA — editor + canvas + un consejo de cuatro sabios que anotan, organizan y critican borradores. Pensada para escribir ensayos sobre psicología organizacional.

> Estado: **sesión 11 cerrada**. Editor TipTap + tablero tldraw + **los 4 sabios vivos** (Empirista / Sistémico / Práctico / Crítico), interrogación coral (3 preguntas por sabio en paralelo), **Evaluar** multi-pasada con anotaciones inline + click-to-apply, **Rúbrica** del profesor inyectada al consejo, **Fuentes** persistentes por ensayo, pasada APA en modo académico, **Benchmark** derivado de anotaciones con estados honestos (—/ parcial / 10 / stale), **idioma ES/EN** por ensayo, y **build distribuible** (`npm run tauri:build:full` genera un `.app` con el sidecar empacado). Auth contra el Agent SDK monthly credit de Claude Max. Para el plan por sesión, ver [CLAUDE.md](CLAUDE.md); para lo que falta, [ROADMAP.md](ROADMAP.md).

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

### Primera vez (setup)

```bash
npm install                       # deps del proyecto
npm run sidecar:install           # deps del sidecar (Claude Agent SDK)
npm run sidecar:build             # compila el sidecar → sidecar/dist/sage.js
npx playwright install chromium   # navegador para E2E
```

### Día a día — ¿qué corro?

| Qué quieres ver | Comando | Notas |
|---|---|---|
| Iterar UI rápido en el browser | `npm run dev` | Abre `http://localhost:3000`. Sin Tauri ni sidecar: persistencia y sabios fallan porque no existe `window.__TAURI_INTERNALS__`. Útil para tweaks de estilo. |
| **La app real** (editor + tablero + consejo) | `npm run tauri:dev` | Lanza Next + ventana Tauri + sidecar Node todo junto. Es lo que usas el 90% del tiempo. La ventana abre con el **icono de la app**. |
| Empacar el `.app` / `.dmg` distribuible | `npm run tauri:build` | 10+ min. Produce el bundle en `src-tauri/target/release/bundle/`. El **icono del Dock** de macOS solo aparece desde el `.app` bundleado, no en `tauri:dev`. |
| Solo el build estático de Next | `npm run build` | Salida en `./out/`. Lo usa `tauri:build` internamente. |

> **Auth de los sabios:** necesitas tener [Claude Code](https://claude.com/code) instalado y logueado con tu cuenta Max/Pro. El sidecar reutiliza esas credenciales OAuth (macOS Keychain) y consume del **Agent SDK monthly credit** de tu plan — no hay API key.

> **Primera vez con `tauri:dev`:** Cargo descarga y compila ~470 crates de Tauri y sus deps. Tarda **5-10 minutos**. Las siguientes corridas son segundos. Si `next dev` ya estaba corriendo en `:3000`, mátalo antes — Next 16 rechaza dos instancias del mismo proyecto.

> **Cambié el icono y no se actualiza en la app:** los iconos se embedean en el binario al compilar. Si cambias archivos en `src-tauri/icons/`, corre `cargo clean --manifest-path src-tauri/Cargo.toml -p app` y vuelve a `npm run tauri:dev`. El icono del **Dock de macOS** solo se ve correctamente desde el `.app` bundleado (`tauri:build`).

### Branding / iconos

El source del logo vive en `branding/logo.png` (transparente 500px) y `branding/logo-1024.png` (upscaled para el generator). Para regenerar todo el set de iconos (macOS `.icns`, Windows `.ico`, Linux PNGs, Windows Store, iOS, Android):

```bash
npx tauri icon branding/logo-1024.png
```

Para el favicon web, los archivos `src/app/icon.png` y `src/app/apple-icon.png` se sirven automáticamente por Next.js — al cambiarlos, hard refresh en el browser (`⌘⇧R`).

## Tests

**48 specs E2E (Playwright) + 10 tests Rust** — todos verdes. **Antes de tocar atajos, edit modes o el flow lista↔editor, corre la suite.** Nos ha mordido dos veces ese subsistema y por eso existen.

```bash
npm run test:e2e          # headless Playwright (~90s)
npm run test:e2e:ui       # con UI interactiva (debugging)
cargo test --manifest-path src-tauri/Cargo.toml   # Rust storage round-trips
```

Lo que cubre la suite E2E:

- **Editor** — texto plano, título single-line, slash menu, `⌘B` bold
- **Tablero** — `N` no es sticky, escribir después de crear va al note, atajos no se solapan con typing, counter live, panel contextual asigna autor/kind
- **Flow** — crear ensayo persiste, autosave guarda, breadcrumb vuelve a la lista
- **Sage / interrogación** — modo consejo (4×3=12 notes), modo single, checkboxes, bubble menu de selección, upload `.txt` que se guarda en biblioteca
- **Evaluar (Pluma Roja)** — 3 pasadas en paralelo, anotaciones inline aplican con `.anno` marks, popover, descartar, uncheck filtra apply
- **Rúbrica** — CRUD, count badge, pasada APA visible solo en académico, rúbrica forwarded a cada pase, chip de criterio
- **Fuentes** — CRUD, upload en biblioteca y desde Lectura, chip-picker, inyección a cada pase de Evaluar

Tests Rust cubren round-trip de persistencia (board, interrogatorios, rúbrica, fuentes), ordenamiento por `updatedAt`, sanitización de IDs, escritura atómica (tmp + rename).

## Build de producción

```bash
npm run tauri:build:full
```

Compila el sidecar (`sidecar/dist/sage.js`) **y luego** corre `tauri build` — los dos en orden. Es el comando recomendado: si solo corres `tauri:build` y olvidas reconstruir el sidecar, el `.app` resultante abre pero los sabios no responden (el banner rojo te avisa).

Genera el bundle nativo en `src-tauri/target/release/bundle/`:
- macOS: `.dmg` + `.app`
- Windows: `.msi`
- Linux: `.deb` / `.AppImage`

### Qué se empaca dentro del bundle

`tauri.conf.json` declara como `bundle.resources` (paths relativos a `src-tauri/`):
- `../sidecar/dist/sage.js` → el binario JS del consejo
- `../sidecar/package.json` → necesario para que Node respete `type: "module"`
- `../sidecar/node_modules/**/*` → la SDK del consejo y todas sus deps, incluyendo el binario nativo `claude` (~197 MB en `darwin-arm64`) que la SDK usa internamente para hacer las queries
- `../prompts/*.md` → las personas de los cuatro sabios

Todo termina en `Essay Studio.app/Contents/Resources/_up_/`. En runtime, Rust resuelve los paths via `app.path().resolve(..., BaseDirectory::Resource)`. Fallback de dev: walk-up desde `cwd` (busca `sidecar/dist/sage.js` y `prompts/` en el repo). Override manual: env vars `SAGE_SIDECAR_PATH` y `SAGE_PROMPTS_DIR`.

**Tamaño esperado del bundle:** `.app` ~272 MB · `.dmg` ~210 MB. El 90% es el binario nativo de la Claude Agent SDK. Es comparable a un Electron app típico (Slack, Notion, Discord). Si en algún momento querés distribuir, hay margen de optimización (esbuild + reusar el `claude` global del usuario en vez del bundled — Fase 3.2 del ROADMAP).

### Requisitos del usuario final (la primera vez que corre el `.app`)

- macOS 12+ (Tauri 2 requirement)
- **Node 20+** instalado (el sidecar es un proceso Node — el bundle no trae su propio runtime todavía; ver Fase 3.2 del ROADMAP)
- **Claude Code** instalado y logueado con cuenta Max / Pro — el sidecar reutiliza esas credenciales OAuth para autenticar contra el Agent SDK

Si falta `node` o el sidecar no arranca, la app abre un **banner rojo arriba del editor** ("El consejo no está disponible") con el detalle del error. El editor sigue siendo usable; solo Interrogar / Evaluar fallan hasta arreglar el entorno y reiniciar la app.

#### Cómo se encuentra Node (sesión 18)

Las apps de macOS lanzadas desde Finder/Dock **no heredan el PATH de tu shell** — arrancan con el PATH mínimo de `launchd`. Como nvm / fnm / volta instalan Node fuera de ese PATH, `node` "a secas" no se encuentra. La app resuelve el binario en cuatro capas:

1. `SAGE_NODE_PATH` — override explícito, si querés apuntar a un Node específico
2. El `PATH` del proceso — cubre `tauri:dev` y abrir la app con `open` desde la terminal
3. Ubicaciones conocidas — Homebrew (`/opt/homebrew/bin`, `/usr/local/bin`), volta, asdf, `/usr/bin`, y los version managers por-versión (nvm, fnm) eligiendo la **versión más alta** instalada
4. Preguntarle a tu login shell (`$SHELL -lc 'command -v node'`), que carga tu `.zprofile` y respeta cualquier setup exótico

Si aun así no aparece, el banner te dice cómo instalarlo. Para forzar un Node puntual:

```bash
SAGE_NODE_PATH=/ruta/a/node open "src-tauri/target/release/bundle/macos/Essay Studio.app"
```

### Smoke test post-build

La primera vez que generes un `.app` distribuible, verificá manualmente:

- [ ] `open src-tauri/target/release/bundle/macos/Essay\ Studio.app` abre la ventana sin crash
- [ ] El icono pergamino se ve correcto en el Dock
- [ ] No aparece el banner rojo del sidecar (si aparece → revisar Node + Claude Code)
- [ ] Crear ensayo persiste — el archivo aparece en `~/Library/Application Support/com.noeosorio.essaystudio/essays/<uuid>.json`
- [ ] Cerrar y reabrir el `.app` → el ensayo sigue ahí
- [ ] Click **Interrogar** streamea preguntas reales del modelo (no del stub)
- [ ] Click **Evaluar** produce anotaciones y el Scorebar refleja el score

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
| `npm run tauri:dev` | Arranca Next dev + ventana Tauri + sidecar de sabios (lo que usas a diario) |
| `npm run tauri:build` | Empaqueta la app de escritorio (.app/.dmg/.msi) usando lo que ya esté compilado |
| `npm run tauri:build:full` | **Compila el sidecar y luego empaqueta** — el comando de release recomendado |
| `npm run tauri` | CLI de Tauri (passthrough — p.ej. `npm run tauri -- icon branding/logo-1024.png`) |

## Estructura

Ver [CLAUDE.md](CLAUDE.md) para el detalle. Resumen:

```
branding/                       # source del logo + upscale para tauri icon
src/
├── app/
│   ├── icon.png                # favicon web (Next.js auto-served)
│   ├── apple-icon.png          # apple-touch-icon
│   └── …                       # layout, globals, page
├── components/
│   ├── editor/                 # TipTap + Annotation mark + popover
│   ├── canvas/                 # tldraw real (override NoteShapeUtil)
│   ├── lectura/
│   │   ├── LecturaOverlay.tsx     # Interrogatorio (consejo / single sabio)
│   │   ├── PlumaRojaOverlay.tsx   # Evaluar (3 pasadas + APA opcional)
│   │   ├── RubricaOverlay.tsx     # CRUD de criterios
│   │   └── FuentesOverlay.tsx     # biblioteca de fuentes por ensayo
│   ├── council/                # avatares clickables del consejo
│   ├── ui/                     # primitivos compartidos
│   ├── EssayList.tsx
│   ├── Topbar.tsx              # Fuentes · Rúbrica · Interrogar · Evaluar
│   └── Scorebar.tsx
└── lib/
    ├── store.ts                # Zustand (essay + overlays + autosave)
    ├── storage/                # invoke wrappers + tipos (Essay, Fuente, Rubrica…)
    ├── agents/                 # interrogate, critique, parseAnotaciones, buildAnotacion
    └── editor/findCita.ts      # resuelve citas literales a posiciones PM
src-tauri/                      # storage + sidecar lifecycle + sage_critique
│   └── icons/                  # generados por `npx tauri icon`
sidecar/                        # Node + Claude Agent SDK (sabios)
   ├── src/sage.ts              # JSON-Lines stdin/stdout protocol
   └── dist/sage.js             # compilado (gitignored)
tests/e2e/                      # Playwright (keyboard + flow + sage/rubrica/fuentes stubbed)
prompts/                        # personas markdown por sabio
```

## Convenciones

- **Conventional commits** (`feat:`, `fix:`, `chore:`, `docs:`, `refactor:`).
- **TS strict, prohibido `any`.**
- **Sin librerías de componentes externas.** Primitivos propios.
- **Sabios via OAuth de Claude Code**, no API key. El sidecar usa el binario de Claude Code instalado y reutiliza sus credenciales del Keychain. No hay `ANTHROPIC_API_KEY` en el proyecto.
- **Una feature por sesión.** Scope apretado. Cambios no triviales → plan/diff antes de aplicar.
- **No refactores preventivos.** Tradeoffs reales → explícalos y deja decidir a Noé.
- **Antes de tocar keyboard handlers / edit modes**, correr `npm run test:e2e`. La suite existe porque ese subsistema nos ha mordido dos veces.

## Diseño

Dirección visual: Pergamino (D2) + benchmarks circulares (D3 Atelier) + post-its con cinta vintage. Mockeado en HTML por Noé en [claude.ai/design](https://claude.ai/design); los design tokens viven en [src/app/globals.css](src/app/globals.css). Detalle en [CLAUDE.md](CLAUDE.md#diseño-pergamino--atelier-benchmarks).
