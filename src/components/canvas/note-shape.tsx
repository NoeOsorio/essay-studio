"use client";

import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import {
  Box,
  Group2d,
  HTMLContainer,
  NoteShapeUtil,
  Rectangle2d,
  RichTextLabel,
  RichTextSVG,
  WeakCache,
  renderHtmlFromRichTextForMeasurement,
  toRichText,
  useEditor,
  useValue,
  type Editor,
  type NoteShapeOptions,
  type TLHandle,
  type TLNoteShape,
  type TLRichText,
} from "tldraw";
import { identityOf } from "@/lib/agent-identity";
import { NOTE_WIDTH, StickyNote, tiltOf } from "@/components/ui/StickyNote";
import { consumeLanding, isLanding } from "@/lib/canvas/note-motion";

export type PostItAuthor = "tu" | "em" | "sis" | "pra" | "cri";
export type PostItKind =
  | "concepto"
  | "pregunta"
  | "conexion"
  | "cita"
  | "critica";

/**
 * Meta we tack onto every note. Notes created before this util landed
 * (or via tldraw's default tools) won't have it; they render as Tú.
 * `createdAt` is still stamped but never drawn. `title` is optional plain
 * text: absent or empty means no title.
 */
export type PostItMeta = {
  author?: PostItAuthor;
  kind?: PostItKind;
  createdAt?: number;
  title?: string;
  /** Saved source a landed question came from. */
  fuenteId?: string;
};

// Paper R2.1: 22 top padding, 16 header, 10 gap, 20 bottom padding; 18 sides.
const PAD_TOP = 22;
const PAD_BOTTOM = 20;
const PAD_SIDE = 18;
const HEADER = 16;
const GAP = 10;
const TITLE_GAP = 2;
const LINE = 23;
const FONT_SIZE = 17;
const TEXT_WIDTH = NOTE_WIDTH - PAD_SIDE * 2;
/** Room for a title line and a body line, so an empty note does not jump when editing starts. */
const MIN_HEIGHT = PAD_TOP + HEADER + GAP + LINE + TITLE_GAP + LINE + PAD_BOTTOM;
const SERIF = "var(--font-serif)";
const PLACEHOLDER = "#B9B2A3";
const RING_GAP = "var(--color-board)";
const RING = "var(--color-selection)";

function titleOf(shape: TLNoteShape): string {
  const title = (shape.meta as PostItMeta).title;
  return typeof title === "string" ? title : "";
}

type Measured = { title: number; body: number };
const measuredCache = new WeakCache<TLNoteShape, Measured>();

/**
 * One measure for geometry, indicator and export: header, title and body
 * heights, and the note height they add up to. Reads the editing state, so
 * the placeholder title line counts while editing and the geometry that
 * depends on it is recomputed when editing starts or ends.
 */
export function measureNote(editor: Editor, shape: TLNoteShape) {
  const measured = measuredCache.get(shape, () => {
    const base = {
      fontStyle: "normal",
      fontFamily: SERIF,
      fontSize: FONT_SIZE,
      lineHeight: LINE / FONT_SIZE,
      maxWidth: TEXT_WIDTH,
      padding: "0px",
    };
    const title = titleOf(shape);
    const titleHeight = title === ""
      ? 0
      : Math.max(LINE, editor.textMeasure.measureText(title, { ...base, fontWeight: "600" }).h);
    const html = renderHtmlFromRichTextForMeasurement(editor, shape.props.richText);
    const bodyHeight = Math.max(
      LINE,
      editor.textMeasure.measureHtml(html, { ...base, fontWeight: "400" }).h,
    );
    return { title: titleHeight, body: bodyHeight };
  });
  const editing = editor.getEditingShapeId() === shape.id;
  const title = measured.title > 0 ? measured.title : editing ? LINE : 0;
  const text = title + (title > 0 ? TITLE_GAP : 0) + measured.body;
  const height = Math.max(MIN_HEIGHT, PAD_TOP + HEADER + GAP + text + PAD_BOTTOM);
  return { header: HEADER, title, body: measured.body, height };
}

/** The tilted outline of a note, in shape space. */
function tiltedPath(width: number, height: number, degrees: number): Path2D {
  const a = (degrees * Math.PI) / 180;
  const cx = width / 2;
  const cy = height / 2;
  const corners: [number, number][] = [[0, 0], [width, 0], [width, height], [0, height]];
  const path = new Path2D();
  corners.forEach(([x, y], i) => {
    const dx = x - cx;
    const dy = y - cy;
    const px = cx + dx * Math.cos(a) - dy * Math.sin(a);
    const py = cy + dx * Math.sin(a) + dy * Math.cos(a);
    if (i === 0) path.moveTo(px, py);
    else path.lineTo(px, py);
  });
  path.closePath();
  return path;
}

function boldRichText(text: string): TLRichText {
  return {
    type: "doc",
    content: text.split("\n").map((line) => ({
      type: "paragraph",
      ...(line === "" ? {} : { content: [{ type: "text", text: line, marks: [{ type: "bold" }] }] }),
    })),
  };
}

/**
 * Override of tldraw's default note. Reuses its behaviours (drag, snap,
 * inline rich-text editing) and swaps the visual for the stationery note
 * drawn by `ui/StickyNote`. Height is measured at read time from the
 * content, so old notes size correctly with no write and `growY` is never
 * written. Author, kind, createdAt and title live in `shape.meta`.
 */
export class PergaminoNoteShapeUtil extends NoteShapeUtil {
  override options: NoteShapeOptions = {
    ...this.options,
    getCustomDisplayValues: () => ({
      noteWidth: NOTE_WIDTH,
      noteHeight: MIN_HEIGHT,
      labelPadding: PAD_SIDE,
      labelFontFamily: SERIF,
      labelFontSize: FONT_SIZE,
      labelLineHeight: LINE / FONT_SIZE,
      labelHorizontalAlign: "start",
      labelVerticalAlign: "start",
    }),
  };

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

  // tldraw writes growY and fontSizeAdjustment here. Height is derived at
  // read time instead, so nothing is ever written on create, edit or open.
  override onBeforeCreate() {
    return undefined;
  }

  override onBeforeUpdate() {
    return undefined;
  }

  override getGeometry(shape: TLNoteShape) {
    const { title, body, height } = measureNote(this.editor, shape);
    const top = PAD_TOP + HEADER + GAP + title + (title > 0 ? TITLE_GAP : 0);
    return new Group2d({
      children: [
        new Rectangle2d({ width: NOTE_WIDTH, height, isFilled: true }),
        new Rectangle2d({
          x: PAD_SIDE,
          y: top,
          width: TEXT_WIDTH,
          height: body,
          isFilled: true,
          isLabel: true,
          excludeFromShapeBounds: true,
        }),
      ],
    });
  }

  // Clone handles are removed on purpose (FR-012); keyboard creation stays.
  override getHandles(): TLHandle[] {
    return [];
  }

  override hideSelectionBoundsFg() {
    return true;
  }

  override getIndicatorPath(shape: TLNoteShape): Path2D {
    // A single selected note draws its own ring in the renderer.
    if (this.editor.getOnlySelectedShapeId() === shape.id) return new Path2D();
    const { height } = measureNote(this.editor, shape);
    if (shape.rotation !== 0) {
      const plain = new Path2D();
      plain.rect(0, 0, NOTE_WIDTH, height);
      return plain;
    }
    return tiltedPath(NOTE_WIDTH, height, tiltOf(shape.id));
  }

  override component(shape: TLNoteShape) {
    return <PergaminoNoteRenderer shape={shape} />;
  }

  override toSvg(shape: TLNoteShape, ctx: Parameters<NoteShapeUtil["toSvg"]>[1]) {
    const meta = shape.meta as PostItMeta;
    const id = identityOf(meta.author);
    const title = titleOf(shape);
    const style = getComputedStyle(document.documentElement);
    const resolve = (value: string) => {
      const match = /^var\((--[^),]+)\)$/.exec(value);
      return match ? style.getPropertyValue(match[1]).trim() || value : value;
    };
    const serif = style.getPropertyValue("--font-serif").trim() || "serif";
    const sans = style.getPropertyValue("--font-sans").trim() || "sans-serif";
    const { title: titleHeight, body, height } = measureNote(this.editor, shape);
    const tilt = shape.rotation === 0 ? tiltOf(shape.id) : 0;
    const filterId = `note-shadow-${shape.id.replace(/:/g, "_")}`;
    ctx.addExportDef({
      key: filterId,
      getElement: () => (
        <filter id={filterId} x="-20%" y="-20%" width="140%" height="160%">
          <feDropShadow dx="0" dy="8" stdDeviation="7" floodColor="#3C2D0A" floodOpacity="0.3" />
        </filter>
      ),
    });
    const textTop = PAD_TOP + HEADER + GAP;
    const Icon = id.Icon;
    return (
      <g transform={`rotate(${tilt} ${NOTE_WIDTH / 2} ${height / 2})`}>
        <rect width={NOTE_WIDTH} height={height} rx={3} fill={resolve(id.note)} filter={`url(#${filterId})`} />
        <g transform={`translate(${PAD_SIDE} ${PAD_TOP})`} color={resolve(id.ink)}><Icon size={16} /></g>
        <text x={PAD_SIDE + 22} y={PAD_TOP + 12} fontFamily={sans} fontSize={12} fontWeight={600} fill={resolve(id.ink)}>{id.name}</text>
        {title !== "" ? (
          <RichTextSVG
            fontSize={FONT_SIZE} fontFamily={serif} lineHeight={LINE / FONT_SIZE}
            textAlign="start" verticalAlign="start" wrap richText={boldRichText(title)}
            labelColor={resolve(id.text)} padding={0} showTextOutline={false}
            bounds={new Box(PAD_SIDE, textTop, TEXT_WIDTH, titleHeight)}
          />
        ) : null}
        <RichTextSVG
          fontSize={FONT_SIZE} fontFamily={serif} lineHeight={LINE / FONT_SIZE}
          textAlign="start" verticalAlign="start" wrap richText={shape.props.richText}
          labelColor={resolve(id.text)} padding={0} showTextOutline={false}
          bounds={new Box(PAD_SIDE, textTop + (titleHeight > 0 ? titleHeight + TITLE_GAP : 0), TEXT_WIDTH, body)}
        />
        <g transform="translate(68 -11) rotate(-4)">
          <rect width={76} height={22} fill="#FFFDF5" fillOpacity={0.74} />
        </g>
      </g>
    );
  }
}

function PergaminoNoteRenderer({ shape }: { shape: TLNoteShape }) {
  const editor = useEditor();
  const titleRef = useRef<HTMLTextAreaElement>(null);

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
  // Lifted only while a drag moves this note, so arrow-key nudges never animate.
  const isLifted = useValue(
    "is lifted",
    () => editor.isIn("select.translating") && editor.getSelectedShapeIds().includes(shape.id),
    [editor, shape.id],
  );
  // Plays once, on the mount that follows pointer creation. Later mounts
  // (reopen, board toggle, culling) find the set empty and replay nothing.
  const [lands] = useState(() => isLanding(shape.id));
  useEffect(() => {
    consumeLanding(shape.id);
  }, [shape.id]);
  const height = useValue(
    "note height",
    () => measureNote(editor, shape).height,
    [editor, shape],
  );

  const id = identityOf((shape.meta as PostItMeta).author);
  const title = titleOf(shape);
  const tilt = shape.rotation === 0 ? tiltOf(shape.id) : 0;
  const { richText } = shape.props;
  const bodyVisible = isSelected || isEditing || !richTextIsEmpty(richText);

  const bodyKeyDown = (e: KeyboardEvent) => {
    if (editor.getEditingShapeId() !== shape.id) return;
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      editor.complete();
      return;
    }
    if (e.key !== "ArrowUp" || e.shiftKey || e.metaKey || e.ctrlKey || e.altKey) return;
    const rich = editor.getRichTextEditor();
    const field = titleRef.current;
    if (!rich || !field) return;
    const { selection } = rich.state;
    // Only from the first line of the body.
    if (!selection.empty || selection.$from.index(0) !== 0 || !rich.view.endOfTextblock("up")) return;
    e.preventDefault();
    field.focus();
    field.setSelectionRange(field.value.length, field.value.length);
  };

  return (
    <HTMLContainer style={{ pointerEvents: "all" }}>
      <div
        data-note-wrapper
        className={lands ? "note-land" : undefined}
        style={{
          position: "relative",
          width: NOTE_WIDTH,
          rotate: tilt === 0 ? undefined : `${tilt}deg`,
          transformOrigin: "50% 50%",
        }}
      >
        <div className="note-lift" data-lifted={isLifted}>
        <div
          aria-hidden="true"
          className="note-lift-shadow"
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: 3,
            pointerEvents: "none",
            boxShadow: "#3C2D0A59 0 18px 24px -10px",
          }}
        />
        <StickyNote author={id.id} authorTestId="note-author">
          <div style={{ display: "flex", flexDirection: "column", gap: TITLE_GAP, minHeight: height - PAD_TOP - HEADER - GAP - PAD_BOTTOM }}>
            {isEditing ? (
              <NoteTitleField editor={editor} shape={shape} title={title} fieldRef={titleRef} />
            ) : title !== "" ? (
              <div data-testid="note-title" style={{ fontWeight: 600, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
                {title}
              </div>
            ) : null}
            {bodyVisible ? (
              <RichTextLabel
                shapeId={shape.id}
                type="note"
                fontFamily={SERIF}
                fontSize={FONT_SIZE}
                lineHeight={LINE / FONT_SIZE}
                textAlign="start"
                verticalAlign="start"
                richText={richText}
                isSelected={isSelected}
                labelColor={id.text}
                wrap
                padding={0}
                showTextOutline={false}
                hasCustomTabBehavior={false}
                onKeyDown={bodyKeyDown}
                style={{ position: "relative", inset: "auto", width: "100%", height: "auto" }}
              />
            ) : null}
          </div>
        </StickyNote>
        </div>
        {isSelected ? (
          <div
            aria-hidden="true"
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: 3,
              pointerEvents: "none",
              boxShadow: `0 0 0 4px ${RING_GAP}, 0 0 0 6px ${RING}`,
            }}
          />
        ) : null}
      </div>
    </HTMLContainer>
  );
}

/**
 * The title while editing: a plain textarea controlled by `meta.title`.
 * Focus makes one history stopping point, so the whole title is one undo
 * step while every keystroke is saved. The draft keeps the caret steady if
 * the store updates a frame later; undo and MCP edits flow back in.
 */
function NoteTitleField({
  editor,
  shape,
  title,
  fieldRef,
}: {
  editor: Editor;
  shape: TLNoteShape;
  title: string;
  fieldRef: React.RefObject<HTMLTextAreaElement | null>;
}) {
  const [draft, setDraft] = useState(title);
  const [seen, setSeen] = useState(title);
  if (seen !== title) {
    setSeen(title);
    setDraft(title);
  }

  const push = (value: string) => {
    setDraft(value);
    editor.updateShape<TLNoteShape>({ id: shape.id, type: "note", meta: { ...shape.meta, title: value } });
  };
  const toBody = () => editor.getRichTextEditor()?.commands.focus("start");

  const onKeyDown = (e: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    e.stopPropagation();
    const el = e.currentTarget;
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
      e.preventDefault();
      if (e.shiftKey) editor.redo();
      else editor.undo();
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      el.blur();
      editor.complete();
      return;
    }
    const plain = !e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey;
    if (plain && (e.key === "Enter" || e.key === "Tab")) {
      e.preventDefault();
      toBody();
    } else if (plain && e.key === "ArrowDown" && el.selectionStart === el.value.length) {
      e.preventDefault();
      toBody();
    }
  };

  const text = { fontWeight: 600, whiteSpace: "pre-wrap", overflowWrap: "anywhere" } as const;
  return (
    <div style={{ display: "grid" }}>
      {/* Mirror keeps the field exactly as tall as its text, and shows the placeholder. */}
      <div
        aria-hidden="true"
        style={{ ...text, gridArea: "1 / 1", visibility: draft === "" ? "visible" : "hidden", color: PLACEHOLDER, pointerEvents: "none" }}
      >
        {draft === "" ? "Título" : `${draft}\n`}
      </div>
      <textarea
        ref={fieldRef}
        data-testid="note-title"
        aria-label="Título"
        rows={1}
        value={draft}
        onChange={(e) => push(e.target.value)}
        onFocus={() => editor.markHistoryStoppingPoint("note title")}
        onPointerDown={(e) => {
          editor.markEventAsHandled(e);
          e.stopPropagation();
        }}
        onKeyDown={onKeyDown}
        style={{
          gridArea: "1 / 1",
          font: "inherit",
          ...text,
          color: "inherit",
          background: "none",
          border: 0,
          padding: 0,
          margin: 0,
          outline: "none",
          resize: "none",
          overflow: "hidden",
          width: "100%",
          position: "relative",
          zIndex: 2,
          pointerEvents: "all",
        }}
      />
    </div>
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
