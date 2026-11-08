# UI Contract: what every component must satisfy

Checked mechanically after each slice (see quickstart.md) and by reviewers. Tasks refer to
rule N as RN (R1 to R11).

1. No arbitrary font size below 12 px: `grep -rE "text-\[(9|9\.5|10|10\.5|11|11\.5)px\]" src` returns nothing.
2. No `uppercase` utility on decorative labels: remaining `uppercase` uses are listed and justified
   in the review (target: zero).
3. No `seal`, `warn`, `ok` color utilities remain in `src/components`.
4. Sage utilities (`em`, `sis`, `pra`, `cri` and their `-bg`/`-ink`) appear only where a sage is
   identified: Avatar, annotation marks, note tints, sage names, pass chips.
5. `font-serif` appears only on essay content: TitleInput, the editor content (`.tiptap-content`),
   essay titles in EssayList, the HistoryOverlay preview, quoted essay text in findings
   (citation and replacement blocks) and board note bodies.
6. No em-dash in user-visible strings in `src/` and `src-tauri/src/` (comments excluded).
7. No English UI words, in particular "stale", "done", "just now". Placeholders of enabled
   inputs use ink-3 (7.3:1); ink-4 is only for disabled controls and non-text.
8. No dollar cost rendered in Interrogar or Evaluar panes.
9. Spanish copy uses tú; no vos verb forms (Picá, Instalalo, reabrí, Reiniciá, etc.).
10. Every `data-testid` stays unchanged.
11. No vendor, model or tool names in user-visible strings (Claude, Anthropic, model ids, Node,
    Homebrew, MCP) except inside the reviewer-model selector options.
