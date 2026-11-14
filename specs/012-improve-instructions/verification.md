# Verification: Improve Agent Instructions

Date: 2026-11-14. Test text only, none of Noe's essays.

## Floor
- tsc, lint (0 errors), cargo check, sidecar build: pass.
- Stub flow in the browser: Mejorar disabled when empty, rewrite replaces the text, undo line appears, Guardar enabled, «Volver a las tuyas» restores the exact original.

## Real rewrites (three cases from SC-001)
- Round 1 (out11): kept intent but long, invented a 150-word threshold and «no reescribas frases», which contradicts proposing text to paste.
- Round 2 (out12): short, but added scope (author, year, place for Fuentes; a remedy for Párrafos). Reviewer 3.7/5.
- Round 3 (out14): reviewer 4.3/5, Fuentes still added «por qué las eligió».
- Round 4 (out15): reviewer 4.5/5, all three pass (Ortografía 5, Párrafos 4.5, Fuentes 4). Remaining: Fuentes also asks about unsourced claims; Párrafos says its scope twice.
- Rules added to the rewrite prompt: two to four short sentences, under 500 characters; no invented thresholds; make concrete what the request already covers but add no tasks, remedies or new topics; do not say where or how to mark; say the scope once.

## Spelling agent with the improved instructions (SC-002)
- out13 (round 2 instructions) and out16 (round 4): all five planted mistakes found, nothing else commented, correct replacements. Reviewer 4.5/5 for both. Remaining: the «haber / a ver» explanation in out16 is imprecise; some replacements cover a few more words than needed.

## Real calls
Twelve rewrites and two spelling reviews.

## Real app (QA bundle)
- The button shows next to Instrucciones in Configurar agentes: app-real-boton.jpg.
- Pressing it with background control closed the sheet (the known background-click quirk), so the press in the real app was not seen. The rewrite itself was seen with real calls through the same sidecar.
- Full E2E: 114 passed.
