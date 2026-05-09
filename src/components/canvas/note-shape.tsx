"use client";

import {
  HTMLContainer,
  NoteShapeUtil,
  toRichText,
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
 * Meta we tack onto every note. Existing notes (created by tldraw's
 * default tools before this util landed, or imported elsewhere) won't
 * have meta; we fall back to "TÚ · concepto" so they re-skin gracefully.
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

/**
 * Override of tldraw's default note. We keep all the built-in
 * behaviours (drag, resize, edit-in-place rich text, snapping, etc.)
 * and only swap the visual: paper-tone background tinted by the
 * post-it author, vintage tape on top, and a header with sage initials,
 * the kind label and a relative timestamp.
 */
export class PergaminoNoteShapeUtil extends NoteShapeUtil {
  override getDefaultProps() {
    const base = super.getDefaultProps();
    return {
      ...base,
      size: "s",
      align: "start",
      verticalAlign: "start",
      richText: toRichText(""),
    } as TLNoteShape["props"];
  }

  // For now, post-its are created and edited via our modal — not
  // tldraw's inline rich-text editor. Keeps the visual paint simple
  // and consistent. We'll wire up a re-open-modal-on-double-click in a
  // future session (or swap to RichTextLabel when sages need to edit
  // notes from the council).
  override canEdit(): boolean {
    return false;
  }

  override component(shape: TLNoteShape) {
    return <PergaminoNoteRenderer shape={shape} />;
  }
}

function PergaminoNoteRenderer({ shape }: { shape: TLNoteShape }) {
  const meta = (shape.meta ?? {}) as PostItMeta;
  const author = meta.author ?? "tu";
  const kind = meta.kind ?? "concepto";
  const createdAt = meta.createdAt;
  const theme = AUTHOR_THEME[author];
  const bodyText = richTextToPlain(shape.props.richText);

  // Notes are aspect-ratio-locked at 200x200; the visible size in
  // page coords scales with `props.scale`.
  const SIZE = 200;
  const w = SIZE * shape.props.scale;
  const h = SIZE * shape.props.scale;

  return (
    <HTMLContainer
      style={{
        position: "relative",
        width: w,
        height: h,
        pointerEvents: "all",
      }}
    >
      <div
        style={{
          position: "relative",
          width: "100%",
          height: "100%",
          background: theme.bg,
          color: theme.ink,
          border: `1px solid ${theme.border}`,
          borderRadius: 8,
          padding: "20px 14px 14px",
          fontFamily: "var(--font-serif)",
          fontSize: 14,
          lineHeight: 1.55,
          boxShadow:
            "0 6px 14px rgba(60,40,10,0.10), 0 1px 0 rgba(255,255,255,0.5) inset",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          gap: 8,
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
          }}
        />

        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            color: theme.accent,
            flex: "0 0 auto",
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

        {/* Body — plain text extracted from the shape's richText. We
            forgo tldraw's inline editor for now; editing happens via
            the modal. */}
        <div
          style={{
            flex: "1 1 auto",
            minHeight: 0,
            color: theme.ink,
            fontFamily: "var(--font-serif)",
            fontSize: 13,
            lineHeight: 1.5,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            overflow: "hidden",
            opacity: bodyText ? 1 : 0.5,
            fontStyle: bodyText ? "normal" : "italic",
          }}
        >
          {bodyText || "(post-it sin texto)"}
        </div>
      </div>
    </HTMLContainer>
  );
}

/**
 * Walk a TLRichText (TipTap-shaped JSON document) and concatenate its
 * text leaves, separating paragraphs with a newline. Good enough for
 * the post-it body which is plain text today.
 */
function richTextToPlain(rt: TLRichText): string {
  const parts: string[] = [];
  type Node = { type?: string; text?: string; content?: Node[] };
  const walk = (node: Node) => {
    if (typeof node.text === "string") {
      parts.push(node.text);
      return;
    }
    if (Array.isArray(node.content)) {
      for (const child of node.content) walk(child);
      if (node.type === "paragraph") parts.push("\n");
    }
  };
  walk(rt as Node);
  return parts.join("").replace(/\n+$/, "");
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
