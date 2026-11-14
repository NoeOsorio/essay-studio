# Paper values: Ajustes, agentes (R8.1, R8.2)

Read from Paper with get_jsx on 2026-11-14. The app root font is 14 px, so write every size in px (`text-[13px]`, `h-[40px]`), never rem utilities. Tokens: `--r-paper`, `--r-sheet`, `--r-shade`, `--r-ink`, `--r-ink-2`, `--r-ink-3` and the agent tokens already exist in globals.css under their app names; map them to what the code uses.

## Backdrop
- Over the whole window, a veil that dims the app (copy from the existing Panel/veil style used by other sheets).

## Sheet
- 920 x 660, centered under the top bar (Paper: left 260, top 118 in a 1440 x 900 window), background sheet, radius 16, overflow clip.
- Shadow: `0 0 0 1px #1D1B1814, 0 18px 40px -12px #3C2D0A29, 0 2px 6px #1D1B180F`.

## List column (left)
- Width 300, background paper, padding 28 top, 16 sides, 20 bottom, gap 20 between blocks.
- Title «Agentes»: Geist 20/26, weight 600, letter-spacing -0.01em, ink, padding 0 8.
- Rows: height 40, radius 10, padding 0 8, gap 10, gap 2 between rows. Selected row background shade.
  - Chip 28 x 28, radius 8, agent fill; icon 16 px, stroke 1.6, agent ink.
  - Name Geist 14/18 weight 500 ink, grows.
  - Built-ins end with a 14 px lock (rect x3 y6.2 w8 h5.6 rx1.2 and path `M4.8 6.2V4.6a2.2 2.2 0 0 1 4.4 0v1.6`, stroke ink-3 1.3).
- Group label «Tuyos»: Geist 13/16 weight 500 ink-3, padding 0 8 6.
- «Nuevo agente»: same row; chip is sheet with `0 0 0 1px #1D1B181A`, 14 px plus icon stroke ink-2; label ink-2.
- Search field (only past 8 custom agents) sits under the title, same width as rows.

## Detail column (right), custom agent (R8.1)
- Padding 28 top, 36 sides, 24 bottom, gap 24.
- Header: chip 44 x 44 radius 12 (icon 22 px stroke 1.5; it is the icon picker button), gap 14, name input height 44, radius 10, padding 0 12, background sheet, ring `0 0 0 1px #1D1B181F`, Geist 20/26 weight 600 letter-spacing -0.01em.
- Section labels («Qué hace», «Instrucciones», «Color»): Geist 13/16 weight 500 ink-2, gap 8 to their control.
- Segmented control: background shade, radius 10, padding 3, gap 2; segments height 30, padding 0 14, radius 8, Geist 13/16 weight 500; selected segment sheet with `0 1px 2px #1D1B181A, 0 0 0 1px #1D1B180F`, ink; others ink-2. Labels: Revisa tu ensayo, Te hace preguntas, Las dos.
- Instructions textarea: grows to fill, min height 150, radius 10, padding 12 14, ring `0 0 0 1px #1D1B181F`, Geist 15/22 ink.
- Toggles: gap 14 between rows, gap 12 to label; track 34 x 20 radius 10 padding 0 2, on = ink with knob right, knob 16 white radius 8; label Geist 14/18 ink. Labels: «Puede proponer texto para pegar», «Entra cada vez que revisas tu ensayo».
- Color swatches: 28 circles, gap 10; idle `inset 0 0 0 1px #1D1B1814`; selected `0 0 0 2px #FFFFFF, 0 0 0 4px ink`.
- Footer: space-between, padding-top 4. «Borrar agente» text button height 36 padding 0 12 radius 10 Geist 13/16 500 ink-2. «Guardar» height 36 padding 0 18 radius 10 background ink, white text Geist 13/16 500.

## Detail column, built-in agent (R8.2)
- Same padding, gap 28.
- Header: chip 44 radius 12 with the agent icon 22 px; name Geist 22/28 weight 600 letter-spacing -0.01em; gap 14 under it to the description Geist 15/22 ink-2, max width 520.
- «Así te corrige» label then gap 12. Each example: background paper, radius 12, padding 16 18, gap 10.
  - Sentence Newsreader 17/26 ink; marked words underlined 2px in the agent dot color (Evidencia `#E8B421`, Sistemas `#2FA57C`, Práctica `#4C7EE0`, Objeciones `#9670E0`), text-underline-position from-font.
  - Comment Geist 14/20 ink-2.
  - Replacement (optional) chip: background sheet, radius 8, padding 6 10, Newsreader 15/20 ink, aligned start.
- «Cuándo entra» label, gap 6, text Geist 14/20 ink.

## Custom colors (fill / ink)
rosa #FFC9D6 / #8A2846, durazno #FFD3B5 / #8A3D12, lima #DDEFB0 / #4A5E12, cielo #C3E8F5 / #11536B, arena #EADFC8 / #5E4A22, gris #E2E2DE / #45453F.

## Spelling icon (ortografia)
`M3 12.5L6.2 3.5h1.2l3.2 9M4.2 9.4h5.2` and `M10.8 11.2l1.4 1.4 2.4-3`, round caps and joins.
