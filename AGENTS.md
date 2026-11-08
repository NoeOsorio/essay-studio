# Para agentes que trabajen en este repo

Este archivo es la entrada para cualquier agente (Claude Code, Cursor, otros). Lee también [CLAUDE.md](CLAUDE.md) — tiene la memoria persistente entre sesiones del proyecto.

## Lo importante en una pasada

- App de escritorio: **Tauri 2 + Next.js 16 + Tailwind 4 + TypeScript strict**.
- Frontend en `src/`, lado Rust en `src-tauri/`, **sidecar de sabios** en `sidecar/` (Node + `@anthropic-ai/claude-agent-sdk`).
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
13. **Sabios via Agent SDK + Claude Code OAuth.** No metas `ANTHROPIC_API_KEY` ni `@anthropic-ai/sdk` directo. Todas las llamadas pasan por el sidecar Node usando la sesión OAuth compatible de Claude Code y los límites de su plan. No prometas crédito mensual separado ni permitas fallback a proveedores/API keys. Si tocas el sidecar, recuerda `npm run sidecar:build` antes de probar.

## MCP local

- Instalación para Codex, Claude Desktop y Claude Code: [docs/mcp-installation.md](docs/mcp-installation.md).

- `shared/mcp.ts` es el registro único de herramientas, esquemas y clasificación.
- `mcp/` es un paquete npm independiente (Node 22+) para el adaptador stdio.
- El MCP opera sobre instancias vivas de TipTap/tldraw en `src/lib/mcp/`, nunca
  escribiendo los JSON de ensayos desde un segundo proceso.
- Toda mutación comprueba ensayo, sesión y revisión antes de la transacción.
  No confirmes guardado hasta que la cola de persistencia termine correctamente.
- Verifica con datos desechables (`ESSAY_STUDIO_DATA_DIR` del lanzador), no con
  ensayos personales. No registres texto, credenciales ni descriptores privados.
- Instala dependencias con scripts deshabilitados; revisa cualquier script que
  una nueva plataforma necesite ejecutar. No cambies paquetes por `audit fix --force`.

## Calidad de los revisores

- El parser de anotaciones y verificación literal vive en
  `sidecar/src/annotation-parser.ts` y `review-contract.ts`, compartido con la UI
  y los benchmarks. No dupliques el motor de revisión para el examen.
- Los perfiles viven en `sidecar/src/model-profiles.ts`. No promociones un
  candidato ni afirmes disponibilidad o superioridad sin una corrida verificada.
- Validar y preparar un dry-run es gratuito; ejecutar modelos requiere un
  manifiesto concreto y aprobación de consumo. No ejecutes inferencia al probar
  importaciones, levantar el MCP o iniciar el sidecar.
- Conserva evidencia inválida visible como tal. Una cita que existe en una
  fuente no demuestra por sí sola apoyo semántico. No certifiques fuentes por
  memoria del modelo ni puntúes «sin AI slop» con una lista de palabras.
- Mantén privados los resultados y bibliotecas importadas. El corpus piloto
  sintético tiene claves provisionales, no aprobación humana inventada.

## Antes de escribir código de Next.js

Next.js 16 trae breaking changes vs 15. Cuando escribas algo no obvio, lee la guía relevante en `node_modules/next/dist/docs/` antes (especialmente `01-app/02-guides/` y `01-app/03-api-reference/`). Hereda deprecation warnings.

## Comandos

```bash
npm run dev              # Next.js dev (localhost:3000)
npm run lint             # ESLint
npm run build            # Build estático → ./out
npm run test:e2e         # Playwright keyboard / flow / sage suite (~30s)
npm run test:e2e:ui      # Playwright runner con UI interactiva
npm run sidecar:install  # deps del sidecar Node
npm run sidecar:build    # compila sidecar → sidecar/dist/sage.js
npm run tauri:dev        # Next dev + ventana Tauri + sidecar (primera vez ~5-10 min)
npm run tauri:build      # Build Tauri (.app / .dmg / .msi)

# Tests del lado Rust (storage round-trip, sanitización de IDs):
cd src-tauri && cargo test
```
