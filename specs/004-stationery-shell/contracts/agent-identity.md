# Contract: `src/lib/agent-identity.ts`

The only definition of who the agents are. Specs 005 to 008 import it. Any new label map keyed by agent id is a defect.

```ts
export type AgentId = "em" | "sis" | "pra" | "cri";
export type AuthorId = AgentId | "tu";

export type Identity = {
  id: AuthorId;
  name: string;      // visible name
  lens: string;      // one sentence, used in tooltips
  Icon: React.ComponentType<{ size?: number }>; // glyph from ui/icons.tsx
  note: string;      // CSS var: note fill
  ink: string;       // CSS var: header and icon on the note
  text: string;      // CSS var: note body
  dot: string;       // CSS var: dot
  line: string;      // CSS var: underline; "tu" has none
  chipClass: string; // bg utility for icon chips
};

export const AGENTS: readonly Identity[];        // em, sis, pra, cri, in display order
export const NOTE_AUTHORS: readonly Identity[];  // tu first, then AGENTS
export function identityOf(id: unknown): Identity; // unknown or missing id returns tu
```

Colors live once, in `globals.css`; identity refers to them by variable. Exports that need resolved values (`toSvg`) read them with `getComputedStyle`.

| id | name | note | ink | text | dot | line |
|---|---|---|---|---|---|---|
| `em` | Evidencia | `#FFE08A` | `#6E4600` | `#2B2410` | `#E8B421` | `#F5C542` |
| `sis` | Sistemas | `#BDEBD6` | `#0D5E46` | `#0F2E24` | `#2FA57C` | `#7FD3AE` |
| `pra` | Práctica | `#CADDFF` | `#234A9C` | `#14264D` | `#4C7EE0` | Slice 0 |
| `cri` | Objeciones | `#E3D5FF` | `#563397` | `#2A1A4A` | `#9670E0` | `#B79AF0` |
| `tu` | Tú | `#FFFDF8` | `#1D1B18` | `#1D1B18` | none | none |

Lens copy comes from R7.1: Evidencia «Busca datos y pregunta de dónde sale cada afirmación.», Sistemas «Conecta ideas y mira el sistema detrás de cada caso.», Práctica «Aterriza la idea: qué harías el lunes con tu equipo.», Objeciones «Busca el mejor argumento en contra del tuyo.», Tú «Lo que anotas tú, con título si quieres.»

Replaces: `LecturaOverlay:18`, `PlumaRojaOverlay:69`, `AnnotationPopover:24`, `BenchmarkDrilldown:30`, `CouncilAvatars:14`, `SelectionMenu:8`, `NoteContextPanel:6`, `Annotation.ts:65`, `note-shape:36`, `Scorebar:16`.
