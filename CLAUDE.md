# Essay Studio — guía para Claude Code

> Memoria persistente del proyecto. Se actualiza al final de cada sesión con qué cambió, qué aprendimos, y qué viene.

## Qué es Essay Studio

App de escritorio para escritura aumentada con IA. Combina:

- **Editor estilo Notion** (a futuro con TipTap)
- **Canvas estilo FigJam** con post-its (a futuro con tldraw)
- **Consejo de 4 sabios** (agentes IA que anotan, organizan y critican borradores)

Noé la usa para aprender psicología organizacional mientras escribe ensayos.

## Stack (decidido en sesión 1)

| Pieza | Versión actual | Notas |
|---|---|---|
| Tauri | 2.11.x | wrapper de escritorio, Rust |
| Next.js | 16.2.6 | App Router, Turbopack, static export |
| React | 19.2.x | |
| TypeScript | 5.x **strict** | prohibido `any` |
| Tailwind | 4.x | tokens en CSS via `@theme` (sin `tailwind.config.ts`) |
| Zustand | 5.0.13 | state global del documento abierto + saveStatus + tablero |
| TipTap | 3.23.x | editor real con StarterKit + Placeholder + CharacterCount + slash commands custom |
| tldraw | 5.0.x | canvas con custom shape `postit` (tape vintage, headers de sabio, 5 tipos) |
| Claude Agent SDK | `@anthropic-ai/claude-agent-sdk` 0.2.x (Node) | corre en un sidecar; auth OAuth de Claude Code → Agent SDK monthly credit |
| Playwright | 1.59.x | E2E suite (keyboard + flow + sage) |

Persistencia: JSON files en app data dir para v1; migrar a SQLite cuando haya volumen.

## Diseño (Pergamino + Atelier benchmarks)

**Dirección elegida:** D2 Pergamino + benchmarks circulares de D3 Atelier + post-its con tape vintage.

**Source of truth:** prototipos HTML exportados de claude.ai/design en `https://api.anthropic.com/v1/design/h/v3Gc4dvsFkBWab4LeVVoOQ` (gzip → tar). Tratar los HTML como spec pixel-perfect, NO como código de producción — recrear el output visual, no copiar la estructura del prototipo.

**Paleta** (todos los tokens viven en [src/app/globals.css](src/app/globals.css) bajo `@theme`):
- Paper: `paper #F6F1E7` / `paper-2 #FBF7EE` / `paper-3 #EFE8DA` / `paper-4 #E6DDC9`
- Ink: `ink-1 #1F1B14` → `ink-4 #A89E89`
- Rules: `rule-1/2/3` warm beiges
- Sello rojo: `seal #B23A2A` (acento primario)
- **Sabios** (cada uno carga voz semántica — no sustituir):
  - **EM · Empirista** ámbar `#B07A1F` (datos, evidencia)
  - **SI · Sistémico** teal `#2E7E72` (frameworks, conexiones)
  - **PR · Práctico** coral `#B14B36` (aterrizar, aplicar)
  - **CR · Crítico** morado `#6E4FA8` (objeciones, contras)

**Tipografía:**
- **Newsreader** serif para body y títulos (NO Crimson Pro)
- **Inter** para UI
- **JetBrains Mono** para metadata, kbd hints, tags
- Configuradas en [src/app/layout.tsx](src/app/layout.tsx) con `next/font/google`.

## Estructura de carpetas

```
essay-studio/
├── prompts/                     # MD por sabio (lo agrega Noé)
├── src/
│   ├── app/
│   │   ├── layout.tsx           # fuentes + html shell
│   │   ├── page.tsx             # decide list vs editor según store
│   │   └── globals.css          # tokens @theme + clases custom + .tiptap-content
│   ├── components/
│   │   ├── Topbar.tsx           # toolbar superior, save badge real
│   │   ├── Scorebar.tsx         # score strip (mock, sesión 8)
│   │   ├── EssayList.tsx        # vista de lista de ensayos
│   │   ├── editor/
│   │   │   ├── EditorPane.tsx   # TipTap real + slash commands wiring
│   │   │   ├── TitleInput.tsx   # contentEditable single-line para el título
│   │   │   ├── SlashMenu.tsx    # menú flotante del slash command
│   │   │   └── extensions/
│   │   │       └── SlashCommand.ts  # extensión TipTap + items (h1/h2/quote/...)
│   │   ├── canvas/              # tldraw integrado
│   │   │   ├── BoardPane.tsx        # wrapper Tldraw + state + persistencia
│   │   │   ├── BoardToolbar.tsx     # toolbar lateral + zoom
│   │   │   ├── NoteContextPanel.tsx # panel autor/kind cuando un note está seleccionado
│   │   │   └── note-shape.tsx       # PergaminoNoteShapeUtil (override del NoteShapeUtil default)
│   │   ├── lectura/                 # overlay del Interrogatorio del Empirista
│   │   │   └── LecturaOverlay.tsx
│   │   ├── council/
│   │   │   └── CouncilAvatars.tsx
│   │   └── ui/                  # primitivos compartidos
│   │       ├── Avatar.tsx
│   │       ├── Badge.tsx
│   │       ├── Button.tsx
│   │       ├── IconButton.tsx
│   │       └── icons.tsx
│   └── lib/
│       ├── store.ts             # Zustand: view, current essay, saveStatus, overlay, autosave
│       ├── storage/
│       │   ├── index.ts         # invoke() wrappers de los comandos Rust
│       │   └── types.ts         # Essay / EssayMeta / EssayMode / Sage / Interrogatorio
│       └── agents/              # interrogate() + parsePreguntas + sage:// events
├── src-tauri/                   # lado Rust de Tauri
│   ├── src/
│   │   ├── main.rs
│   │   ├── lib.rs               # registra storage + sidecar handlers
│   │   ├── storage.rs           # essay_list/read/write/delete
│   │   └── sidecar.rs           # spawn() del sidecar + sage_interrogate/sage_ping
│   ├── capabilities/            # permisos Tauri 2
│   ├── icons/
│   └── tauri.conf.json
├── sidecar/                     # Node + Claude Agent SDK (sabios)
│   ├── src/sage.ts              # JSON-Lines stdin/stdout protocol
│   ├── dist/sage.js             # compilado (gitignored)
│   └── package.json
├── next.config.ts               # output:export, turbopack root pin
├── postcss.config.mjs           # @tailwindcss/postcss
└── package.json
```

Las carpetas `src/lib/{agents,claude,storage}` contienen un `index.ts` stub para que existan en el árbol; se llenarán en sesiones futuras.

## Convenciones — no negociables

- **TS strict, prohibido `any`.**
- **Sin librerías de componentes externas** (shadcn/ui, Radix templates). Construyo primitivos desde cero para preservar la identidad visual paper-tone.
- **Anthropic API key SOLO desde env (`ANTHROPIC_API_KEY`).** Jamás hardcoded, jamás loggeada, jamás en el bundle del renderer. Las llamadas viajan por el lado Rust de Tauri o un route handler.
- **Conventional commits**: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `style:`.
- **Una feature por sesión.** Scope apretado.
- **Pregunta antes de instalar deps nuevas.**
- **No refactores preventivos.**
- **Cambios no triviales:** plan/diff antes de aplicar.
- **Tradeoffs reales:** explícalos y deja decidir a Noé.

## Comandos

```bash
npm run dev              # Next.js dev server (localhost:3000)
npm run build            # build estático → ./out
npm run lint             # ESLint
npm run test:e2e         # Playwright E2E (keyboard shortcuts, autosave, sage)
npm run test:e2e:ui      # mismo, con la UI interactiva
npm run sidecar:build    # compila el sidecar Node (./sidecar/dist/sage.js)
npm run tauri:dev        # arranca Next dev + ventana Tauri + sidecar
npm run tauri:build      # build Tauri (.app / .dmg / .msi según OS)
```

**Antes de correr `npm run tauri:dev`:** asegúrate de haber corrido `npm run sidecar:build` al menos una vez. El Rust backend busca `sidecar/dist/sage.js` al startup; si no existe, los sabios no funcionan (pero el editor + tablero siguen).

**Antes de tocar atajos / handlers de teclado:** correr `npm run test:e2e`. Ya nos mordió dos veces (el `N` que disparaba dos notes; el `select` tool que cancelaba edit-in-place). El suite en `tests/e2e/` cubre el flow real con un `__TAURI_INTERNALS__` stub que mantiene los essays en memoria.

La primera vez que corre `npm run tauri:dev` el lado Rust descarga y compila ~140 crates — puede tardar 5-10 minutos. Siguientes corridas son segundos.

## Decisiones del bootstrap (sesión 1)

| Decisión | Por qué |
|---|---|
| Next.js 16 (no 15) | El CLI instaló 16.2.6 — última estable. Greenfield, no había que migrar. |
| Tailwind 4 | Tokens viven en CSS via `@theme`, más limpio para una paleta custom como la de Pergamino. |
| `output: "export"` en next.config | Tauri carga assets estáticos en producción; en dev usa el server next. |
| `turbopack.root` fijado | Hay un `~/package-lock.json` huérfano que confunde a Turbopack. |
| Window 1440×900, min 1200×760 | El diseño está mockeado a 1440 viewport. |
| Newsreader (no Crimson Pro) | Es el serif que el diseño usa explícitamente. |
| Sin shadcn/ui ni similar | Identidad visual custom; primitivos propios. |

## Qué quedó hecho en sesión 1

- Bootstrap Tauri 2 + Next.js 16 + Tailwind 4 + TS strict.
- Configuración: identifier `com.noeosorio.essaystudio`, ventana 1440×900, scripts `tauri`/`tauri:dev`/`tauri:build`.
- Design tokens completos en `globals.css` (paleta Pergamino, sabios, tipografía).
- Vista de escritura completa con mock data: topbar, editor pane (con anotaciones inline + marginalia + slash hint), board pane (con 5 columnas, post-its con tape, toast, conexión SVG, toolbar tldraw-style), score strip (anillo total + 6 medidores circulares).
- Carpetas stub para sesiones futuras (editor real, canvas real, council, agents, storage, claude, prompts).
- ESLint + TS strict pasando en build.

## Qué quedó hecho en sesión 2

- **Editor real con TipTap 3** sobre `EditorPane` — StarterKit (bold/italic/headings/listas/blockquote/code/hr) + Placeholder + CharacterCount.
- **Slash commands custom** (`/h1`, `/h2`, `/h3`, `/quote`, `/lista`, `/numerada`, `/code`, `/separador`) renderizados con un menú flotante propio (sin Tippy.js).
- **Estilos prose** en `.tiptap-content` que heredan la tipografía Pergamino (Newsreader serif para body, escala h1/h2/h3 ajustada).
- **Persistencia local** vía comandos Rust de Tauri en `src-tauri/src/storage.rs`:
  - `essay_list` / `essay_read` / `essay_write` / `essay_delete`
  - JSON files en `$APPDATA/essays/<id>.json`, escritos atómicamente (tmp → rename).
  - El renderer no tiene fs raw; toda I/O pasa por el Rust.
- **Modelo de datos del ensayo:** `{ id, title, content (TipTap JSON), mode, wordCount, createdAt, updatedAt }`.
- **Zustand store** (`src/lib/store.ts`) con `view: 'list' | 'editor'`, `current: Essay | null`, `saveStatus`, autosave debounceado a 800ms, flush forzado al cerrar ensayo / unload.
- **Vista de lista de ensayos** con cards (modo, palabras, edit hace X, hover-to-delete) y empty state.
- **Routing SPA puro** — `/` decide list vs editor según el store. `output: "export"` sigue intacto, sin rutas dinámicas.
- **Topbar reactivo:** save badge real (idle/dirty/saving/saved/error con retry), mode toggle escribe al ensayo abierto, click en breadcrumb cierra y vuelve a la lista. Botones de Mesa redonda / Pluma roja / Benchmark quedan disabled hasta sus sesiones.

## Decisiones de la sesión 2

| Decisión | Por qué |
|---|---|
| **Comandos Rust custom** en vez de `tauri-plugin-fs` | Renderer no recibe acceso fs raw. Lógica de path/serialización encapsulada en un solo lugar. ~150 líneas de Rust, mantenibles. |
| **JSON nativo de TipTap** para `content` | Fiel al editor; no perdemos features que Markdown no representa. Markdown queda para export futuro. |
| **Atomic write** (tmp + rename) | Si la app crashea mid-write, el archivo previo queda intacto. |
| **Routing SPA** sobre `output: "export"` | Las rutas dinámicas `/essays/[id]` no juegan con static export sin `generateStaticParams`. SPA con state Zustand evita la pelea. |
| **TitleInput controlled-at-init** | Evita warnings de React 19 (`set-state-in-effect`). El padre remonta con `key={essayId}` al cambiar de ensayo. |
| **SlashMenu sin Tippy.js** | Una dep menos. Posicionamiento manual via `clientRect` + position:fixed. |
| **Autosave 800ms** | Suficiente para sentirse "real-time" sin escribir cada keystroke. |
| **Mode toggle dispara flush inmediato** | Cambio de modo es deliberado, no se debounce. |

## Qué quedó hecho en sesión 3

- **tldraw v5** integrado en `BoardPane` reemplazando el mock visual.
- **Override del `NoteShapeUtil`** default (`src/components/canvas/note-shape.tsx`) en lugar de un shape custom paralelo:
  - `class PergaminoNoteShapeUtil extends NoteShapeUtil` con `static type = "note"` heredado, lo que **reemplaza** el default cuando se pasa al prop `shapeUtils`.
  - Override de `component()` para el visual Pergamino (tape vintage, header con avatar circular del sabio + kind label + timestamp relativo) y de `getDefaultProps()` para usar `size: "s"`, `align: "start"`.
  - Override de `canEdit()` → `false`. La edición ocurre vía modal en sesión 3; reactivamos el editor inline cuando los sabios necesiten escribir directo.
  - **Metadata propia** en `shape.meta`: `{ author, kind, createdAt }`. 5 autores: `tu | em | sis | pra | cri`. 5 kinds: `concepto | pregunta | conexion | cita | critica`. El **color del post-it lo dicta el AUTOR** (sage tints), no el kind.
  - Notes pre-existentes (sin meta) se re-skinean con defaults `tu / concepto`, sin timestamp — funciona como **migración automática** de cualquier sticky default que el usuario ya hubiera creado antes de este override.
  - Texto plano se extrae de `shape.props.richText` (estructura TipTap-shaped) con un walker recursivo. Sin formato rico por ahora, suficiente para el flujo del modal.
- **Flow de creación 100% nativo:** `N` activa el note tool de tldraw, click en el canvas crea un note y entra en edit mode automáticamente. El usuario escribe inline (rich text via TipTap interno de tldraw). Sin modales propios; sin handlers paralelos. `BoardToolbar.tsx` solo enruta sus botones a `editor.setCurrentTool("note" | "arrow" | "select")`.
- **`NoteContextPanel`** flotante (esquina superior derecha del board) que aparece cuando hay un single note seleccionado. Pills de autor (TÚ/EM/SI/PR/CR) y tipo (concepto/pregunta/conexion/cita/critica). Click → `editor.updateShape({ id, meta })`. Stamp `createdAt` la primera vez que el usuario asigna author/kind. **Importante:** el panel vive **fuera** del componente `<Tldraw>`; recibe el editor por prop. Si se pone dentro vía `components.InFrontOfTheCanvas`, el `tl-background` de tldraw intercepta los clicks.
- **Counter en header** ("X notas · Y conexiones") calculado en vivo desde `editor.getCurrentPageShapes()` y refrescado en cada cambio de store.
- **Persistencia en el JSON del ensayo:** el snapshot completo de tldraw (`getSnapshot(editor.store)`) vive en `essay.board`. Se hidrata via `loadSnapshot(editor.store, snap)` exactamente una vez en `onMount`. Cuando cambias de ensayo, `BoardPane` se remonta vía `key={essayId}`. Listener con `{ source: "user", scope: "document" }` evita auto-save loops.
- **Rust:** campo `Option<serde_json::Value>` añadido al `Essay` struct con `skip_serializing_if = "Option::is_none"` (ensayos viejos sin tablero siguen leyendo). 8/8 tests verdes incluyendo `round_trip_preserves_optional_board_snapshot`.
- **CSS overrides:** tldraw default background hidden, su grid hidden (uso mi `.board-grid` con dotted radial), watermark hidden, selection outline tintado a `seal`.
- **`next/dynamic` con `ssr: false`** para el `<Tldraw>` component — tldraw usa DOM APIs y no rinde en SSR.

## Decisiones de la sesión 3

| Decisión | Por qué |
|---|---|
| **tldraw v5** (no v3 que sugería el plan) | Última estable; mi nueva regla por defecto. |
| **Override del `NoteShapeUtil` default** (no shape custom paralelo) | El primer intento fue un shape `postit` separado. Falló: la tecla `N` también activaba el note tool de tldraw, dejando sticky notes amarillos planos. La solución correcta fue extender el default y **reemplazarlo** vía `shapeUtils`. Reusa drag, resize, edit-mode plumbing. Notes pre-existentes se re-skinean automáticamente. (Lección: cuando una lib ya implementa el behavior, override la pieza visual + extender meta sobre crear un sistema paralelo.) |
| **Sin modal — flow 100% nativo + panel contextual** | El segundo intento tenía un modal propio para crear (autor/tipo/texto). Mezclaba con el flow nativo de tldraw que también escuchaba `N`. La solución: confiar 100% en tldraw nativo (N → click → escribir inline) y mover autor/kind a un **panel contextual** que aparece al seleccionar un note. Una sola fuente de verdad para cada interacción. |
| **`NoteContextPanel` fuera del `<Tldraw>`** | Tldraw renderea un `tl-background` que captura pointer events sobre el canvas, incluso cuando un componente está en `InFrontOfTheCanvas`. El panel debe estar fuera del wrapper de tldraw, recibiendo el `editor` por prop. |
| **Meta sobre props para `author/kind/createdAt`** | El note tiene su propio schema (richText, color, font, etc.). En lugar de pelear con migrations de schema, los datos del consejo viven en el campo `meta` que es libre `JsonObject`. |
| **Snapshot completo en `essay.board`** | Más simple que duplicar shapes en mi modelo. tldraw maneja undo, deltas, selección, etc. |
| **Color por autor (no por tipo)** | El plan original mezclaba ambos; el diseño Pergamino claramente codifica voz por color. Tipo queda como tag textual (CONEXIÓN, CONCEPTO…). |
| **Hide tldraw default chrome** completo | Para preservar identidad paper-tone. Reimplementé toolbar/zoom nuestros, dejé las gestures + accesibilidad de tldraw. |
| **`next/dynamic` para `<Tldraw>`** | Más limpio que `useEffect+setMounted` (lint set-state-in-effect en React 19). |
| **Modal con mount-on-open** | Mismo motivo: evita el reset-on-open en `useEffect`. |

## Qué quedó hecho en sesión 4

- **Sidecar Node con `@anthropic-ai/claude-agent-sdk`** en `./sidecar/`:
  - `sidecar/src/sage.ts` lee JSON Lines de stdin, ejecuta `query()` del Agent SDK, emite eventos JSON Lines a stdout (`started`, `token`, `complete`, `error`).
  - `systemPrompt` = contenido literal de `prompts/<sage>.md` (reemplaza completamente el Claude Code default).
  - `allowedTools: []` + `settingSources: []` + `maxTurns: 1` para forzar generación pura de texto sin Read/Bash/etc. ni inherit de CLAUDE.md del usuario.
  - `includePartialMessages: true` para recibir `stream_event` y emitir tokens en vivo.
- **Auth por OAuth de Claude Code** — el SDK reusa las credentials del Claude Code instalado en la máquina (macOS Keychain en 2.1.x). Las llamadas cuentan contra el **Agent SDK monthly credit** del plan Max, no contra un API key separado. No hay `ANTHROPIC_API_KEY` en el proyecto.
- **Rust (`src-tauri/src/sidecar.rs`):**
  - `spawn()` lanza `node sidecar/dist/sage.js` con `tokio::process::Command`, captura stdin/stdout/stderr, busca el script via walk-up desde cwd o via `SAGE_SIDECAR_PATH` env.
  - Background task lee cada línea de stdout, la parsea como JSON y la emite al frontend via `app.emit("sage://event", payload)`.
  - Stderr → log via `log::info`. Child se reapea automáticamente.
  - Commands `sage_interrogate(id, sage, text)` y `sage_ping(id)` escriben a la stdin del sidecar via un `Mutex<Option<ChildStdin>>` compartido por State.
- **Frontend (`src/lib/agents/index.ts`):**
  - `interrogate({ sage, text, onUpdate })` genera un UUID, suscribe a `sage://event` filtrando por id, e invoca `sage_interrogate`. Resuelve con `{ result, costUsd }` cuando llega `complete`.
  - `parsePreguntas(raw)` parsea las líneas numeradas `1. … 5. …` a `string[]`.
- **Vista `LecturaOverlay`** (`src/components/lectura/`): modal full-screen con textarea + streaming output a la derecha + parser de preguntas al `complete` + botón "Guardar al ensayo". Disparada desde un nuevo botón **Interrogar** en el topbar del editor (color EM ámbar).
- **Modelo del ensayo** extendido con `interrogatorios?: Interrogatorio[]` (TS) y `Option<serde_json::Value>` (Rust, opaco). Store gana `addInterrogatorio()` y `setOverlay()`.
- **`prompts/el-empirista.md`** con un placeholder funcional documentando reglas de voz, formato de las cinco preguntas, y TODO para que Noé lo afine.
- **E2E (`tests/e2e/sage.spec.ts`)**: el sidecar está **stubbed** en `setup.ts` con un fake `sage_interrogate` que emite 5 preguntas canónicas via el event protocol mockeado (incluye `plugin:event|listen`/`unlisten`). No se queman créditos en CI. 19/19 verde.

## Decisiones de la sesión 4

| Decisión | Por qué |
|---|---|
| **Sidecar Node** (no llamada HTTP directa desde Rust) | El SDK requiere Node y trae el binario de Claude Code empaquetado. Hace todo el OAuth/auth/streaming/caching internamente. |
| **JSON Lines sobre stdin/stdout** | Streaming token-por-token sin abrir puertos; supervisión de child trivial. |
| **`systemPrompt: string` custom** (no preset) | El Empirista no es Claude Code — necesita su persona, no la del coding assistant. `settingSources: []` evita que el CLAUDE.md del proyecto se filtre. |
| **Auth via Claude Code OAuth** | Reusa las credentials de tu Max plan en Keychain → consumo cae en el **Agent SDK monthly credit**, no en API billing. Tope monetario predecible. |
| **`maxTurns: 1` + `disallowedTools` agresivo** | El Empirista solo genera texto; bloquear Read/Bash/etc. evita que el modelo intente "agentear" por error. |
| **Tests con sidecar stubbed** | Cada test E2E ejecutándose contra Anthropic real costaría ~1¢ + sería flaky. El stub mantiene el flow renderer↔Tauri↔eventos intacto. |

## Qué quedó hecho en sesión 5a (parcial)

- **Las cuatro personas instaladas** en `prompts/`: `el-empirista.md`, `el-sistemico.md`, `el-practico.md`, `el-critico.md`. Cada una con su voz afinada, frases que usa / nunca usa, héroes, modos por fase, y reglas de cuándo declinar.
- **Selector de sabio en el overlay** (`LecturaOverlay`): fila de 4 avatares en el header; el activo tiene ring. Click cambia el sabio mid-flujo (resetea el stream si ya había uno previo). Disabled mientras el sabio actual está pensando.
- **Avatares del topbar = shortcuts**: `CouncilAvatars` ahora envuelve cada Avatar en un `<button>` que llama `openLectura(sage)`. El cursor scale-hovers, el title es "Interrogar como X". Solo activos en view editor (en la lista quedan decorativos).
- **Store:** `lecturaSage: Sage` (default "em"), `openLectura(sage?)`, `setLecturaSage(sage)`.
- **Stub E2E** retorna preguntas distintas por cada sabio (em / sis / pra / cri), así los tests pueden asertar autoría sin depender del modelo real.
- **E2E** ampliado a 23/23 — cubre: click en avatar abre lectura con su sabio activo, switch dentro del modal cambia header, save persiste con el sabio correcto.

## Sesión 5b — Interrogación coral + checkboxes

Decisión de producto (Noé, 2026-05-16): **los sabios no se hablan entre ellos**. El valor está en que te cuestionen *a ti*, no en que debatan. Mesa Redonda (el diseño original donde los 4 dialogaban) queda **descartada** del roadmap. En su lugar:

- **Modo "consejo"**: el botón `Interrogar` del topbar dispara la interrogación de los 4 sabios **en paralelo** sobre la misma fuente. Cada uno genera sus 5 preguntas en su propio panel (grid 2×2 dentro del overlay).
- **Modo "un sabio"**: click en un avatar (topbar o bubble menu de selección) abre el overlay con ese sabio activo, comportamiento que ya existía.
- **Toggle de modo** dentro del overlay: pasas de "consejo" a "un sabio" sin cerrar.
- **Checkboxes por pregunta** (default ✓): solo las marcadas se persisten en `essay.interrogatorios[]` Y se materializan como post-its. Lo que desmarcas desaparece — sin papelera.
- **Layout del tablero**: 1 sabio → cascada (≤3 × n), 2+ sabios → **una columna vertical por sabio**, anclada a la derecha del contenido existente para que múltiples interrogaciones no se piesen.
- **Fuente por archivo**: nuevo botón "Subir .txt / .md" que carga el contenido al textarea. `.pdf`/`.docx` muestran un toast "próximamente · copia-pega por ahora".

Implementación:

- Store: `lecturaMode: "single" | "council"` (default `council`). `openLectura(sage?, prefill?, mode?)`: cuando se pasa `sage` cambia a `single`; sin sage → `council`.
- `LecturaOverlay` refactor completo: 4 paneles de streaming en paralelo, cada uno con su phase/raw/checked/cost; footer único con "Guardar seleccionadas" + resumen "X de Y preguntas seleccionadas".
- `materializePreguntas(editor, batches)` ahora acepta un array de batches. 1 batch → cascada, n batches → columnas. La X de inicio busca el `maxX` de las shapes existentes para encadenar interrogaciones sin pisarse.
- E2E ampliado a **29/29**: council (20 notes), checkboxes (3 de 5 quedan), file upload, modes/tabs.

## Qué quedó hecho en sesión 6 — Pluma Roja

- **Tres pasadas en paralelo** sobre el ensayo completo, una por sabio:
  - **Coherencia** → SI (loops, niveles, atribuciones individuales vs sistémicas)
  - **Estilo** → EM en `modo: academico`, PR en `modo: blog` (registro, voz, precisión)
  - **Argumento** → CR (steelman, supuestos, retórica)
- **Protocolo `critique`** nuevo en el sidecar (`sidecar/src/sage.ts`): user prompt pide JSON-lines estrictos `{cita, severidad, mensaje, sugerencia?}`. Persona del sabio queda intacta como system prompt; el formato es task-specific en el user prompt. Sentinel `{"vacio":true}` cuando un sabio no encuentra nada en su dominio.
- **Rust:** `sage_critique` añadido junto a `sage_interrogate` — mismo bridge stdin/stdout-events `sage://event` para streaming token a token.
- **Frontend:**
  - `critique({sage, pase, text})` en `src/lib/agents/index.ts`; comparte la maquinaria de listen/invoke con `interrogate` vía `runSidecarCommand`.
  - `parseAnotaciones(raw)` tolera fences markdown y JSON parcial.
  - `buildAnotacion(raw, sage, pase, generadoEn)` añade `id` (uuid) + metadata.
  - **Annotation mark de TipTap** (`src/components/editor/extensions/Annotation.ts`): `Mark.create` con attrs `{id, sage, pase, severidad, mensaje, sugerencia}`. Render: `<span class="anno anno-{em|sis|pra|cri}" data-by="XX" data-anno-id="..." data-*="...">`. Comandos: `setAnnotation`, `removeAnnotationById`, `clearAllAnnotations`.
  - **`findCitaRange(editor, cita, skip)`** en `src/lib/editor/findCita.ts`: aplana el doc a texto normalizado (whitespace colapsado) con un mapa paralelo a posiciones PM, indexOf, traduce de vuelta. Soporta `skip` para que dos anotaciones con la misma cita resuelvan a ocurrencias distintas.
  - **`PlumaRojaOverlay`** modal (`src/components/lectura/PlumaRojaOverlay.tsx`): 3 paneles 1:1:1 con streaming + per-anotación cards (severidad dot, cita en italics + border-left, mensaje, sugerencia opcional, checkbox).
  - **`AnnotationPopover`** flotante (`src/components/editor/AnnotationPopover.tsx`): click en `.anno` lo abre con sage/pase/severidad/mensaje/sugerencia + botón "Descartar" (`removeAnnotationById`). Cierra en mousedown fuera o scroll.
- **Store:** `Overlay = "lectura" | "pluma" | null`. Acción `openPlumaRoja()`.
- **Topbar:** flag `FEATURES.plumaRoja = true`. Botón `seal` rojo con `data-testid="topbar-pluma-roja"`.
- **E2E:** stub `sage_critique` deriva 3 citas distintas del texto real por pase para que 3×3 anotaciones siempre resuelvan a 9 ranges. `tests/e2e/pluma-roja.spec.ts` cubre: overlay abre con 3 paneles, 9 anotaciones tras run, apply produce 9 `.anno` inline, click anno abre popover + descartar elimina la mark, uncheck excluye del apply. **34/34 verde** (5 nuevos + 29 previos).

## Decisiones de la sesión 6

| Decisión | Por qué |
|---|---|
| **JSON-lines como formato del modelo** (no markdown estructurado) | Parser robusto, tolera ruido, una línea = una anotación. El modelo no tiene que pelear con escapes complejos. |
| **Cita literal en vez de offsets PM** | El modelo no tiene forma confiable de calcular offsets de ProseMirror. Que copie un fragmento literal es ergonómico y verificable; el frontend resuelve la posición. |
| **`findCitaRange` con whitespace normalizado** | El modelo puede insertar espacios extras o NBSPs; colapsar a un solo espacio en ambos lados hace match con tolerancia sin perder el mapa de posiciones. |
| **Marks de TipTap en vez de `essay.anotaciones[]`** | Las marks viajan con el doc — abrir el ensayo re-renderiza las anotaciones for free. Un campo paralelo se desincroniza. |
| **Estilo = EM/PR según `mode`** | Académico necesita rigor + evidencia (EM); blog necesita claridad + aplicabilidad (PR). El registro de la pasada cambia con el del ensayo. |
| **Apply event en window, no en el store** | El overlay no necesita conocer al editor; dispatch + listen mantiene el editor desacoplado del flujo del modal. Mismo patrón que `sage:materialize-preguntas`. |
| **Sin "aplicar sugerencia" automático en v1** | Reescribir el texto del usuario es destructivo y necesita preview. v1 muestra la sugerencia en el popover; en una sesión futura agregamos el botón con diff visible antes de aplicar. |
| **Sin margin notes en v1** | Layout no trivial (necesita columna paralela al editor con anclaje por línea). Empezamos con popover-on-click — más simple, no compite por espacio. |

## Qué quedó hecho en sesión 7 — Rúbrica + APA

Decisión de producto (Noé, 2026-05-18): Benchmark se posterga; antes hay que dejar que el usuario defina los **criterios reales** de evaluación (los que pide el profesor) en lugar de inventar dimensiones genéricas. La rúbrica del ensayo se vuelve el modelo de datos compartido entre Pluma Roja y el Benchmark futuro.

- **Modelo:** `Criterio { id, nombre, peso (1-5), descripcion }`, `Rubrica { criterios[] }`, opcional en `Essay`. `Pase` extendido con `"apa"`. `Anotacion` gana `criterioId?`. Round-trip Rust test añadido (`round_trip_preserves_optional_rubrica`).
- **`RubricaOverlay`** (`src/components/lectura/RubricaOverlay.tsx`) — modal CRUD: add/edit/delete inline, peso por select 1-5, sin draft local (cada keystroke commitea al store que debounce 800ms). Flush forzado al cerrar el modal para no perder edits.
- **Store:** `Overlay = "lectura" | "pluma" | "rubrica" | null`. `openRubrica()` + `updateRubrica(rubrica)` con autosave debounceado (mismo patrón que `updateContent`).
- **Topbar:** botón `Rúbrica` con `data-testid="topbar-rubrica"` + contador `· N` cuando hay criterios.
- **Inyección en Pluma Roja:** `critique({sage, pase, text, rubrica})` reenvía la rúbrica vía Tauri → sidecar. El sidecar formatea la rúbrica como bloque legible en el user prompt y le pide al sabio que adjunte `"criterioId"` cuando una anotación se alinee con un criterio. `buildAnotacion()` valida que el id devuelto exista en la rúbrica (descarta ids fantasma).
- **Pasada APA:** cuarta pasada propietaria de la Empirista, sólo en `mode=academico`. Toggle "Revisar APA" en el header del modal (default ON en académico). Prompt instruye a revisar exclusivamente formato APA 7: paréntesis, coma, página en citas textuales, "et al." con 3+ autores, `&` dentro del paréntesis. El grid de paneles es ahora dinámico (`gridTemplateColumns: repeat(N, 1fr)`) — 3 columnas con APA off, 4 con APA on.
- **Chips de criterio:** cada anotación con `criterioId` muestra un chip "criterio · {nombre}" en el card de Pluma Roja y en el popover inline del editor (con `title={descripcion}` para el tooltip largo).
- **E2E:** stub `sage_critique` captura cada invocación en `window.__E2E_LAST_CRITIQUE__` (sage, pase, rubrica) para que los tests puedan asertar forwarding. Si llega rúbrica, el stub pone `criterioId` al primer item de cada pase. Slots de citas reorganizados para acomodar 4 pasadas sin solaparse. Nuevo `dumpCritiques(page)` helper. Spec `rubrica.spec.ts` (7 tests) cubre: CRUD, persistencia, count badge, APA visible en académico / oculto en blog / toggleable, rúbrica forwarded a cada pase, chip en card y popover. Spec `pluma-roja.spec.ts` ajustado para desactivar APA en los tests que esperaban 3 pasadas. **41/41 verde** + **9/9 Rust** (incluye round-trip rúbrica).

## Decisiones de la sesión 7

| Decisión | Por qué |
|---|---|
| **Rúbrica antes que Benchmark** | Los criterios reales del profesor deben definir las dimensiones del Benchmark; construir Benchmark con dimensiones fijas y refittear después era trabajo desperdiciado. La rúbrica también informa Pluma Roja de inmediato — doble valor del mismo modelo. |
| **Peso 1-5 (no %)** | Más simple de capturar para Noé y para el Benchmark futuro (suma de pesos como denominador implícito). Si hace falta %, lo derivamos. |
| **Sin draft local en el modal** | React 19 lint prohíbe `setState` sincrónico en `useEffect`. Con debounce en el store + flush-on-close el draft es redundante. Cada keystroke commitea al store; el modal lee siempre del current essay. |
| **APA como pasada separada, no enriquecer Estilo** | Outputs distintos: estilo juzga voz/registro, APA juzga formato técnico. Mezclarlos diluye ambos. Pasada separada permite además toggle (no siempre quieres correr APA en cada revisión). |
| **APA dueña: Empirista** | "Calidad de la evidencia" incluye que las fuentes estén bien citadas. Persona ya tiene la disposición correcta (rigor, formalismo). Práctico no tiene foco en formato; Crítico no es su dominio. |
| **`criterioId` validado en frontend** | El modelo puede inventar ids. `buildAnotacion` descarta cualquier `criterioId` que no esté en la rúbrica real del ensayo. Defensa en profundidad. |
| **Cita literal en JSON-lines, sin offsets PM** (sigue) | Mismo patrón que sesión 6. El stub deriva 3 citas distintas por pase (12 totales con APA) para que no se pisen. |
| **Grid dinámico en el modal** | `repeat(N, 1fr)` se acomoda solo cuando APA on/off cambia el conteo de panes. Layout estable. |

## Qué quedó hecho en sesión 7.5 — Fuentes + 3 preguntas

Decisión de producto (Noé, 2026-05-18): cinco preguntas saturan; tres bien escogidas pegan más fuerte. Y el usuario no debería re-subir las fuentes cada vez que quiere interrogar — la biblioteca vive con el ensayo.

- **5 → 3 preguntas por sabio.** Persona MDs actualizadas con "tres preguntas *poderosas*", sidecar prompt pide "tres preguntas poderosas". Stub E2E recortado a 3 por sabio; tests ajustados (consejo: 4×3 = 12 notes, antes 20).
- **`Fuente { id, nombre, cita?, contenido, origen, archivoNombre?, agregadoEn }`** y `essay.fuentes?: Fuente[]`. Round-trip Rust test añadido (`round_trip_preserves_optional_fuentes`).
- **`FuentesOverlay`** (`src/components/lectura/FuentesOverlay.tsx`) — modal CRUD: nombre, cita APA opcional, contenido, peso visual del archivo vs manual, contador "X palabras". Botones "+ Subir .txt / .md" y "+ Añadir manual". Sin draft local (commit por keystroke + debounce 800ms + flush-on-close).
- **Store:** `Overlay += "fuentes"`. Acciones `openFuentes`, `addFuente`, `updateFuente`, `removeFuente`. Las tres primeras usan el autosave debounceado; `removeFuente` flush directo. Cuando no quedan fuentes el campo se borra del JSON (null cleanup).
- **Topbar:** botón `Fuentes` con `data-testid="topbar-fuentes"` + badge `· N`.
- **Lectura ↔ biblioteca:**
  - Chip-row arriba del textarea con cada fuente guardada; click → carga su `contenido` al textarea y resalta el chip. Tooltip muestra la cita APA si existe. Editar el textarea desactiva el highlight (la fuente activa "se ensucia").
  - El upload de archivo `.txt`/`.md` ahora también **guarda en la biblioteca** además de cargar al textarea — no más re-subir. La fuente subida queda con `origen: "archivo"` y `archivoNombre` original.
- **Pluma Roja ↔ biblioteca:**
  - `critique({sage, pase, text, rubrica, fuentes})` agregado fuentes al payload Tauri → Rust → sidecar (todo opcional, omitido si vacío).
  - Sidecar formatea las fuentes como bloque `FUENTES DEL AUTOR:` en el user prompt, con instrucción explícita de leerlas como contexto y, en pasada APA, cruzar las citas formales con las referencias del borrador.
  - Header del modal muestra un chip `Fuentes · N` cuando hay fuentes (al lado del chip de rúbrica).
- **E2E:** stub `sage_critique` ahora captura también el payload de fuentes en `__E2E_LAST_CRITIQUE__`. `dumpCritiques()` lo retorna. Spec `fuentes.spec.ts` (7 tests) cubre: CRUD + persistencia + count badge, upload en Fuentes y en Lectura (ambos salvan en biblioteca), chip picker en Lectura, forwarding a las 4 pasadas de Pluma Roja, y la reducción 5→3 en interrogatorio. Spec sage ajustado (1 test: cambio de placeholder al subir → usa selector más estable). **48/48 verde** + **10/10 Rust**.

## Decisiones de la sesión 7.5

| Decisión | Por qué |
|---|---|
| **Biblioteca per-ensayo (no global)** | El 90% de las fuentes son específicas a un trabajo. Una biblioteca global cross-essays cambia el flow (autoría, búsqueda, dedup). Si Noé pide cross-essays, lo armamos como capa opcional encima — pero por ahora una sola fuente de verdad: el JSON del ensayo. |
| **Upload en Lectura también guarda** | Era la queja directa: subir cada vez es fricción. Mismo gesto, doble valor: carga al textarea + persiste en biblioteca. La fuente queda disponible para próximas interrogaciones y para Pluma Roja. |
| **Cita APA como campo separado** | Permite que la pasada APA pueda cruzar referencias del texto con la cita formal de cada fuente. También es legible en el chip-tooltip. |
| **`.txt`/`.md` por ahora; PDF/Word deferred** | Parsear PDFs en cliente requiere otra dep o un parser propio. Hasta que el flujo se sienta sólido, mejor TXT/MD y un toast para los otros formatos. |
| **Fuentes auto-inyectadas en Pluma Roja (no opt-in)** | El usuario ya las guardó deliberadamente; tener un toggle para incluirlas-o-no metería un paso extra cada vez. Si crece el prompt al punto de doler, agregamos un selector ahí (no aquí). |
| **Tres preguntas por sabio** | Cinco saturan; las dos últimas casi siempre son variaciones. Forzar a elegir las tres *poderosas* sube la calidad. Aplica a todas las personas en el `Interrogatorio inicial`; otras fases no cambian. |
| **Sidecar formatea las fuentes (no el frontend)** | El frontend pasa fuentes como array; el sidecar conoce el shape del prompt. Mantiene la separación: el cliente envía datos, el sidecar arma el system+user message. |

## Qué quedó hecho en sesión 8 — Selector de sabios/pasadas por modo

Decisión de producto (Noé, 2026-05-19): no todos los sabios aportan lo mismo en un ensayo académico vs un post de blog, y el usuario debe poder skipear voces para ahorrar tokens. Además: cinco sabios siempre era saturación; con selectores aplicas la voz justa.

- **Helper `src/lib/sages.ts`** centraliza los defaults:
  - `defaultSagesForMode("academico")` → `["em","sis","cri"]` (EM aporta evidencia/método; SI estructura; CR steelman; PR queda fuera porque la pregunta práctica suele sacar al académico del marco).
  - `defaultSagesForMode("blog")` → `["sis","pra","cri"]` (PR es central — el blog vive de aplicabilidad; EM puede ser pedante).
  - `defaultPasesForMode("academico")` → 4 pasadas (incluye APA).
  - `defaultPasesForMode("blog")` → 3 pasadas (APA n/a).
  - Exporta `ALL_SAGES` y `ALL_PASES` como source of truth para iterar en UI.
- **Lectura — selector de sabios en modo consejo:**
  - `LecturaInner` recibe `essayMode` y arranca con `selectedSages = defaultSagesForMode(mode)`.
  - El header en consejo ahora muestra **4 avatares como checkboxes** (`role="checkbox"`, `aria-checked`, `data-active`). Activos con ring; inactivos con `grayscale + opacity-35`.
  - El botón "Interrogar" se deshabilita cuando `selectedSages.length === 0`.
  - Subtitle dinámico: `${N} ${N===1?"voz":"voces"} sobre el mismo texto`.
  - Grid del panel derecho se acomoda al conteo: 1 col, 2 cols, 3 cols, o 2×2 con 4. (Para 4 mantengo el 2×2 que ya conocía la UI; para 1-3 uso lineal.)
  - State vive solo en el modal (no persistido). Cada apertura reaplica los defaults.
- **Evaluar — selector de pasadas:**
  - Reemplacé el `apaOn: boolean` por `selectedPases: Pase[]` inicializado vía `defaultPasesForMode(mode)`.
  - **Quité el toggle APA del header.** En su lugar, una franja `PaseSelector` debajo del header con chips clickables (uno por pasada). Cada chip muestra el avatar del sabio responsable + nombre de la pasada. Activo: borde sólido + paper fill; inactivo: opacidad reducida.
  - `availablePases` filtra fuera APA en modo blog (la pasada no aplica conceptualmente).
  - Botón "Iniciar revisión" se deshabilita con `selectedPases.length === 0`; aparece un empty-state hint en el grid: "Selecciona al menos una pasada arriba para empezar."
  - El sabio gobernante de cada pasada **no es reasignable** (Coherencia=SI, Estilo=EM/PR según modo, Argumento=CR, APA=EM). Mantiene coherencia conceptual.
- **Tests actualizados:**
  - El test "council mode interrogates all four sages and materialises 12 notes" → "council mode (academico default) runs 3 sages and materialises 9 notes" (EM/SI/CR, sin PR).
  - 4 tests de `pluma-roja.spec.ts` que usaban `pluma-apa-toggle.uncheck()` → ahora `pluma-pase-toggle-apa.click()`.
  - Tres tests de `rubrica.spec.ts` para APA migrados al nuevo selector + assertion vía `data-active`.
  - Nuevo `selectors.spec.ts` (8 tests): defaults por modo en Lectura y Evaluar, toggle on/off, empty-state disable en ambos, "solo 2 pasadas" runs the selected. **56/56 verde** + **10/10 Rust** intactos.

## Decisiones de la sesión 8

| Decisión | Por qué |
|---|---|
| **Mapeo de defaults por modo** | El mapeo nació de leer cada persona en clave del registro de cada modo: EM rinde en académico, sufre en blog; PR es lo opuesto; SI y CR funcionan transversal. No es arbitrario — sigue la voz que cada sabio carga. |
| **Selector por pasada en Evaluar, por sabio en Lectura** | Lectura es interrogación de un texto: lo que importa es qué *voz* lo cuestiona. Evaluar es revisión por dimensiones (estructura, voz, argumento, formato): la unidad conceptual es la pasada, no el sabio. Cada flujo expone su unidad natural. |
| **No reasignable: el sabio de una pasada es fijo** | Argumento es voz del Crítico por diseño; meter PR ahí sería diluir la pasada. La rotación EM↔PR en Estilo es la única excepción justificada (registro académico vs blog) y ya existía. |
| **No persistir la selección por ensayo (de momento)** | Defaults sensatos por modo cubren el 90% de casos; persistir agregaría estado y complicaría la UX. Si Noé termina reconfigurando cada vez, lo persistimos en una sesión futura. |
| **Empty-state explícito + botón disabled** | Si dejas 0 sabios o 0 pasadas, no se silencia — el botón se deshabilita y el panel muestra un hint. Evita corridas accidentales sin sentido. |
| **State del modal, no del store** | El selector es parte de la "intención de esta corrida", no del documento. Convertirlo en state del store implicaría reset-on-close manual. State local es más simple. |
| **Indicadores visuales (`data-active`)** | Uso atributo `data-active` en los toggles. Es mejor que `aria-checked` para tests (más predecible que `.toBeChecked()` que requiere un `<input>` nativo) y queda compatible con CSS attribute selectors si después quiero estilarlos vía `[data-active="true"]`. |
| **Quitar `pluma-apa-toggle` (breaking de tests)** | Migré los 7 tests existentes al nuevo selector. La API anterior estaba diseñada para una sola opción (APA). El nuevo selector es la generalización natural. |

## Qué quedó hecho en sesión 9 — Benchmark derivado de las anotaciones

Decisión de producto (Noé, 2026-05-19): "el benchmark debe ser real y coherente — un 10/10 significa que no hay nada más que arreglarle." Eso descartó la arquitectura obvia (pedirle al modelo "puntúa 0-10") porque ese número es ruido — hoy te da 8, mañana 7, el 10/10 nunca se siente perfecto. La arquitectura que SÍ cumple el contrato:

**El score se deriva determinísticamente de las anotaciones que el consejo encontró en Evaluar. No se le pregunta al modelo.**

- 0 anotaciones contra un criterio → 10/10 (literalmente: el consejo no tiene nada que decirte).
- Cada anotación resta según severidad: `alta -2`, `media -1`, `baja -0.5` (calibración "suave", anima a iterar).
- Descartar una anotación en el editor / drilldown → el score sube automáticamente.
- Per-criterio: solo cuentan anotaciones con `criterioId` que matchea. Overall: promedio ponderado por `peso`, con un bucket "general" (peso=1) para las anotaciones huérfanas.
- Sin anotaciones (no has corrido Evaluar): overall = `null`, UI muestra "—" y CTA "Corre Evaluar para puntuar". No mentimos con un 10/10 prematuro.

Implementación:

- **`src/lib/benchmark/score.ts`** — módulo puro:
  - `extractAnotacionesFromContent(content)`: walker sobre el TipTap doc que pulla cada `annotation` mark + dedupe por id (las marks pueden repetirse en text-node splits).
  - `computeBenchmark(anotaciones, rubrica)`: agrupa por `criterioId`, score por criterio con `max(0, 10 − ΣpenaltyBySeveridad)`, overall = weighted avg por peso + bucket general (peso 1 si hay huérfanas).
  - Resultado con flags `hasRubrica` / `hasAnotaciones` para que la UI elija estado.
  - Sin React, sin store. Testeable directo.
- **`Scorebar.tsx`** — reemplazado el mock por el renderer real:
  - Overall ring + N rings per-criterio (uno por criterio en la rúbrica) + opcional ring "Sin criterio" cuando hay huérfanas.
  - Color del ring per-criterio tinta hacia el sabio dominante de sus anotaciones (EM ámbar, SI teal, PR coral, CR morado).
  - Tres estados manejados: sin anotaciones (— + CTA), con anotaciones sin rúbrica (overall + nudge "Define una rúbrica"), con ambos (rings completos).
  - CTA contextual a la derecha: "Evaluar" (si nunca corrió) / "Re-evaluar" (refrescar).
- **`BenchmarkDrilldown.tsx`** — panel que sube desde el Scorebar cuando clickeas un ring. Lista las anotaciones de ese criterio con sage chip, severidad dot, mensaje, sugerencia, botón Descartar.
  - Click en una card → `scrollIntoView` de la mark en el editor + flash CSS (`@keyframes anno-flash` con sombra seal pulsando 1.6s).
  - Descartar → dispatch `pluma-roja:dismiss` con el id → EditorPane escucha y ejecuta `removeAnnotationById` (mismo path TipTap que ya usa el popover inline). Doc = single source of truth, Scorebar recompute automático.
  - Cierra con × o Esc.
- **Feature flag `FEATURES.benchmark = true`.** El Scorebar ahora vive en `page.tsx` para ensayos en modo editor.
- **Tests:**
  - **`score.spec.ts` (9 tests puros)** — penalties calibradas, null cuando no hay datos, severidad escalonada, weighted overall, floor en 0, anotaciones sin criterioId solo cuentan en overall, walker dedupea splits.
  - **`benchmark.spec.ts` (6 E2E)** — empty state, sin rúbrica → nudge, rings reales tras Evaluar, click ring → drilldown, Descartar baja count + sube score, click en card aplica `.anno-flash`, dismiss-all vuelve a estado vacío. **71/71 verde** + **10/10 Rust**.

## Decisiones de la sesión 9

| Decisión | Por qué |
|---|---|
| **Score derivado de anotaciones, no pedido al modelo** | Es lo que hace que un 10/10 signifique algo. El número no flota — está atado a hallazgos visibles que puedes ver, dismissear o resolver. Pedir al modelo "puntúa esto" es introducir ruido sin acción. |
| **Penalty `alta -2 / media -1 / baja -0.5` (suave)** | Calibración tal que un ensayo con 2-3 problemas medios pueda llegar a 7-8 (anima a iterar). Una alta sola te deja en 8 — duele, pero no es brutal. Constants exportadas para que el día que cambien sean un solo touch. |
| **Anotaciones sin criterioId van solo al overall** | Per-criterio queda exclusivo de hallazgos atados a ese criterio. Distribuirlos sería inventarse de dónde vienen. La opción "bucket general visible" la dejamos como ring opcional cuando aplica — visible pero separado. |
| **Empty state honesto (`—` no `10`)** | Sin haber corrido Evaluar, no tenemos derecho a decir 10/10. El "—" + CTA es más honesto. Esto requirió que `overall` sea `number \| null`. |
| **Drilldown como subir-panel, no modal** | El Scorebar es ambient (vive abajo). El drilldown sube desde ahí — el usuario sigue viendo el editor, puede scrollear, puede dismissear sin perder contexto. Modal sería forzar foco y romper el flujo. |
| **`removeAnnotationById` desde el drilldown vía event window** | El editor tiene la autoridad sobre el doc. Drilldown emite un event, EditorPane lo recibe y aplica. Mismo patrón que `pluma-roja:apply`. Mantiene la única fuente de verdad. |
| **`scrollIntoView` + flash CSS sobre la mark** | Diagnóstico → acción directa. Click en una anotación del drilldown → te lleva al texto y lo resalta 1.6s. El usuario no tiene que buscar manualmente. |
| **Color del ring por sabio dominante de sus anotaciones** | El color comunica algo: "este criterio lo está jodiendo principalmente el Crítico" se ve a simple vista (ring morado). Mejor que un color uniforme. |
| **Sin tests con Vitest / Jest** | El módulo es puro pero Playwright también lo puede importar y testear. Una dep menos. Para nivel benchmark v1 alcanza. |

## Aprendido en sesión 9

- **Anclar la métrica a una acción real cambia su naturaleza.** Un score-pedido-al-modelo es opinable; un score derivado de hallazgos concretos es accionable. La diferencia se siente en la UX: el usuario no se pelea con el número, se pelea con las anotaciones que están detrás.
- **Empty states honestos > defaults optimistas.** Mostrar 10/10 antes de haber corrido Evaluar habría sido tentador, pero rompía el contrato "10 = perfecto". Un "—" es UI más fea pero verdadera.
- **`box-shadow` animado funciona en marks inline mejor que `outline`.** outline corta en bordes de línea; box-shadow se mantiene continuo con `display: inline`.
- **TipTap marks como single source of truth ahorra storage paralelo.** El score se computa fresh sobre el doc; no hay que sincronizar dos estados.

## Qué quedó hecho en sesión 9.5 — Estados honestos del Benchmark

Decisión de producto (Noé, 2026-05-19): "Que va a pasar cuando ya tengo correcciones pero no evaluación?" El bug conceptual: el Scorebar no distinguía entre **"nunca evaluado"** y **"evaluado y descartaste todo"**. Ambos terminaban en "—" + CTA "Corre Evaluar", lo cual es **incorrecto** para el segundo caso — eso ES el 10/10 que el usuario quería. Mi propio test "perfect-essay flow" delataba el problema (asertaba "—" cuando el nombre prometía 10.0). Tu pregunta apuntó exactamente a ese hueco.

Implementación:

- **`EvaluacionMeta { evaluadoEn: ISO, pasadasCubiertas: Pase[] }`** persistida en `essay.evaluacionMeta?`. Rust storage + round-trip test (11/11 Rust verde). `EssayMeta` la omite (no viaja en la lista).
- **`recordEvaluacion(pasadasCubiertas)`** en el store: sincroniza `evaluadoEn` con `essay.updatedAt` actual para que la aplicación misma no marque stale. Llamada vía `queueMicrotask` desde EditorPane después de que las marks settlearon.
- **`pluma-roja:apply` event extendido** con `pasadasCubiertas` en el detail. PlumaRojaOverlay siempre dispatcha (incluso con 0 anotaciones) — un consejo limpio sigue siendo una evaluación válida.
- **`computeBenchmark({...})` refactorizado** a args con objeto. Devuelve además `wasEvaluated`, `pasadasCubiertas`, `pasadasDisponibles`, `missingPasadas`, `coverageRatio`, `isStale`.
- **`PENALTY_PER_MISSING_PASADA = 1`**: cada pasada no corrida resta 1 punto del overall. Honra la regla "no 10/10 si no corriste todas". Per-criterio queda intacto.
- **Estados del Scorebar** (5 ahora, no 3):
  - **Nunca evaluado**: ring punteado en `—` + "Sin datos del consejo todavía" + CTA **Evaluar**.
  - **Evaluado + clean + cobertura completa**: ring en **10.0** (ok green) + "Sin pendientes — el consejo no tiene nada que decir" + CTA **Re-evaluar**.
  - **Evaluado + clean + cobertura parcial**: ring capped por penalty (10 − missing×1) + "Sin pendientes en lo revisado · cobertura 3/4 · faltan {pasadas}" + CTA Re-evaluar.
  - **Evaluado + con issues**: score real + breakdown + chip de cobertura si parcial + CTA Re-evaluar.
  - **Stale** (sobre cualquiera de los anteriores): pill `· stale` al lado del label "Benchmark" + ring tinta ámbar + tooltip en CTA "el ensayo cambió desde la última revisión".
- **`isStale`** se calcula con `essay.updatedAt > evaluacionMeta.evaluadoEn`. Sincronizar evaluadoEn a updatedAt en `recordEvaluacion` evita falso positivo del apply.
- **Tests:** 13 unit tests en `score.spec.ts` (incluyen los 5 estados nuevos, partial coverage, isStale, false-positive negative) + 4 nuevos E2E en `benchmark.spec.ts` (perfect-state-real-10, never-evaluated, partial-cap-9, stale-indicator). **81/81 verde**.

## Decisiones de la sesión 9.5

| Decisión | Por qué |
|---|---|
| **`recordEvaluacion` vía `queueMicrotask`** | Las marks se aplican vía `editor.chain().setAnnotation().run()` que dispara `onUpdate` síncrono → `updateContent` → nuevo `updatedAt`. Diferir el `recordEvaluacion` un microtask asegura leer el `updatedAt` final, no uno intermedio. |
| **Sync `evaluadoEn = cur.updatedAt`** en `recordEvaluacion` | Si usara `nowIso()`, habría drift contra el `updatedAt` del último onUpdate. Sincronizar elimina el falso positivo "stale right after apply". |
| **Penalty plano por pasada faltante** (1 punto) | Más simple que ratio multiplicativo. Honra tu regla "no 10/10 sin cobertura completa" en lo justo: 1 missing → 9, 2 missing → 8, etc. Coherente con la escala de severidades. |
| **Dispatch del event incluso con 0 anotaciones** | Una corrida limpia (consejo no encontró nada) es información valiosa: es el 10/10. Antes hacía `if (out.length === 0) onClose()` y se perdía. |
| **Ring color por estado** (ok green / ámbar stale / seal red) | Cada estado tiene una lectura visual instantánea. Verde = perfecto. Ámbar = el dato está caduco. Rojo = hay trabajo. |
| **Per-criterio no se penaliza por cobertura** | Los criterios miden dimensiones del ensayo independientes de qué pasadas corriste. Penalizar per-criterio mezclaría dos cosas. La cobertura es propiedad del overall. |
| **Stale es banner, no bloqueo** | El usuario sigue viendo el score; solo se le advierte que el dato puede estar caduco. No le ocultamos el número (sería paternalista). Decide él si re-evalúa. |
| **Test del bug original conservado, ahora aserta 10.0** | El "perfect-essay flow" original pasaba pero mintiéndose en el comentario ("aquí cae a —, intencional"). Ahora aserta exactamente lo que el usuario pidió. La inconsistencia que tú notaste queda lock-eada en el test suite. |

## Aprendido en sesión 9.5

- **Tests amigables que pasan pero mienten son peligrosos.** El "perfect-essay flow" pasaba pero el comentario contradecía el nombre. Cuando el usuario pregunta algo aparentemente inocente, vale la pena revisar dónde hicimos paz con una inconsistencia.
- **Distinguir "ausencia de dato" de "dato significativo igual a cero".** "Sin evaluar" y "evaluado perfecto" no son lo mismo; usar `null` para uno y `0` para el otro permite UI honesta. Más en general: no colapsar estados conceptualmente distintos en el mismo valor.
- **`queueMicrotask` para esperar a que termine un side-effect síncrono pero recursivo.** Mejor que `setTimeout(0)` porque mantiene el ordering predecible dentro del mismo tick.
- **Estados se acumulan; mapearlos antes de codear.** Pasamos de 3 a 5 estados del Scorebar — el ejercicio de listarlos en tabla antes de codear hizo que la implementación fuera mecánica.

## Qué quedó hecho en sesión 10 — Idioma, click-to-apply, polish del topbar

Dos features de usabilidad pedidas por Noé en uso real + un pulido visual:

### A. Selector de idioma (ES / EN)

- `Essay.language?: "es" | "en"` (opcional para compatibilidad con ensayos viejos; default "es" en el renderer cuando ausente).
- Persistencia: Rust storage gana `pub language: Option<String>` con round-trip test (`round_trip_preserves_optional_language`).
- Store action `updateLanguage(language)` con flush inmediato (mismo patrón que `updateMode`).
- **Toggle en el topbar** al lado del Mode pill — pill compacto ES/EN con `data-active` para tests + `data-testid="topbar-language-{es|en}"`. Centro del topbar ahora aloja Mode + Language + Council.
- **Sidecar:** `interrogate` y `critique` aceptan `language?: "es" | "en"`. Validado en Rust (`unknown language: ...`) antes de forwardear.
- **Prompts:** nueva función `languageDirective(lang)` que inyecta una instrucción explícita al inicio del user prompt: "Respondé en español" / "Respond in English". Las personas (`prompts/*.md`) se quedan en español — definen voz y disposición; el modelo traduce el carácter al idioma de salida. Proper nouns (Edmondson, Meadows, etc.) se mantienen.
- **Ejemplo localizado:** `exampleLineFor(lang)` da el ejemplo JSON con valores `mensaje`/`sugerencia` en el idioma de destino. Las llaves (cita/severidad/mensaje/sugerencia/criterioId) se quedan en español porque son schema técnico.
- **Frontend:** `interrogate({language})` + `critique({language})` lo forwardean. `LecturaInner` y `PlumaInner` reciben `essayLanguage` como prop y lo propagan a cada llamada del sabio.
- **E2E:** stub captura `language` en `__E2E_LAST_INTERROGATE__` + `__E2E_LAST_CRITIQUE__`. `dumpInterrogates()` helper nuevo. Spec `language.spec.ts` (4 tests): default ES persiste, toggle a EN persiste, interrogate forwardea language, critique forwardea language a las 4 pasadas, persiste al cerrar/reabrir el ensayo.

### B. Click-to-apply en sugerencias

Antes: la sugerencia del sabio era texto read-only en el popover. El usuario tenía que copiarla y reemplazar manualmente. Ahora: un click reemplaza el texto subrayado por la sugerencia y quita la mark. El Scorebar recomputa automático.

- **Nuevo comando TipTap** `applyAnnotationSuggestion(id, sugerencia)` en `Annotation.ts`:
  1. Walk el doc por marks con ese id, capturar `firstFrom` y `lastTo`.
  2. Detectar si la mark cruza bloques (paragraph/heading) — heurística con la posición del último block boundary visto. Si cruza → `return false` (no rompe párrafos al merge).
  3. `tr.insertText(sugerencia, firstFrom, lastTo)` reemplaza el rango.
  4. `tr.removeMark(firstFrom, firstFrom + sugerencia.length, this.type)` — el texto insertado hereda marks del borde izquierdo; las quitamos explícito para que la anotación desaparezca.
- **Popover (`AnnotationPopover.tsx`):** botón "Aplicar sugerencia" cuando la anotación tiene `sugerencia`. Si la mark cruza bloques → `window.alert("La sugerencia cruza varios bloques (párrafo/heading). Aplícala manualmente.")`.
- **Drilldown (`BenchmarkDrilldown.tsx`):** mismo botón en cada card. Dispatcha `pluma-roja:apply-suggestion` event con `{id, sugerencia}`. `EditorPane` escucha y aplica via el comando — mismo path que el popover.
- **Undo:** `⌘Z` revierte naturalmente (es una transacción TipTap normal).
- **E2E:** spec `apply-suggestion.spec.ts` (4 tests): popover apply reemplaza texto + quita mark; "Aplicar" se oculta cuando no hay sugerencia; drilldown apply funciona idéntico; Scorebar overall recomputa después.

### C. Polish del topbar (overflow a anchos pequeños)

Captura de Noé mostró que el topbar se rompía a anchos chicos: el badge "guardado · 5m" hacía wrap a dos líneas, había un botón "Benchmark" placeholder sobrante, y los gaps eran amplios.

- **Quité el botón "Benchmark ⌘B"** del topbar — era placeholder de sesión 1 sin handler. El benchmark real es el Scorebar siempre visible al fondo.
- **`Badge.tsx`** ahora tiene `whitespace-nowrap` + `flex-none` (el badge ni el dot interno se rompen).
- **Layout más resistente:** grid `minmax(0,1fr)_auto_minmax(0,1fr)` (antes `1fr_auto_1fr` no comprimía bajo el contenido). Padding `px-7 → px-5`, gap `gap-6 → gap-4`, internos `gap-2.5 → gap-2`. Recupera ~30px horizontales.
- **Breadcrumb del título** ahora usa `truncate min-w-0 flex-1` (sin el `max-w-[280px]` fijo) — se ajusta al espacio real. Las palabras fijas ("ensayos" / slash) tienen `whitespace-nowrap` + `flex-none` para que solo el título recortable se trunque.
- **Sección derecha:** `flex-nowrap overflow-hidden` — si en algún futuro un botón nuevo no cabe, se clipea (no wraps feo). Hoy con los 4 botones (Board · Fuentes · Rúbrica · Interrogar · Evaluar) cabe holgado.

**89/89 E2E verde** + **12/12 Rust verde**.

## Decisiones de la sesión 10

| Decisión | Por qué |
|---|---|
| **Personas en español, traducción en runtime** | Las personas son voz curada — cambiar idioma literal a inglés exigiría re-curar la voz entera. El modelo traduce *carácter* al idioma destino de manera natural. Si en uso real la voz EN se siente débil, hacemos variantes EN explícitas como sesión aparte. |
| **Llaves JSON en español aunque el idioma sea EN** | Las llaves son schema técnico (cita/severidad/mensaje/sugerencia/criterioId) — el frontend las parsea con esos nombres. Cambiarlas por idioma significaría tener dos parsers. Los valores SÍ se traducen, que es lo único que el usuario ve. |
| **Click-to-apply respeta block boundaries** | Si la mark cruza un paragraph/heading boundary, `tr.insertText` haría merge de los bloques. Mejor que el comando refuse y muestre un toast, que romper la estructura del doc silenciosamente. v2 puede manejar este caso con split inteligente. |
| **Apply remueve el mark, no lo deja pegado** | `insertText` hace que el texto nuevo herede marks del borde izquierdo (incluyendo la anotación). Sin el `removeMark` después, la sugerencia quedaría subrayada como si todavía hubiera issue. Lo más natural es: aplicar = el issue se resolvió = mark se va. |
| **Botón "Aplicar" oculto sin sugerencia** | No todas las anotaciones traen sugerencia (el modelo puede decidir solo señalar sin proponer arreglo). Mostrar un botón disabled era confuso; ocultarlo es honesto. |
| **Quitar el Benchmark del topbar (breaking de mock)** | El Scorebar al fondo cubre la misma necesidad y vive siempre visible. Tener dos surfaces para lo mismo (botón + bar) era ruido. |
| **`minmax(0, 1fr)` en lugar de `1fr` en grid** | `1fr` se expande al contenido; `minmax(0, 1fr)` permite comprimir. Necesario para que las columnas con `truncate` realmente trunquen y no estiren el grid. |

## Qué quedó hecho en sesión 11 — Build distribuible (Fase 0 del ROADMAP)

El bloqueador único para que `npm run tauri:build` produjera un `.app` funcional fuera de dev: el sidecar Node y los prompts vivían fuera del bundle, así que en producción Rust no los encontraba (cwd en `/`, walk-up fallaba) y el sidecar nunca arrancaba. Resultado: Interrogar / Evaluar colgados en "el consejo piensa…" para siempre.

Implementación:

- **`bundle.resources` en `tauri.conf.json`** declara `../sidecar/dist/sage.js` y `../prompts/*.md`. Tauri los copia a `Resources/_up_/sidecar/dist/sage.js` y `Resources/_up_/prompts/*.md` dentro del `.app`.
- **`src-tauri/src/sidecar.rs`** ahora resuelve en tres pasos (en orden): (1) env var explícita (`SAGE_SIDECAR_PATH` / `SAGE_PROMPTS_DIR`), (2) `app.path().resolve(..., BaseDirectory::Resource)` — el path de producción, (3) walk-up desde `cwd` — el fallback de dev. `sidecar_path()` y `prompts_dir()` aceptan `&AppHandle`; el helper `find_walking_up(start, segments, max_hops)` está extraído para que los tests lo puedan ejercer sin mockear `AppHandle`.
- **`SidecarStatus { Unknown / Up / Down{message} }`** — serializado con `tag = "state"` para que el renderer haga `switch(status.state)`. Se cachea en `SidecarState.status` (`Mutex<SidecarStatus>`) y se emite por `sage://status` cada vez que cambia. La task que reaperea al child también marca Down si el proceso muere después de un spawn exitoso — y limpia el `stdin` para que las siguientes llamadas a `sage_interrogate`/`sage_critique` fallen rápido con error claro en vez de colgar.
- **Comando `sage_status`** registrado en `lib.rs` para que el renderer pueda consultar el estado actual al mount (cubre la race "el evento Down ya se emitió antes de que mi listener se enganchara").
- **Mensajes de error legibles** sustituyen los técnicos. Spawn-fail: "No pudimos arrancar el consejo (¿está `node` en el PATH?). Detalle: …". Resource-missing: "No encontramos `sage.js` — reconstruí la app con `npm run tauri:build:full`". Exit inesperado: "El consejo cerró inesperadamente (…). Reiniciá la app."
- **Frontend:** `src/lib/sidecar/status.ts` expone `useSidecarStatus()` (skip en dev sin Tauri para no confundir UI iteration). `src/components/SidecarBanner.tsx` se muestra solo cuando `state === "down"` — pill rojo arriba del editor con el detalle y un hint "verificá que `node` esté en el PATH y Claude Code esté instalado y logueado". Montado entre Topbar y el área principal (grid de page.tsx pasa a 4 filas; cuando el banner es null la fila colapsa a 0).
- **Sin auto-respawn aún** (Fase 1.2 del ROADMAP). El path de recuperación es "Reiniciá la app", honesto y simple.
- **`tauri:build:full` en `package.json`**: `npm run sidecar:build && tauri build`. Es el comando recomendado para release; si solo corres `tauri:build` y olvidaste rebuildear el sidecar, el `.app` se construye con la versión vieja (o vacía). Documentado en README + ROADMAP.
- **README** actualizado: estado a sesión 11, requisitos del usuario final (macOS 12+ / Node 20+ / Claude Code logueado), explicación de qué se empaca dentro del `.app` y dónde aterriza (`Contents/Resources/_up_/…`), comportamiento del banner rojo, smoke test checklist post-build.

**Tests:** 5 unit tests nuevos en `sidecar::tests` — `walks_up_to_find_target_one_hop`, `walks_up_finds_target_at_start`, `returns_none_when_target_missing`, `stops_after_max_hops`, `sidecar_status_serializes_with_state_tag` (locks la shape JSON que el frontend espera). **17/17 Rust verde**. Y `tests/e2e/sidecar-banner.spec.ts` (3 nuevos): banner oculto cuando `up`, banner visible al boot con `sage_status` Down, banner reactivo a un `sage://status` Down post-mount via `__E2E_DISPATCH`. El stub ahora respeta un override `__E2E_SIDECAR_STATUS__` para forzar el estado deseado por test. **92/92 E2E verde** (89 anteriores + 3 nuevos). Lint limpio. Playwright corrido contra el `next dev` ya en :3000 con un `playwright.config.session11.ts` temporal (Next 16 bloquea dos instancias del mismo proyecto, así que el `:3100` del config default no podía levantar). Anotado para Fase 1 — el harness de tests debería detectar y matar `next dev` huérfanos.

## Decisiones de la sesión 11

| Decisión | Por qué |
|---|---|
| **3 capas de resolución (env > Resource > walk-up)** en lugar de detectar dev/prod | Más robusto que `cfg!(debug_assertions)`: la env var es escape hatch universal (CI, devs con setup raro); Resource es el camino de producción declarativo en `tauri.conf.json`; walk-up es el fallback de dev sin tener que recordar configurar nada. Cada capa cae a la siguiente si no aplica — no hay "modo" que pueda equivocarse. |
| **Mantener walk-up incluso en builds release** | Si por alguna razón el resource no resuelve (corrupción del bundle, custom build), tener un fallback honesto evita un `.app` muerto. Costo: 6 stats de filesystem en boot — invisible. |
| **`SidecarStatus` con `tag = "state"`** | El renderer hace `switch(status.state)` para discriminar las variantes. La forma `{ state: "down", message: "..." }` es JSON predecible. El test serde-shape la fija para que un refactor del enum no rompa silenciosamente la UI. |
| **Cachear el último status en `SidecarState`** + emitir evento | El renderer puede montar después del primer emit (especialmente al abrir el `.app` por primera vez), así que necesita poder *preguntar*. Si solo emitiéramos, una race ocasional dejaría el banner sin aparecer. |
| **Banner es read-only por ahora (sin Reintentar)** | Para llamar a `sidecar::spawn` desde un Tauri command necesitaríamos refactorizar la signatura (recibir state como argument, lockear stdin con safety). Es trabajo para Fase 1.2. v1: "Reiniciá la app" — fricción real pero honesta. |
| **Banner skipped en dev sin Tauri (`npm run dev`)** | Iterar UI en el browser tradicional no usa el sidecar; mostrar un banner rojo en ese contexto sería falsa alarma constante. Detectamos `__TAURI_INTERNALS__`. |
| **`tauri:build:full` separado de `tauri:build`** en vez de añadir `prebuild` al script existente | Hace explícito que rebuildear el sidecar es parte del release. Un dev que quiere iterar el build del `.app` sin tocar el sidecar (debugging del bundling, p.ej.) tiene `tauri:build` puro disponible. Compromiso entre "magia que olvida pasos" y "tipear demasiado". |
| **`set_status` también marca Down en el reap** | Sin esto, si el child crashea después de spawn, el banner nunca aparece pero las llamadas siguen fallando con "sidecar is not running" en cada invoke. Detectar el crash en el wait y reflejarlo en UI cierra el loop. |
| **`find_walking_up` extraído como helper puro** | El `AppHandle` es prácticamente intesteable sin levantar Tauri runtime. Pulled la lógica pura del walk-up afuera; los tests de unit la ejercen contra directorios tmp reales. |
| **Empacar `prompts/*.md` aunque sean assets del Node sidecar** | Las personas viven en `prompts/` y el sidecar las lee por FS (no las bundleamos en el `sage.js`). Empacarlas como resource del Tauri bundle es coherente: ambas viven en `Contents/Resources/` y el sidecar las encuentra via `SAGE_PROMPTS_DIR` que Rust setea con el path resuelto. |

## Aprendido en sesión 11

- **Las tres capas (env > Resource > walk-up) son un patrón limpio para "funciona en dev sin configurar nada, en prod via el bundle, y siempre se puede forzar via env".** Es el mismo patrón que ya usabamos en una sola función (env > walk-up); añadir la capa de Resource sin perder dev fue solo encadenar.
- **`SAGE_PROMPTS_DIR` que ya existía es exactamente lo que necesitábamos.** El sidecar Node lee esa env desde Rust. Bastó hacer que Rust la resuelva via Resource en prod — ningún cambio del lado de Node. Las APIs cross-language pequeñas, bien pensadas, escalan.
- **Falla rápida con mensaje legible > silencio infinito.** Ver "el consejo piensa…" para siempre en producción habría sido el infierno de UX. Spawn-fail + banner rojo desde el segundo 1 hace que el usuario sepa qué arreglar antes de tocar ningún botón.
- **Cachear estado + emitir evento cubre las races de mounting.** Es un patrón general: cualquier estado de boot importante necesita ambos. Solo evento → race window al inicio. Solo cache → no hay reactividad. Ambos → robusto.
- **Las "fixtures de archivo" para tests de walk-up son baratísimas con `tempdir`.** No vale la pena mockear FS; usar directorios temporales reales hace los tests más fieles y siguen siendo rápidos (<1ms cada uno).
- **El `playwright.config.session11.ts` temporal es un workaround OK, no una solución.** Cuando Next 16 bloquea dos instancias del mismo proyecto, lo correcto es hacer que el script de tests detecte y kill el `next dev` huérfano, o usar un puerto distinto y un proyecto distinto. Anotado para Fase 1 cuando refactoremos el harness de tests.

## Qué quedó hecho en sesión 12 — Historial de versiones (Fase 2.2 del ROADMAP)

Snapshots append-only por ensayo con políticas honestas (retención + restauración con red de seguridad). Pasos del flow:

- Tipos en `src/lib/storage/types.ts`: `SnapshotKind = "auto" | "close" | "manual" | "before-restore"`, `Snapshot { takenAt, kind, essay }`, `SnapshotMeta { takenAt, kind, wordCount, title }`. La política está codificada en el kind: `auto` rota agresivo, los demás se preservan para siempre.
- Rust `src-tauri/src/history.rs` nuevo: `<id>.history.jsonl` append-only al lado del `<id>.json` del ensayo. `append_in` es idempotente sobre `takenAt`. `prune_in` rewrite atómico (tmp + rename) que mantiene los últimos `MAX_AUTO_SNAPSHOTS = 20` autos y *todos* los demás. `history_append` Tauri command corre append + prune juntos. `essay_delete` también borra el `.history.jsonl` para que un ensayo borrado no leak historia. **11 unit tests** (round-trip, idempotency, prune cap, kind validation, corrupt line skip, invalid id rejection).
- TS bindings en `src/lib/storage/index.ts`: `listHistory`, `readSnapshot`, `appendSnapshot`. Store gana `history: SnapshotMeta[]`, `restoreNonce: number`, y acciones `openHistory`, `loadHistory`, `snapshotNow(kind)`, `previewSnapshot`, `restoreVersion`. `openEssay` autocarga la historia al boot para que el count del topbar sea honesto desde el primer render.
- `closeEssay` toma un snapshot `kind="close"` antes del flush final (best-effort: si falla, igual cierra para no atrapar al usuario).
- Heartbeat auto-snapshot en `src/app/page.tsx`: cada 10 min, si `current.updatedAt` avanzó desde el último auto, snapshotea. Usa una ref para no reiniciar el timer en cada keystroke. Sólo activo mientras hay essay abierto.
- `restoreVersion` flow: (1) snapshot `kind="before-restore"` automático, (2) read del target, (3) merge `target.essay` con `id/createdAt` de la live + `updatedAt: now`, (4) bump `restoreNonce` para forzar remount del editor, (5) flush + reload history.
- `EditorPane` ahora compone el wrapper key como `${essayId}#${restoreNonce}`. TipTap no es reactivo sobre `content` después del mount, así que un cambio en `restoreNonce` mounta el subtree completo con el doc restaurado.
- `HistoryOverlay.tsx` nuevo (overlay modal estilo Rúbrica/Fuentes): split list/preview a 300px+1fr. Lista DESC con `formatAgo` ("hace 3 días"/"ayer"/etc) + KindChip + word count. Preview read-only en flat text — deliberadamente sin TipTap para hacer obvio que es un snapshot. Restore pide confirm inline antes de aplicar.
- Topbar gana `HistoryButton` con count badge. **Movido al lado IZQUIERDO** del topbar (junto al SaveBadge), no al row de acciones derecho, porque el right column ya estaba al borde de overflow a 1440px de viewport (con Historial añadido, 33px de overflow → BoardToggle se metía DETRÁS del avatar del Crítico). El placement es semánticamente correcto: Historial es metadata del ensayo (junto al título y al estado de guardado), no una acción del consejo.
- Stub Tauri (`tests/e2e/setup.ts`) gana `history_list`/`history_read`/`history_append` con el mismo retention rule que Rust. `__E2E_HISTORIES__` expuesto en window para introspección de specs. Drive-by fix: el tipo `EssayDump` recuperó `rubrica`/`fuentes`/`evaluacionMeta`/`language` (estaba desactualizado desde sesiones 7-10).
- **`tests/e2e/history.spec.ts`** (4 specs): nuevo ensayo sin count; manual snapshot añade row con kind="manual"; restaurar reemplaza editor + inyecta `before-restore`; closeEssay añade `close`.

**96/96 E2E + 28/28 Rust verdes.** Lint limpio. Workaround `playwright.config.session12.ts` removido tras la corrida.

## Decisiones de la sesión 12

| Decisión | Por qué |
|---|---|
| **Append-only `.history.jsonl` por ensayo, no DB** | Mismo modelo que `<id>.json` — un archivo por unit, fácil de inspeccionar/respaldar/borrar/migrar. Append es atómico a nivel POSIX para escrituras pequeñas. Lectura/prune leen todo el archivo (acceptable hasta cientos de versiones; un ensayo activo de un año = ~6/h × 8h × 5d × 50w ≈ 12k, todavía MB-scale en JSON, no GB). Si en algún momento duele, migramos a SQLite. |
| **Retención: últimos 20 autos + todos los explícitos** | Distingue "estado pasado pasivo" (descartable) de "lo que el usuario eligió guardar" (intocable). Un editor activo de un día tendría ~6 autos y N manuales/close — el panel se mantiene legible sin perder nunca un save explícito. |
| **Prune corre en cada `history_append`** | Acoplar prune al append evita que el archivo crezca sin límite incluso si el usuario nunca abre el panel. Es O(N) en líneas pero N siempre <= MAX_AUTO + small constant. |
| **Snapshot `before-restore` automático antes del restore** | Red de seguridad asimétrica: el restore es la única operación destructiva del flow (sobreescribe el current state). Forzar un snapshot inmediatamente antes hace que `⌘Z` no funcione (TipTap reset) pero "restaurar el before-restore desde el panel" siempre funciona. Cero forma de perder trabajo aceptando un restore. |
| **`restoreNonce` en lugar de event-based content swap** | El patrón ya existente de "remontar TipTap al cambiar essay id" se extiende limpio: incluir el nonce en el key del wrapper. Más simple que añadir un listener `editor:set-content` + manejar imperativamente `editor.commands.setContent`. Costo: pierdes el undo stack del TipTap (correcto comportamiento — restaurar no debería ser undeable como un keystroke). |
| **Auto-snapshot cada 10 min, no cada N keystrokes** | Tiempo es la métrica honesta. 10 min de edición real ≈ varios cambios sustantivos. Por keystroke sería ruidoso (1 línea = 80+ snapshots). El timer no se reinicia en cada edit (ref-based check), así que el costo de 1 snapshot/10min es predecible. |
| **`updatedAt` advanced check antes de auto-snapshot** | Sin esto, un usuario que abre el ensayo, lee 10min sin editar, recibiría un snapshot vacío idéntico al anterior. Diferir condicionalmente respeta la promesa de "los autos son cambios reales". |
| **`closeEssay` toma `kind="close"` best-effort** | Si snapshot falla (disk full, FS read-only), igual debemos cerrar el ensayo — atrapar al usuario en el editor por un fallo de IO sería peor que perder ese snapshot. El `try/catch + warn` es honest. |
| **Preview en flat text, no TipTap** | El preview es read-only y conceptualmente "un fotografía de otro tiempo". Renderizarlo en TipTap haría que se sienta editable y que el usuario tenga que adivinar por qué no escribe. Texto plano + serif italic comunica "esto es un snapshot inmutable" sin documentación. |
| **HistoryButton a la IZQUIERDA del topbar** | Tres razones: (1) tracking de tamaños — el right column ya overflow-eaba a 1440px con la chip extra (BoardToggle terminaba 30px DETRÁS de la columna, detrás del avatar del Crítico, intercept de pointer events); (2) semántica — Fuentes/Rúbrica/Historial son properties del ensayo, no acciones de consejo, así que conviven con título/save badge; (3) future-proof — moverlas a la izquierda libera right column para crecer con nuevas acciones del consejo sin renegociar layout. |
| **`__E2E_HISTORIES__` expuesto como `__E2E_ESSAYS__`** | Mismo patrón que para essays — permite a specs inspeccionar el estado del stub sin reverse-engineering del DOM. Las specs no lo usan hoy pero queda para sesiones futuras (p.ej. tests de retention policy). |
| **Drive-by fix de `EssayDump` con rubrica/fuentes/etc** | Encontré el tipo desactualizado al typecheckear. Fix de 6 líneas que destrababa lint cleanup. La regla "no preventive refactors" se respeta — esto era trabajo activamente bloqueante, no especulativo. |

## Aprendido en sesión 12

- **Retention diferenciada por kind > expiry uniforme.** Tratar todos los snapshots igual significa que el usuario pierde un save manual con el mismo criterio que un heartbeat. Marcar la intención (manual / close / before-restore vs. auto) en el dato mismo permite políticas que respeten lo que la persona quiso guardar.
- **Las redes de seguridad asimétricas pagan por sí solas.** Un snapshot extra antes de un restore es ~unas KBs y nunca le va a dolor al usuario. Sin él, un restore mal pulsado destruye trabajo. La asimetría costo/beneficio dice "siempre haz el snapshot, nunca lo pidas".
- **Layout overflow ≠ `scrollWidth`.** Cuando un flex container con `justify-end` desborda, los items extienden HACIA LA IZQUIERDA fuera del contenedor, pero `scrollWidth` puede igualar `clientWidth` (Chrome no contabiliza el overflow negativo). El diagnóstico real fue posición x del primer hijo vs. position x del contenedor — el delta negativo era el overflow real.
- **Mount-key chain es un patrón limpio para "remountéa cuando X o Y cambia".** `${essayId}#${restoreNonce}` se lee como "una identidad por (essay × estado del restore)". Cualquier prop o estado adicional que necesite forzar remount se compone igual.
- **Auto-snapshot por tiempo + condición de "cambió desde" > polling agresivo.** El ref-based check evita el patrón degenerate "100 snapshots vacíos durante una sesión de lectura". Hace que la política sea "snapshot si y solo si hay novedad", no "snapshot every N".
- **El topbar a 1440 está al borde. Cada nueva acción tiene que pagar su sitio.** Llevamos 5 botones en el right column + 4 avatares en el centro + breadcrumb + savebadge a la izquierda. Antes de añadir un sexto botón en el row de acciones, hay que considerar: (a) ¿es realmente una acción del consejo o es metadata del ensayo? (b) ¿cuál es el budget de ancho disponible? La respuesta de hoy fue mover Historial al row de metadata izquierdo — no shrinking, no reflow responsive.

## Qué quedó hecho en sesión 13 — Menú nativo + Historial fuera de la UI (Fase 2.7 del ROADMAP)

Noé observó que el botón Historial saturaba el topbar: "Ya que esta es una app desktop, podemos hacer uso de las funciones nativas de menu? Para no tener el boton de historial en la UI ya que no es tan importante y no quiero saturar." Trasladamos Historial al menú nativo de macOS bajo `View > Historial de versiones…` con accelerator `⌘⇧H`, y aprovechamos para montar la infraestructura base que sesiones siguientes pueden expandir sin trabajo extra de plomería.

Implementación:

- **`src-tauri/src/menu.rs` nuevo** — construye la estructura completa via `tauri::menu::*`: app submenu (About + Services + Hide/Hide Others/Show All + Quit), `Archivo` (Nuevo ensayo ⌘N, Cerrar ensayo ⌘W), `Edición` (Undo/Redo/Cut/Copy/Paste/Select All — todos predefinidos), `Vista` (Historial ⌘⇧H), `Ventana` (Minimize/Maximize/Close). Help se difiere a una sesión futura cuando tengamos contenidos reales que enlazar.
- **Custom items siguen el scheme `surface:action`** (`file:new`, `file:close`, `view:history`) — fácil de filtrar y de extender; un nuevo item es 4 líneas en Rust + 1 case en TS.
- **`lib.rs` setup** instala el menú con `app.set_menu(menu::build(...))` y registra `on_menu_event` que emite `app:menu` event con el id del item activado. Los items predefinidos (cut/copy/quit/etc.) no pasan por ahí — Tauri los maneja a nivel plataforma.
- **`src/lib/menu/bridge.ts` nuevo** — `useNativeMenuBridge()` listen al `app:menu` event y dispatcha al store action correspondiente. Skip si no hay `__TAURI_INTERNALS__` (dev en browser puro). Items desconocidos son no-op silencioso, así que añadir un id en Rust sin wiring en renderer no rompe nada.
- **HistoryButton removido del topbar** + el código del botón borrado. Sin pieza UI redundante; el único punto de entrada al historial es el menú nativo (manteniéndose la `openHistory` store action porque eventos del bridge la usan).
- **Spec `history.spec.ts` ajustado** — nuevo helper `openHistoryViaMenu(page)` emite el `app:menu` event directamente via `__E2E_DISPATCH`. Mismo path que producción; lo único que skip-eamos es el chrome del system menu (Playwright no puede driverlo). El test "nuevo ensayo no muestra count" se renombró a "muestra estado vacío en el overlay" porque el count ya no existe; aserta que `topbar-history` testid tiene 0 elementos como guard contra reintroducción accidental.

**96/96 E2E + 28/28 Rust + lint limpio.**

## Decisiones de la sesión 13

| Decisión | Por qué |
|---|---|
| **Menú nativo completo, no sólo "Vista > Historial"** | El costo marginal de construir File/Edit/View/Window de una vez fue tiny (5 minutos extras de código predefinido) y nos da una base coherente. Un menú con sólo "Vista" + items defaults a su lado se ve incompleto y como si lo hubiéramos hackeado. Mejor un esqueleto serio con un solo custom item, expandible. |
| **Skip de `Ayuda` en esta sesión** | Help sin contenido real (About con metadata, enlace al ROADMAP, About Essay Studio que abre el PDF, etc.) es ruido. Cuando tengamos cosas que ofrecer ahí, lo ponemos completo en una sola pasada. |
| **`app:menu` event con id en payload, no un event por item** | Una sola subscripción en el renderer, un switch por id. Añadir un item nuevo no requiere registrar otro listener. Trade-off: el bridge no es type-safe sobre ids — la mitigación es que el bridge ignora ids desconocidos, y el test sweep + lint detectan typos. |
| **Items predefinidos (cut/copy/paste/undo/redo/quit) no emiten al renderer** | Tauri ya los wirea a nivel plataforma — Cut va a la selección activa, Quit cierra la app, Undo invoca el undo stack del DOM (que TipTap consume nativamente). Forzar que pasen por nuestro bridge sería trabajo extra para ningún beneficio. |
| **`file:new` usa el mode del current essay si existe, default `academico`** | Es el comportamiento menos sorprendente: si estoy en blog y hago ⌘N, prefiero otro blog. Si vengo de la lista (no current), el default cubre el caso vacío. |
| **`file:close` no-op si no hay current essay** | El item visible en el menú no se desactiva contextualmente (Tauri 2 lo permite pero requiere recompilar el menú; lo dejamos para más adelante si nos molesta). Mientras tanto, el bridge ignora la activación. |
| **`openHistoryViaMenu` helper en lugar de mockear el sistema menu** | Playwright no puede driver el menú nativo de macOS. Emitir el `app:menu` event manualmente recorre el mismo bridge que producción — la única diferencia es el origen del trigger. Coverage real, no mocking. |
| **Quitar HistoryButton, no esconderlo con feature flag** | La intención del usuario fue clara: el botón satura. Esconderlo bajo un flag haría que reapareciera al menor descuido. Borrarlo cierra la decisión. Si en algún futuro queremos un trigger UI (p.ej. en un settings panel), lo reconstruimos. |
| **`surface:action` scheme en los ids** | Patrón limpio para crecer. Cuando añadamos `view:scorebar`, `sabio:interrogar`, etc., el bridge sigue siendo un switch único, y los ids se auto-documentan en lectura. |
| **Bridge skipea sin Tauri (`__TAURI_INTERNALS__`)** | Iterar UI en el browser tradicional no tiene menú nativo, y suscribirse a un event que nunca vendrá sólo añade ruido en consola. La misma defensa que `useSidecarStatus` hace en sesión 11. |

## Aprendido en sesión 13

- **La UI cargada es ansiedad acumulada.** Cinco chips en el topbar derecho + cuatro avatares en el centro + breadcrumb + save status + lang + mode pill son MUCHA información para procesar visualmente. Mover una sola pieza al menú nativo (que vive fuera del foco del editor) baja la temperatura del topbar sin perder funcionalidad. Es la lección de "respect the medium": una app desktop tiene afordances nativas que una webapp no, y vale la pena usarlas.
- **Construir el esqueleto del menú una vez paga durante toda la app.** La estructura File/Edit/View/Window que armé hoy es la misma estructura que cualquier sesión futura va a necesitar para añadir un item. El costo marginal de cada item nuevo es ahora ~5 líneas — Rust (item + accelerator + push al submenu) + TS (case en el switch del bridge). Es el patrón infra-once-features-many que vale la pena adelantarse.
- **El payload con id stringificado es el contrato más simple posible.** Es tentador hacer `app:menu:<id>` como event name distinto por item para "más type safety", pero termina siendo cantidad de cosas a registrar sin beneficio real. Un solo event + un switch escala mejor.
- **Tauri 2's `PredefinedMenuItem` es underrated.** Cut/Copy/Paste/Undo/Redo/Quit/Hide funcionan con la plataforma sin que escribamos ni una línea de handler. Para un `Edit` menu, 95% del trabajo lo hace Tauri. Cuando lo único que añadimos es un par de items custom (uno por sesión), la curva de costo es muy plana.
- **Helper `openHistoryViaMenu` en tests > mock del native menu.** Cuando una capa es untestable directamente (system UI), el test cleaner es ejercer la capa siguiente con el mismo input que recibiría. Esto generaliza: para cualquier feature que dependa de algo native-only, una función helper que emite el evento del bridge cubre el comportamiento real.

## Qué quedó hecho en sesión 13b — Tres bugs que Noé encontró usando la app

Después de cerrar sesión 13 con el menú nativo + Historial movido, Noé usó la app y devolvió tres reports en cadena. Los tres eran reales, los tres con root causes distintos. Documentado acá porque ilustran patrones que probablemente vuelvan en sesiones futuras.

### 1. Flash de "No se pudo leer esta versión" en HistoryOverlay

Noé abría el panel con un snapshot guardado y veía instantáneamente el mensaje rojo de error. Bug: mi código tenía `preview: Snapshot | null` y un render-path `!preview → "No se pudo leer"`. Cuando el panel montaba con history pre-existente, `selected` se pre-seteaba pero `preview` quedaba en `null`. La conflación entre "aún no cargué" y "falló al cargar" disparaba el path equivocado.

Fix:
- Estado discriminado `{ kind: "idle" | "loading" | "ready" | "error" }` — sin ambigüedad
- Auto-load on mount via `queueMicrotask` cuando hay history existente — al abrir el panel ves directamente la versión más reciente
- Test de regresión en `history.spec.ts` que asserta que el texto "No se pudo leer" no aparece y el preview se materializa

### 2. Scorebar saturando el viewport en ensayo nuevo

Noé observó: "Primero el benchmark se ve raro cuando abrimos un nuevo documento, segundo no quiero que esté ahí el benchmark ocupando espacio si no hay evaluación." El placeholder `— DE 10` sin número arriba se veía como un estado roto, y la barra ocupaba ~80px de altura útil del editor.

Fix:
- `Scorebar` retorna `null` cuando `wasEvaluated === false && hasAnotaciones === false`
- La invariante de sesión 9.5 "nunca un 10/10 falso" sigue intacta — sólo cambia cómo se expresa: por ausencia del bar en vez de `—` placeholder. Misma honestidad, menos ruido visual.
- Trade-off: el CTA "Corre Evaluar para puntuar" desaparecía con el bar — pero el botón **Evaluar** del topbar y el `⌘⇧E` del menú (sesión 14) lo cubren. No se pierde discoverability.
- Tests actualizados: `"empty essay"` y `"never-evaluated essay"` ahora asertan `scorebar` con count 0 (era visible con `—`)

### 3. Editor + tablero "cortados" a ~430px del viewport

Tras esconder el Scorebar, Noé vio que el editor + tablero sólo ocupaban la mitad superior del viewport y el resto era beige vacío. Diagnostiqué un bug de CSS Grid auto-placement:

`grid-rows-[auto_auto_1fr_auto]` define 4 tracks. Pero la mayoría del tiempo, SidecarBanner, Scorebar y los 5 overlays (Lectura/Pluma/Rúbrica/Fuentes/Historial) retornan `null` — sin DOM, sin grid items. Sólo Topbar + `<main>` creaban DOM. CSS Grid auto-placement los metía en los DOS primeros tracks consecutivos: Topbar en row 1 (`auto`), `<main>` en row 2 (`auto`). El track 3 (`1fr`) quedaba vacío y `<main>` no se expandía — sólo crecía con su contenido (~430px del tablero vacío de tldraw).

Fix:
- Pasar a flexbox columna. `flex-1` en `<main>` siempre aplica sin depender de cuántos hermanos rendericen null.
- Como bonus, mover los 5 overlays fuera del wrapper. Son `fixed inset-0` — su ubicación en el árbol no afecta el layout. Page.tsx queda más legible (4 cosas dentro del flex, overlays como siblings del wrapper).
- Test de regresión en `flow.spec.ts`: mide `boundingBox` de `<main>` y asserta >= 80% del viewport (genera mensaje específico apuntando al commit si se rompe).

### Aprendizajes de 13b

- **Estados discriminados ganan a flags booleanos en cuanto hay > 2 estados.** El bug del "No se pudo leer" salió de colapsar 4 estados conceptuales en un nullable. Cuando notes que tu `null` significa dos cosas distintas, esa es la señal.
- **CSS Grid auto-placement es trampa cuando hijos pueden ser null.** Si tu template tiene N tracks y a veces sólo M < N hijos se renderizan, los hijos caen en los primeros tracks, no en los que vos pensabas. Flexbox columna con `flex-1` no tiene ese problema — sólo distribuye lo que existe. Lección general: para layouts column-style con piezas opcionales, **flex > grid**.
- **Bugs de UX que el usuario reporta son señales gratis.** Los tres eran detectables sólo usando la app — no había una spec que pudiera capturarlos. Cada uno ganó su propio test de regresión, y la lista de "things to look out for" del codebase creció con tres patterns útiles (estado discriminado para load states, layout flex para piezas opcionales, ocultar vs placeholder honesto).
- **Comentar el porqué de la decisión vale el espacio.** Mi `page.tsx` ahora explica en 4 líneas por qué flexbox y no grid. La próxima persona (o yo mismo en 6 meses) entiende la trampa de auto-placement sin tener que reproducirla.

## Qué quedó hecho en sesión 14 — Submenú Sabios + Toggle tablero (completa Fase 2.7 core)

Después de la foundation de sesión 13, Noé dijo "continúa con el resto del plan". El siguiente paso natural era completar el menú nativo con las shortcuts que él usa a diario — todas las acciones del topbar deberían tener equivalente teclado vía menú.

Items añadidos:

**Vista:**
- Mostrar / ocultar tablero (`⌘\`, `view:board-toggle`)

**Sabios** (submenu nuevo entre Vista y Ventana):
- Interrogar (`⌘I`, `sabios:interrogar`) → openLectura() en modo consejo
- Evaluar (`⌘⇧E`, `sabios:evaluar`) → openPlumaRoja()
- Rúbrica… (`⌘R`, `sabios:rubrica`) → openRubrica()
- Fuentes… (`⌘F`, `sabios:fuentes`) → openFuentes()

Bridge TS: 5 cases nuevos en el switch, todos guard-ed por `if (s.current)` — sin essay, no-op silencioso. Disable contextual (greyed-out visual) queda para sesión futura.

Como drive-by: añadí `data-testid="lectura-overlay"` y `data-testid="pluma-overlay"` en sus wrappers (los otros 3 overlays ya los tenían). El nuevo `tests/e2e/menu.spec.ts` cubre 7 casos: 5 happy paths (1 por item), 1 guard de "sin essay → no-op", 1 guard de "id desconocido → no-op silencioso".

**105/105 E2E + 28/28 Rust + lint limpio.**

## Decisiones de la sesión 14

| Decisión | Por qué |
|---|---|
| **Skip de Toggle Scorebar (⌘B)** del ROADMAP original | Con sesión 13b el Scorebar auto-aparece/desaparece según haya evaluación. Un toggle manual es redundante. Si en uso real lo extrañamos, lo añadimos. |
| **Skip de submenú Ayuda** | About + Open ROADMAP + Open CLAUDE.md requieren wirear el plugin `opener` de Tauri (o shell) y bundlear los `.md` como resources. Trabajo modesto pero no rinde valor diario. Lo dejamos para una sesión de "polish" futura. |
| **Skip de disable contextual** (greyed-out cuando no hay essay) | Tauri 2 lo permite via `MenuItem::set_enabled(false)`, pero requiere que el renderer mande state changes a Rust y reconstruir parte del menú reactivamente. Para v1, el bridge silently no-op es honesto: cliquear no rompe nada, sólo no hace nada visible. Si en uso real es confuso, lo arreglamos con un Rust command que actualice el enabled state desde el renderer. |
| **`⌘I` para Interrogar y `⌘⇧E` para Evaluar** | Convención clara: `⌘I` activa un sabio inmediato (interrogar es el flujo más frecuente); `⌘⇧E` está reservado para la acción más pesada (multi-pasada con anotaciones inline). El shift indica "modo más fuerte". |
| **`⌘R` para Rúbrica y `⌘F` para Fuentes** | Iniciales del nombre, sin conflicto con shortcuts del sistema (Refresh / Find normalmente, pero en una app sin esos conceptos directos las re-asignamos). |
| **`⌘\` para Toggle Tablero** | Inspirado en VS Code (`⌘\` divide el editor en dos paneles). El concepto es paralelo: muestrar/ocultar la columna secundaria. |
| **Tests via `fireMenu` helper en lugar de mocking del menú** | Mismo patrón que `openHistoryViaMenu` (sesión 13). Emitir el `app:menu` event directamente recorre el mismo bridge que producción — la única diferencia es el origen del trigger. Cobertura real, sin scaffold. |
| **`data-testid` en los 2 overlays que faltaban** | Un drive-by chiquito. Lectura y Pluma no tenían testid root porque las specs anteriores los detectaban via botones internos. Ahora con menu.spec abriendo overlays "desde afuera", un testid en root es la forma más limpia. |
| **El bridge ignora `default:` con comment** | Predefined items (cut/copy/paste/quit/etc.) no pasan al bridge — Tauri los handlea a nivel plataforma. El `default: break` con el comentario hace explícito que es intencional, no un olvido. |

## Aprendido en sesión 14

- **La foundation que armás temprano paga durante muchas sesiones.** Sesión 13 invirtió ~30 minutos extras en build el menú completo (no sólo el item Historial) y wireear el bridge genérico. Sesión 14 añadió 5 items en otros ~15 minutos. Si hubiera atajado en 13 y armado sólo View > Historial, sesión 14 habría duplicado costo. La regla: la primera vez que tocás una pieza nueva del sistema, hacela bien.
- **El switch + ids stringificados es resiliente al growth.** Pasamos de 3 ids a 8 con cambios mínimos en el bridge (5 cases nuevos) y cero en el contrato del event. Una API más "type-safe" (eventos por item, schema discriminado, etc.) habría costado más line-y para zero benefit en esta escala.
- **Tests de "no-op silencioso" merecen su propio caso.** El test "ids desconocidos del menú son no-op silencioso" parece tonto, pero locka una garantía importante: añadir un item en Rust antes de wirear el bridge no rompe la app. Es lo que permite hacer sesiones cortas e incrementales (Rust primero, TS después) sin miedo.
- **Convenciones de atajos de otras apps son shortcut intelectual.** No tuve que inventar `⌘\` ni explicar por qué — VS Code ya lo enseñó. Mismo con `⌘⇧E` (Evaluar / Export — convención de "shift = versión más fuerte"). Reutilizar el muscle memory del usuario en otras apps tiene un costo cero y un beneficio enorme.

## Qué quedó hecho en sesión 15 — Separar explicación pedagógica del reemplazo literal

Bug conceptual reportado por Noé después de usar Evaluar:

> "Una cosa es la sugerencia que me dan a mí, que puede mejorar para ser más clara; pero la otra es el texto a reemplazar. Ejemplo: la sugerencia puede ser 'tienes que citar al autor por esto o es plagio', el texto nuevo sería 'Un gran poder conlleva una gran responsabilidad (Tío Ben, 2002)'."

El campo `sugerencia` hacía doble función — a veces era la explicación pedagógica del sabio (imperativos como "Reformula X", "Cita al autor"), a veces el texto literal del reemplazo. Cuando el usuario clickeaba "Aplicar sugerencia" en el primer caso, la cita en el doc se sustituía por un imperativo, rompiendo el texto.

Fix sin migración (no rompemos anotaciones viejas):

**Sidecar — `sage.ts`:**
- `mensaje`: ampliado de 25 a **50 palabras**, con foco explícito en explicación pedagógica del "porqué", no órdenes secas.
- `sugerencia`: OPCIONAL, redefinido como SOLO el texto literal de reemplazo. Prohibido usar imperativos. Si no hay un fragmento limpio para pegar, se omite.
- Ejemplo de prompt actualizado en ambos idiomas usando el caso de Tío Ben:
  - `mensaje`: "Estás parafraseando a Tío Ben sin citarlo. Reproducir frases icónicas sin atribución es plagio…"
  - `sugerencia`: "un gran poder conlleva una gran responsabilidad (Tío Ben, 2002)"

**UI — `AnnotationPopover` y `BenchmarkDrilldown`:**
- "Sugerencia" → **"Reemplazar por"** como header del bloque
- Texto del reemplazo en bloque con borde + fondo distinto + comillas tipográficas — comunica visualmente "esto es texto literal del documento", no advice
- Quitamos el italic (era estilo de advice; ahora es prosa real)
- Botón "Aplicar sugerencia" → **"Reemplazar"** (corto, accionable)
- Tooltip aclarado: "Sustituye el texto subrayado por el reemplazo que propone el sabio"
- Nuevos testids `popover-reemplazo` y `drilldown-reemplazo`

**Dos registros visuales para dos cosas conceptualmente distintas:**
- Mensaje (explicación) → serif sin caja, texto humano del sabio
- Reemplazo (literal) → en caja con borde, texto del documento

**Tests:**
- Stub actualizado: sugerencias derivan de la cita para ser texto pegable (no imperativos)
- Mensajes del stub expandidos a "problema X — explicación pedagógica" para reflejar el ancho real
- Nuevo spec en `apply-suggestion.spec.ts`: guard contra reintroducción del label viejo + verifica el bloque del reemplazo con su testid + asserta botón "Reemplazar"
- Regex de `pluma-roja.spec.ts` aflojada de `/problema [ABC] detectado/` a `/problema [ABC]/` para tolerar la expansión pedagógica

**106/106 E2E + 28/28 Rust + lint limpio.** La llave JSON `sugerencia` no cambió — anotaciones persistidas viejas siguen parseando sin migración.

## Decisiones de la sesión 15

| Decisión | Por qué |
|---|---|
| **Mantener la llave JSON `sugerencia`** en lugar de renombrar a `reemplazo` | Tres razones: (1) anotaciones existentes en docs persistidos siguen parseando sin migración; (2) breaking change al wire contract con el modelo no rinde valor real — la confusión era semántica, no nominal; (3) el nombre del campo no contamina la UI, que sí usa "Reemplazar". |
| **Ampliar `mensaje` de 25 a 50 palabras** | El sabio necesita espacio para explicar el "porqué", no sólo el "qué". El caso de Tío Ben necesita ~30-40 palabras sólo para enunciar la regla académica con su excepción. 25 palabras forzaba telegrafías como "Plagio: cita". |
| **`sugerencia` opcional explícito en el prompt** | A veces el problema es conceptual (un argumento débil) y no hay un fragmento limpio que reemplace la cita. Hacer obligatoria la `sugerencia` empujaba al modelo a inventar reemplazos forzados que el usuario después tenía que descartar. Mejor: "si no podés dar un fragmento limpio, omití el campo". |
| **Comillas tipográficas en el bloque del reemplazo** | El glifo `"…"` lee instintivamente como "texto literal del documento". Es señalética micro pero cumple el rol de comunicar "este texto se pega tal cual" sin necesidad de un label adicional. |
| **Quitar el italic** del bloque del reemplazo | El italic comunicaba "esto es advice / comentario", lo opuesto de lo que queremos. La prosa real del documento es regular serif. |
| **Botón "Reemplazar"** en lugar de "Aplicar reemplazo" | Tres sílabas vs cinco; verbo en imperativo simple. El contexto del bloque "Reemplazar por: '...'" hace innecesario el sustantivo en el botón. |
| **Stub deriva sugerencias de la cita** (`\${A} (referencia)`) | Refleja honesta el contrato del sidecar real. Antes el stub tenía sugerencias como "Reescribe la apertura con la evidencia delante" — imperativos justo de los que estamos sacando al sabio real. Los stubs deben mentir lo mínimo posible. |
| **Sin migración de anotaciones viejas** | Las anotaciones persisten dentro del TipTap doc del ensayo. Una anotación vieja con `sugerencia: "Reformula X"` aplicada literalmente sí rompe el texto del usuario. Pero como cada `Aplicar` requiere acción manual y el usuario ve la sugerencia entes de cliquear, el daño es contenido. La alternativa (migración o stripping de sugerencias viejas) habría sido invasiva por un caso de borde. |

## Aprendido en sesión 15

- **Cuando un nombre de campo "hace dos cosas", la fix no es renombrar — es contar al productor del valor cuáles son las dos cosas que estás colapsando.** El campo `sugerencia` no estaba mal nombrado; estaba mal *instruido*. Apretar el prompt para que el modelo entienda la separación entre "advice" y "replacement text" arregla el bug sin tocar tipos ni wire contracts. La lección general: las APIs con shape liviana y prompts robustos > las APIs con shape rica y prompts permisivos.
- **El mismo string puede comunicar cosas distintas según la tipografía y el contexto.** El bloque del reemplazo cambió 0 caracteres del valor mostrado — sólo añadimos comillas, borde, y un label. Pero ahora lee como "texto del documento" en vez de "advice del sabio". El framing visual hace gran parte del trabajo cognitivo.
- **Stubs honestos pillan bugs que stubs ergonómicos no.** El stub viejo tenía sugerencias en imperativo, lo que enmascaraba el bug por meses — porque cuando un test las "aplicaba", lo único que se medía era que el reemplazo ocurría, no que el resultado se leía bien. El nuevo stub deriva sugerencias de la cita misma — más mecánico, pero refleja el contrato real. Si el contrato cambia, el stub falla en lugar de pasar silenciosamente.
- **Bugs reportados por uso real son los más valiosos.** Ningún linter ni test type podía pillar esto — sólo un usuario haciendo el flujo real con un modelo real podía ver que la sugerencia era pedagógica y el "Aplicar" no le servía. Inversión en make-the-app-usable retroalimenta directo en calidad del producto.

## Sesión 16 (próxima) — TBD

Algunas posibilidades con el sistema ya estable:
- **Histórico de versiones del ensayo** (snapshots + diff de score entre versiones — "subió 1.2 puntos en Coherencia").
- **Export** (markdown / PDF con o sin anotaciones).
- **Anotaciones por sabio en Lectura** (que las preguntas también puedan tagearse a un criterio y entren al benchmark si el usuario decide).
- **Comparador de ensayos** (dos benchmarks lado a lado).
- **PDF/Word como tipo de fuente** (parseo cliente o vía sidecar).

Esperar a que Noé use el flujo unos días antes de decidir.

## Aprendido en sesión 3

- **Reusar antes de reinventar** (lección dura, x2). Primero metí un shape `postit` paralelo y la tecla `N` creó dos notas (la mía + el sticky default de tldraw). Luego corregí con override del NoteShapeUtil pero seguí con un modal propio para crear y editar — que duplicaba el flow nativo de tldraw. La versión final: 100% flow nativo (N, click, escribir inline) + panel contextual lateral solo para autor/kind. Cuando una lib ya implementa drag/resize/atajos/inline-edit, override la **pieza visual** + persiste tus extras en `meta`. **Nunca dupliques el flow.**
- En tldraw v5 el `shapeUtils` prop **reemplaza por tipo** — pasar un util con el mismo `static type` que un default lo override.
- **`<Tldraw>` `tl-background`** intercepta pointer events sobre el canvas — UI overlay propio (panels, toolbars) debe vivir **fuera** del wrapper de Tldraw. Pasar el editor como prop.
- `shape.meta` es un `JsonObject` libre, perfecto para tus props extras sin tener que migrar el schema del shape oficial.
- `editor.store.listen(fn, { source: "user", scope: "document" })` filtra solo cambios del usuario al documento — clave para evitar autosave loops cuando aplicas `loadSnapshot` al montar.
- `getViewportPageBounds().center` reemplaza `getViewportPageCenter()` (renombrado en v5).
- `next/dynamic({ ssr: false })` es la forma idiomática para componentes client-only en App Router con `output: "export"` — más limpia que `useEffect+setMounted` y no dispara el lint `set-state-in-effect`.
- **Mount-on-open** es el patrón limpio para modales con state interno: en lugar de `if (!open) return null` con un useEffect que resetea, separar el wrapper que hace el `open` check del inner que tiene el state. Cada apertura es un mount fresh.
- **Capture phase + `stopImmediatePropagation`** para interceptar atajos antes de que la lib los reciba: `window.addEventListener("keydown", h, { capture: true })`.

## Aprendido en sesión 2

- TipTap 3 usa `Suggestion<I, P>` donde `P` es el tipo del item seleccionado. La forma idiomática es `P = SlashItem` (no envolverlo en una shape extra).
- React 19 trae lints estrictos: `set-state-in-effect` y `purity` (no llamar `Date.now()` durante render). Patrones que pasan limpio: lazy initial state (`useState(() => Date.now())`) y "controlled-at-init" components que se remontan con `key`.
- `output: "export"` + Tauri no permite rutas dinámicas con IDs desconocidos; SPA puro con state es la salida natural.
- Para `contentEditable` en React 19, el patrón limpio es: `useEffect(() => { ref.current.textContent = initial }, [])` solo en mount, y cambiar de "documento" remontando con `key`.
- TipTap's `characterCount.words()` es función — hay que invocarla.

## Aprendido en sesión 1

- `create-tauri-app` no tiene template Next.js; hay que scaffold con `create-next-app` y luego `tauri init` adentro. La ergonomía es buena.
- Tailwind 4 + `@theme` permite emitir tokens directamente como utilities (`bg-paper`, `text-em`, `border-rule-2`). No hay que duplicar la paleta en TS.
- `next/font/google` carga las 3 familias y expone CSS variables (`--font-newsreader`, `--font-inter`, `--font-jetbrains-mono`) que usamos en `@theme`.
- Hay un `~/package-lock.json` huérfano en el HOME que hace ruido a Turbopack. Pinneado con `turbopack.root` en `next.config.ts`. Si Noé limpia ese archivo, podemos quitar el pin.
- Rust 1.84.1 no compila Tauri 2 (varias crates piden `edition2024`). `rustup update stable` lo lleva a 1.95+ y fluye.
