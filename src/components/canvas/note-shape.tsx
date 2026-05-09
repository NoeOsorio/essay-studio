"use client";

import {
  HTMLContainer,
  NoteShapeUtil,
  RichTextLabel,
  toRichText,
  useEditor,
  useValue,
  type TLNoteShape,
  type TLRichText,
} from "tldraw";

export type PostItAuthor = "tu" | "em" | "sis" | "pra" | "cri";
export type PostItKind =
  | "concepto"
  | "pregunta"
  | "conexion"
  | "cita"
  | "critica";

/**
 * Meta we tack onto every note. Notes created before this util landed
 * (or via tldraw's default tools without going through our context
 * panel) won't have meta; we fall back to "TÚ · concepto" so they
 * re-skin gracefully.
 */
export type PostItMeta = {
  author?: PostItAuthor;
  kind?: PostItKind;
  createdAt?: number;
};

const AUTHOR_INITIALS: Record<PostItAuthor, string> = {
  tu: "TÚ",
  em: "EM",
  sis: "SI",
  pra: "PR",
  cri: "CR",
};

const KIND_LABEL: Record<PostItKind, string> = {
  concepto: "CONCEPTO",
  pregunta: "PREGUNTA",
  conexion: "CONEXIÓN",
  cita: "CITA",
  critica: "CRÍTICA",
};

const AUTHOR_THEME: Record<
  PostItAuthor,
  { bg: string; ink: string; border: string; accent: string; iniBg: string }
> = {
  tu: {
    bg: "var(--color-paper-2)",
    ink: "var(--color-ink-1)",
    border: "var(--color-rule-2)",
    accent: "var(--color-ink-2)",
    iniBg: "var(--color-paper-3)",
  },
  em: {
    bg: "var(--color-em-bg)",
    ink: "var(--color-em-ink)",
    border: "rgba(176,122,31,0.3)",
    accent: "var(--color-em)",
    iniBg: "transparent",
  },
  sis: {
    bg: "var(--color-sis-bg)",
    ink: "var(--color-sis-ink)",
    border: "rgba(46,126,114,0.3)",
    accent: "var(--color-sis)",
    iniBg: "transparent",
  },
  pra: {
    bg: "var(--color-pra-bg)",
    ink: "var(--color-pra-ink)",
    border: "rgba(177,75,54,0.3)",
    accent: "var(--color-pra)",
    iniBg: "transparent",
  },
  cri: {
    bg: "var(--color-cri-bg)",
    ink: "var(--color-cri-ink)",
    border: "rgba(110,79,168,0.3)",
    accent: "var(--color-cri)",
    iniBg: "transparent",
  },
};

const HEADER_HEIGHT = 30;
const NOTE_W = 200;
const NOTE_H = 200;

/**
 * Override of tldraw's default note. Reuses all the built-in
 * behaviours (drag, resize, snap, inline rich-text editing, native
 * keyboard shortcuts) and only swaps the visual: paper-tone
 * background tinted by the post-it author, vintage tape on top, and
 * a header row with sage initials + kind label + relative timestamp.
 *
 * The author and kind live in `shape.meta`. They're assigned via the
 * NoteContextPanel that appears when a single note is selected, not
 * via a modal — the creation flow stays 100% native (click N, click
 * canvas, type, Esc).
 */
export class PergaminoNoteShapeUtil extends NoteShapeUtil {
  override getDefaultProps() {
    const base = super.getDefaultProps();
    // Smaller font + start-anchored text feels more like a Pergamino
    // post-it than tldraw's default centered sticky.
    return {
      ...base,
      size: "s",
      align: "start",
      verticalAlign: "start",
      richText: toRichText(""),
    } as TLNoteShape["props"];
  }

  override component(shape: TLNoteShape) {
    return <PergaminoNoteRenderer shape={shape} />;
  }
}

function PergaminoNoteRenderer({ shape }: { shape: TLNoteShape }) {
  const editor = useEditor();

  const isSelected = useValue(
    "is selected",
    () => editor.getOnlySelectedShapeId() === shape.id,
    [editor, shape.id],
  );
  const isEditing = useValue(
    "is editing",
    () => editor.getEditingShapeId() === shape.id,
    [editor, shape.id],
  );

  const meta = (shape.meta ?? {}) as PostItMeta;
  const author = meta.author ?? "tu";
  const kind = meta.kind ?? "concepto";
  const createdAt = meta.createdAt;
  const theme = AUTHOR_THEME[author];

  const { scale, growY, richText } = shape.props;
  const w = NOTE_W;
  const h = NOTE_H + growY;

  const isEmpty = richTextIsEmpty(richText);

  return (
    <HTMLContainer style={{ pointerEvents: "all" }}>
      <div
        style={{
          position: "relative",
          width: w * scale,
          height: h * scale,
          background: theme.bg,
          color: theme.ink,
          border: `1px solid ${theme.border}`,
          borderRadius: 8,
          boxShadow:
            "0 6px 14px rgba(60,40,10,0.10), 0 1px 0 rgba(255,255,255,0.5) inset",
          overflow: "hidden",
        }}
      >
        {/* Vintage tape on top */}
        <div
          aria-hidden
          style={{
            position: "absolute",
            left: "50%",
            top: -9,
            transform: "translateX(-50%) rotate(-2deg)",
            width: 56,
            height: 14,
            background: "rgba(120,100,60,0.20)",
            boxShadow: "0 1px 0 rgba(255,255,255,0.4) inset",
            pointerEvents: "none",
            zIndex: 2,
          }}
        />

        {/* Header overlay */}
        <div
          style={{
            position: "absolute",
            top: 8,
            left: 14,
            right: 14,
            height: HEADER_HEIGHT - 8,
            display: "flex",
            alignItems: "center",
            gap: 8,
            color: theme.accent,
            zIndex: 1,
            pointerEvents: "none",
          }}
        >
          <span
            style={{
              width: 22,
              height: 22,
              borderRadius: "50%",
              display: "grid",
              placeItems: "center",
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              fontWeight: 500,
              border: "1px solid currentColor",
              color: theme.accent,
              background: theme.iniBg,
              flex: "0 0 auto",
            }}
          >
            {AUTHOR_INITIALS[author]}
          </span>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              fontWeight: 600,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
            }}
          >
            {KIND_LABEL[kind]}
          </span>
          {createdAt !== undefined ? (
            <span
              style={{
                marginLeft: "auto",
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                color: "var(--color-ink-3)",
              }}
            >
              {relativeTime(createdAt)}
            </span>
          ) : null}
        </div>

        {/* Rich text body — reuses tldraw's built-in inline editor.
            The container is absolutely positioned so RichTextLabel
            gets correct bounds; the header sits above it visually. */}
        {(isSelected || isEditing || !isEmpty) && (
          <div
            style={{
              position: "absolute",
              top: HEADER_HEIGHT,
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 0,
            }}
          >
            <RichTextLabel
              shapeId={shape.id}
              type="note"
              fontFamily="var(--font-serif)"
              fontSize={14}
              lineHeight={1.5}
              textAlign="start"
              verticalAlign="start"
              richText={richText}
              isSelected={isSelected}
              labelColor={theme.ink}
              wrap={true}
              padding={14}
              showTextOutline={false}
              hasCustomTabBehavior={false}
              style={
                scale !== 1
                  ? {
                      transform: `scale(${scale})`,
                      transformOrigin: "top left",
                      width: w,
                      height: h - HEADER_HEIGHT,
                    }
                  : undefined
              }
            />
          </div>
        )}
      </div>
    </HTMLContainer>
  );
}

function richTextIsEmpty(rt: TLRichText): boolean {
  type Node = { type?: string; text?: string; content?: Node[] };
  const walk = (node: Node): boolean => {
    if (typeof node.text === "string" && node.text.length > 0) return false;
    if (Array.isArray(node.content)) {
      for (const child of node.content) if (!walk(child)) return false;
    }
    return true;
  };
  return walk(rt as Node);
}

function relativeTime(epochMs: number): string {
  const ms = Date.now() - epochMs;
  if (Number.isNaN(ms) || ms < 0) return "now";
  const s = Math.floor(ms / 1000);
  if (s < 5) return "just now";
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}
