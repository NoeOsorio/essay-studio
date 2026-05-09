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
| Zustand | _futuro_ | global state |
| TipTap | _futuro_ | editor |
| tldraw | _futuro_ | canvas |
| Anthropic SDK | _futuro_ | `claude-sonnet-4-5` o más reciente |

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
│   │   ├── page.tsx             # ensambla la vista de escritura
│   │   └── globals.css          # tokens @theme + clases custom
│   ├── components/
│   │   ├── Topbar.tsx           # toolbar superior
│   │   ├── Scorebar.tsx         # score strip al pie
│   │   ├── editor/              # TipTap (futuro)
│   │   │   └── EditorPane.tsx   # placeholder con mock content
│   │   ├── canvas/              # tldraw (futuro)
│   │   │   ├── BoardPane.tsx
│   │   │   └── Postit.tsx
│   │   ├── council/             # avatares + UI del consejo
│   │   │   └── CouncilAvatars.tsx
│   │   └── ui/                  # primitivos compartidos
│   │       ├── Avatar.tsx
│   │       ├── Badge.tsx
│   │       ├── Button.tsx
│   │       ├── IconButton.tsx
│   │       └── icons.tsx
│   └── lib/
│       ├── agents/              # orquestación del consejo (futuro)
│       ├── claude/              # cliente Anthropic API (futuro)
│       └── storage/             # persistencia local (futuro)
├── src-tauri/                   # lado Rust de Tauri
│   ├── src/                     # main.rs, lib.rs (handlers Rust)
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

## Sesión 2 (próxima) — opciones

A definir con Noé. Candidatos por orden de impacto:

1. **TipTap editor real** sobre `EditorPane`, con bloques, slash menu, drag handles, anotaciones inline funcionales.
2. **tldraw canvas real** sobre `BoardPane`, con post-its arrastrables y conexiones.
3. **Layout de las otras 4 vistas** (Home, Lectura nueva, Mesa redonda, Pluma roja) como shells visuales.
4. **Persistencia local** (JSON en app data dir) — para que el documento se guarde entre sesiones.
5. **Primer agente con Anthropic API** (probablemente CR · Crítico, porque es el más fácil de probar contra prosa).

## Aprendido en sesión 1

- `create-tauri-app` no tiene template Next.js; hay que scaffold con `create-next-app` y luego `tauri init` adentro. La ergonomía es buena.
- Tailwind 4 + `@theme` permite emitir tokens directamente como utilities (`bg-paper`, `text-em`, `border-rule-2`). No hay que duplicar la paleta en TS.
- `next/font/google` carga las 3 familias y expone CSS variables (`--font-newsreader`, `--font-inter`, `--font-jetbrains-mono`) que usamos en `@theme`.
- Hay un `~/package-lock.json` huérfano en el HOME que hace ruido a Turbopack. Pinneado con `turbopack.root` en `next.config.ts`. Si Noé limpia ese archivo, podemos quitar el pin.
