# Verification: Custom Agents

Date: 2026-11-14. Test data only (planted text, stub essays, `ESSAY_STUDIO_DATA_DIR` in scratch). None of Noe's essays were used.

## Floor
- `npx tsc --noEmit`, `npm run lint` (0 errors), `cargo check`, `npm run sidecar:build`: pass.
- Full E2E suite on a fresh server (port 3199, reuseExistingServer false): 114 passed.

## Real model runs (sidecar, custom agent «Ortografía», instruction «Revisa solo ortografía, acentos y puntuación. No opines del contenido.»)
Test text with five planted mistakes (Ademas, echo, tambien, dificil, haber) and one weak claim the agent must ignore.
- Run 8 (canPaste on and off): all five found, nothing off topic, replacements correct; with canPaste off no replacement is sent. Every finding was «alta».
- Run 9: added a severity rule. Severity calibrated, but two explanations were wrong («dos tildes», «perífrasis»).
- Run 10: added «no grammar terms; if unsure, just say how it is written» and «shortest quote». All five found in four cards, minimal quotes, correct replacements, plain one-line messages, nothing off topic.
- Five real calls in total.

## Independent reviewer (did not build it)
- Design against Paper R8.1 and R8.2: 4/5. Defects fixed afterwards: «Ortografía en Ortografía» on the card (the pass name now hides when it equals the agent name), «Nuevo agente» position (now right under the last custom agent), delete confirmation copy (now «¿Borrar este agente? Lo que ya corrigió se queda en tus ensayos.»). Kept on purpose: Guardar is disabled until something changes.
- Spelling output, run 10: 4/5 (run 9 was 3/5). Remaining notes: «alta» on «echo/hecho» and «haber/a ver» (both change the meaning, so defensible); one run only, variance not measured.

## Greps
- No middle dot in src/components/settings, src/lib/agent-identity.ts, sidecar/src/prompts.ts, src-tauri/src/agents.rs, src-tauri/src/menu.rs.

## Real app (QA bundle, scratch data)
- Ajustes opens from the app menu («Ajustes…») and lists the saved agent: app-real-ajustes.jpg.
- Revisar ensayo shows Ortografía as a fourth option, on by default. Found and fixed here: tile names were cut («Coheren…»); tiles now grow to fit.
- A real review (four calls) saved three Ortografía findings with its name, color and correct text to paste; its underlines are pink in the editor: app-real-revision.jpg.
- The four built-in checks also marked every sentence of this deliberately bad test text, so the stamp reads 1.5. That is the built-in reviewers' behavior, unchanged by this spec.

## Not seen
- Hazme preguntas with a custom asking agent in the real app (only in the stub).
- Board notes and SVG export from a deleted custom agent (type-checked only).
- Run-to-run variance of the spelling agent (one graded run).
