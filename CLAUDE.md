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

## Sesión 5 (próxima) — Los 4 sabios + Mesa redonda

Por el plan en Notion: generalizar `sage_interrogate` para `em`/`sis`/`pra`/`cri` (los prompts MD ya tienen las rutas listadas). Disparar los 4 en paralelo desde el overlay de lectura. Después, vista nueva **Mesa Redonda** con threading: tú aportas un punto, el sabio default responde primero, botones para invocar a sabios específicos. Persistencia en `essay.mesaRedonda`.

Setup previo del usuario antes de sesión 5: los archivos `prompts/el-sistemico.md`, `prompts/el-practico.md`, `prompts/el-critico.md` con cada persona afinada.

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
