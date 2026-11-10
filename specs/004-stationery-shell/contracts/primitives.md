# Contract: UI primitives and motion tokens

Used by this spec and by 005 to 008. No motion library.

## `Tooltip` (`src/components/ui/Tooltip.tsx`)

```ts
<Tooltip label="Nota" shortcut="N" side="top">{trigger}</Tooltip>
```

- First show waits 400 ms. While one is open, or within 300 ms of the last one closing, neighbors open at once (R7.3: "entre controles, sin espera").
- Enter: fade and `translateY(4px)` to 0, 120 ms ease-out. Reduced motion: fade only. Opened by keyboard focus: no delay, no animation.
- Shortcut renders only here, in Geist Mono. Portal to `body`; never intercepts pointer events.
- Sets `aria-describedby`. Icon-only triggers must also carry `aria-label`; native `title` is not used.

## `Popover` (`src/components/ui/Popover.tsx`)

```ts
type PopoverProps = {
  anchor: React.RefObject<HTMLElement | null>; // trigger; sets position and transform-origin
  open: boolean;
  onClose: () => void;           // called on Esc and outside pointer down
  side?: "top" | "bottom";       // default "bottom"
  align?: "start" | "center" | "end"; // default "end"
  keepFocus?: boolean;           // never moves focus; for surfaces on the board
  instant?: boolean;             // skips the opening animation; callers pass overlayInstant
  width?: number;                // px; default fits content
  testId?: string;               // data-testid on the sheet
  children: React.ReactNode;
};
```

- Solid sheet, `transform-origin` at the trigger. Enter under 320 ms with `--ease-out`, starting at `scale(0.96)`, never from `scale(0)`. With `instant`: no animation.
- Closes on outside pointer down and on Esc. Esc is handled in capture phase with `stopImmediatePropagation`, so tldraw and the sheet do not also react.
- Returns focus to the trigger unless `keepFocus`. Clamped to the window; flips side if it would overflow.
- Portal to `body`, always outside `<Tldraw>`.

## `Panel` (`src/components/ui/Panel.tsx`)

```ts
type PanelProps = {
  open: boolean;
  onClose: () => void;
  instant?: boolean;   // skips the opening animation; callers pass overlayInstant
  width?: number;
  testId?: string;
  children: React.ReactNode;
};
```

Same sheet, motion and Esc handling as `Popover` (capture phase, `stopImmediatePropagation`), but unanchored. Returns focus to the element that had it on open. Portal to `body`, always outside `<Tldraw>`.

## `useAnchor(name)` (`src/components/ui/useAnchor.ts`)

```ts
type AnchorName = "hazme" | "revisar" | "mas";
function useAnchor(name: AnchorName): React.RefObject<HTMLElement | null>;      // for the panel
function useRegisterAnchor(name: AnchorName): React.RefCallback<HTMLElement>;   // for the trigger
```

A small registry, so a panel opened from the native menu or from another surface finds its trigger. `hazme` resolves to whichever trigger is rendered, in the toolbar or on the empty board.

## `overlayInstant` (`src/lib/store.ts`)

One store flag, used by 005, 006 and 008. Overlay openers take `{ instant: true }`, read strictly as `opts?.instant === true`, so an opener passed straight as a click handler stays animated. The native menu bridge and button activation with `event.detail === 0` pass it. Popover and Panel receive it as `instant`. It clears on close.

## Sticky note (`src/components/ui/StickyNote.tsx`)

```ts
export const NOTE_WIDTH = 212;
export function tiltOf(id: string): number;   // degrees, FNV-1a hash into -2 to 2.5, skipping plus or minus 0.5
export function StickyNote(props: {
  author: AuthorId;
  title?: React.ReactNode;
  tilt?: number;
  tape?: boolean;
  children: React.ReactNode;
}): React.ReactElement;
```

Presentational, with no tldraw import. `note-shape`, the ghost notes, spec 006's tiles and spec 007's `FirstUse` and `Desk` all use it, so the note is drawn in one place.

## Note motion (`src/lib/canvas/note-motion.ts`)

```ts
export function markLanding(id: TLShapeId): void;                 // next mount of this id plays the landing, once
export function peelNote(editor: Editor, id: TLShapeId): void;    // deletes first, then animates a clone outside <Tldraw>
```

## Undo surface (`src/lib/editor/history.ts`)

```ts
export function setUndoSurface(surface: "board" | "document"): void;
```

Focus inside tldraw or the editor routes as today, and text fields elsewhere keep their native stack. Otherwise, `body` included, ⌘Z follows the last pointer surface. A capture-phase pointer listener writes the record: `.tl-container` and `[data-board-surface]` are `board`, the editor is `document`. Spec 005's `Finding` actions call `setUndoSurface("document")`. Spec 006 marks its overlays `data-board-surface`.

## Motion tokens (`globals.css`)

```css
--ease-out: cubic-bezier(0.23, 1, 0.32, 1);
--ease-standard: ease-out;
--dur-press: 120ms;
--dur-tooltip: 120ms;
--dur-peel: 240ms;
--dur-note: 280ms;
--dur-settle: 320ms;
--stagger: 60ms;
```

- Press: `:active` at `scale(0.97)` on pointer buttons.
- `peel` and `land` keyframes per R1.5 and R2.6, transform, opacity and clip-path only. The shadow is its own layer and only its opacity changes; `box-shadow` is never animated.
- `@media (prefers-reduced-motion: reduce)` sits next to each animation: no scale, no rotation, no loop; fades remain.

## Toolbar slot

`Topbar` renders the stamp position between Hazme preguntas and Revisar ensayo as an empty element, `data-slot="stamp"`. Spec 005 fills it.

## Testids (stable for 005 to 008)

| Control | Testid |
|---|---|
| Back to Ensayos | `topbar-back` |
| Saved icon | `topbar-save` |
| View switch | `topbar-view-editor`, `topbar-view-board` (`data-active`) |
| Hazme preguntas, toolbar | `topbar-hazme` |
| Hazme preguntas, empty board | `board-empty-cta` |
| Revisar ensayo | `topbar-pluma-roja` (kept) |
| Más trigger, panel | `topbar-more`, `more-panel` |
| Idioma | `topbar-language`, `topbar-language-es`, `topbar-language-en` (kept) |
| Tipo | `topbar-mode-academico`, `topbar-mode-blog` (`data-active`) |
| Fuentes, Rúbrica, Historial | `topbar-fuentes`, `topbar-rubrica` (kept), `topbar-historial` |
| Note bar | `note-bar`, `note-bar-author-<id>`, `note-bar-kind`, `note-bar-delete` |
| Board tools | `board-tool-select`, `board-tool-note`, `board-tool-arrow`, `board-tool-fit` |
| Note parts | `note-author`, `note-title` |
