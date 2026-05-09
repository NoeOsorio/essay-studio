"use client";

import {
  BaseBoxShapeUtil,
  HTMLContainer,
  T,
  type RecordProps,
} from "tldraw";

export type PostItAuthor = "tu" | "em" | "sis" | "pra" | "cri";
export type PostItKind =
  | "concepto"
  | "pregunta"
  | "conexion"
  | "cita"
  | "critica";

/**
 * Tell tldraw that "postit" is a known shape with these props,
 * so `TLShape['type']` includes it and `editor.createShape<PostItShape>`
 * type-checks.
 */
declare module "@tldraw/tlschema" {
  interface TLGlobalShapePropsMap {
    postit: {
      w: number;
      h: number;
      text: string;
      author: PostItAuthor;
      kind: PostItKind;
      createdAt: number;
    };
  }
}

import type { TLShape } from "tldraw";
export type PostItShape = Extract<TLShape, { type: "postit" }>;

const POSTIT_W = 224;
const POSTIT_H = 132;

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

/**
 * The post-it color is driven by the AUTHOR (sage). When TÚ writes,
 * the post-it is paper-toned. When a sage writes, it picks up the
 * sage's tinted background. This matches the Pergamino direction.
 */
const AUTHOR_THEME: Record<
  PostItAuthor,
  { bg: string; ink: string; border: string; accent: string }
> = {
  tu: {
    bg: "var(--color-paper-2)",
    ink: "var(--color-ink-1)",
    border: "var(--color-rule-2)",
    accent: "var(--color-ink-2)",
  },
  em: {
    bg: "var(--color-em-bg)",
    ink: "var(--color-em-ink)",
    border: "rgba(176,122,31,0.3)",
    accent: "var(--color-em)",
  },
  sis: {
    bg: "var(--color-sis-bg)",
    ink: "var(--color-sis-ink)",
    border: "rgba(46,126,114,0.3)",
    accent: "var(--color-sis)",
  },
  pra: {
    bg: "var(--color-pra-bg)",
    ink: "var(--color-pra-ink)",
    border: "rgba(177,75,54,0.3)",
    accent: "var(--color-pra)",
  },
  cri: {
    bg: "var(--color-cri-bg)",
    ink: "var(--color-cri-ink)",
    border: "rgba(110,79,168,0.3)",
    accent: "var(--color-cri)",
  },
};

const postitProps: RecordProps<PostItShape> = {
  w: T.number,
  h: T.number,
  text: T.string,
  author: T.literalEnum("tu", "em", "sis", "pra", "cri"),
  kind: T.literalEnum("concepto", "pregunta", "conexion", "cita", "critica"),
  createdAt: T.number,
};

export class PostItShapeUtil extends BaseBoxShapeUtil<PostItShape> {
  static override type = "postit" as const;
  static override props = postitProps;

  override getDefaultProps(): PostItShape["props"] {
    return {
      w: POSTIT_W,
      h: POSTIT_H,
      text: "",
      author: "tu",
      kind: "concepto",
      createdAt: Date.now(),
    };
  }

  override canEdit() {
    return false;
  }

  override canResize() {
    return true;
  }

  override component(shape: PostItShape) {
    return <PostItRenderer shape={shape} />;
  }

  override getIndicatorPath(shape: PostItShape) {
    const path = new Path2D();
    // Rounded rectangle approximated with quadratic curves; falls back
    // to plain rect on browsers that don't support roundRect.
    if (typeof (path as Path2D & { roundRect?: unknown }).roundRect === "function") {
      (path as unknown as { roundRect: (x: number, y: number, w: number, h: number, r: number) => void })
        .roundRect(0, 0, shape.props.w, shape.props.h, 8);
    } else {
      path.rect(0, 0, shape.props.w, shape.props.h);
    }
    return path;
  }
}

function PostItRenderer({ shape }: { shape: PostItShape }) {
  const { text, author, kind, w, h, createdAt } = shape.props;
  const theme = AUTHOR_THEME[author];

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
          padding: "18px 14px 14px",
          fontFamily: "var(--font-serif)",
          fontSize: 13.5,
          lineHeight: 1.5,
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
            width: 48,
            height: 14,
            background: "rgba(120,100,60,0.20)",
            boxShadow: "0 1px 0 rgba(255,255,255,0.4) inset",
            pointerEvents: "none",
          }}
        />

        {/* Header: initials + kind + relative time */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            color: theme.accent,
          }}
        >
          <span
            style={{
              width: 20,
              height: 20,
              borderRadius: "50%",
              display: "grid",
              placeItems: "center",
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              fontWeight: 500,
              border: "1px solid currentColor",
              color: theme.accent,
              background:
                author === "tu" ? "var(--color-paper-3)" : "transparent",
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
        </div>

        {/* Body */}
        <div
          style={{
            flex: 1,
            margin: 0,
            fontSize: 13,
            lineHeight: 1.5,
            overflow: "hidden",
            color: theme.ink,
            opacity: text ? 1 : 0.5,
            fontStyle: text ? "normal" : "italic",
          }}
        >
          {text || "(post-it sin texto)"}
        </div>
      </div>
    </HTMLContainer>
  );
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

export const POSTIT_INITIAL_W = POSTIT_W;
export const POSTIT_INITIAL_H = POSTIT_H;
