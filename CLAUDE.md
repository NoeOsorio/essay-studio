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
| Zustand | 5.0.13 | state global del documento abierto + saveStatus |
| TipTap | 3.23.x | editor real con StarterKit + Placeholder + CharacterCount + slash commands custom |
| tldraw | _futuro_ (sesión 3) | canvas |
| Anthropic SDK | _futuro_ (sesión 4+) | `claude-sonnet-4-5` o más reciente |

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
│   │   ├── canvas/              # tldraw (sesión 3)
│   │   │   ├── BoardPane.tsx    # mock visual todavía
│   │   │   └── Postit.tsx
│   │   ├── council/
│   │   │   └── CouncilAvatars.tsx
│   │   └── ui/                  # primitivos compartidos
│   │       ├── Avatar.tsx
│   │       ├── Badge.tsx
│   │       ├── Button.tsx
│   │       ├── IconButton.tsx
│   │       └── icons.tsx
│   └── lib/
│       ├── store.ts             # Zustand: view, current essay, saveStatus, autosave
│       ├── storage/
│       │   ├── index.ts         # invoke() wrappers de los comandos Rust
│       │   └── types.ts         # Essay / EssayMeta / EssayMode
│       ├── agents/              # orquestación del consejo (sesión 4+)
│       └── claude/              # cliente Anthropic API (sesión 4+)
├── src-tauri/                   # lado Rust de Tauri
│   ├── src/
│   │   ├── main.rs
│   │   ├── lib.rs               # registra handlers de storage
│   │   └── storage.rs           # essay_list/read/write/delete
│   ├── capabilities/            # permisos Tauri 2
│   ├── icons/
│   └── tauri.conf.json
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
npm run dev          # Next.js dev server (localhost:3000)
npm run build        # build estático → ./out
npm run lint         # ESLint
npm run tauri:dev    # arranca Next dev + ventana Tauri
npm run tauri:build  # build Tauri (.app / .dmg / .msi según OS)
```

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

## Sesión 3 (próxima) — Tablero real (tldraw)

El plan en Notion lo describe completo. Resumen:

- Integrar tldraw en `BoardPane` (reemplaza el mock).
- Custom shape `PostIt` con `{ autor, tipo, texto, timestamp }` y los colores tipados.
- Crear post-it con tecla `n` o doble-click; modal pequeño para tipo + texto.
- Persistir el state del tablero **dentro del JSON del ensayo** (campo `tablero`), restaurar al abrir.
- Counter "X notas · Y conexiones" en el header del tablero, calculado en vivo.
- Toolbar lateral matching diseño (selector / sticky / flecha / grupo / micro).

Decisiones a confirmar antes: tldraw v3 vs v2, custom shape via shape API o meta data, persistir snapshot completo vs duplicar parts en nuestro modelo.

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
