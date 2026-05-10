# Para agentes que trabajen en este repo

Este archivo es la entrada para cualquier agente (Claude Code, Cursor, otros). Lee también [CLAUDE.md](CLAUDE.md) — tiene la memoria persistente entre sesiones del proyecto.

## Lo importante en una pasada

- App de escritorio: **Tauri 2 + Next.js 16 + Tailwind 4 + TypeScript strict**.
- Frontend en `src/`, lado Rust en `src-tauri/`.
- Diseño Pergamino paper-tone con consejo de 4 sabios (EM/SI/PR/CR) — los colores cargan voz semántica, **no sustituirlos por una paleta genérica**.
- Tokens viven en [src/app/globals.css](src/app/globals.css) bajo `@theme` (Tailwind 4 los expone como utilities: `bg-paper`, `text-em`, `border-rule-2`, etc.).
- Fuentes en [src/app/layout.tsx](src/app/layout.tsx) vía `next/font/google`: Newsreader (serif), Inter (sans), JetBrains Mono.

## Reglas de la casa

1. **TS strict, prohibido `any`.**
2. **Sin shadcn/ui, sin Radix, sin librerías de componentes externas.** Primitivos propios para preservar la identidad visual.
3. **Anthropic API key SOLO desde env (`ANTHROPIC_API_KEY`).** Nunca hardcoded, nunca en logs, nunca en el bundle del renderer. Las llamadas viajan por el lado Rust o un route handler.
4. **Conventional commits.**
5. **Pregunta antes de instalar deps.** No metas paquetes al `package.json` sin avisar.
6. **No refactores preventivos.**
7. **Cambios no triviales:** plan/diff antes de aplicar.
8. **Tradeoffs reales:** explícalos y deja que Noé decida.
9. **Una feature por sesión.** Scope apretado.
10. **Tauri dev requires Rust 1.88+** porque varias crates transitivas piden `edition2024`. Si tu rustc es viejo, corre `rustup update stable` (con permiso explícito de Noé).
11. **Antes de tocar keyboard handlers, edit modes, o el flow lista↔editor, corre `npm run test:e2e`.** Esa suite existe porque ese subsistema ya nos mordió dos veces. Si rompes algo, va a fallar en segundos en lugar de en QA manual.
12. **Reusar antes de reinventar.** Cuando una lib (tldraw, TipTap, etc.) ya implementa el comportamiento (drag, edit-in-place, atajos), override la pieza visual + persiste tus extras en `meta`. Nunca dupliques el flow.

## Antes de escribir código de Next.js

Next.js 16 trae breaking changes vs 15. Cuando escribas algo no obvio, lee la guía relevante en `node_modules/next/dist/docs/` antes (especialmente `01-app/02-guides/` y `01-app/03-api-reference/`). Hereda deprecation warnings.

## Comandos

```bash
npm run dev          # Next.js dev (localhost:3000)
npm run lint         # ESLint
npm run build        # Build estático → ./out
npm run test:e2e     # Playwright keyboard / flow suite (~25s)
npm run test:e2e:ui  # Playwright runner con UI interactiva
npm run tauri:dev    # Next dev + ventana Tauri (primera vez tarda 5-10 min compilando Rust)
npm run tauri:build  # Build Tauri (.app / .dmg / .msi)

# Tests del lado Rust (storage round-trip, sanitización de IDs):
cd src-tauri && cargo test
```
