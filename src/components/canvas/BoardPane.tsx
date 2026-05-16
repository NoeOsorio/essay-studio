"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import {
  createShapeId,
  getSnapshot,
  loadSnapshot,
  toRichText,
  type Editor,
  type TLComponents,
  type TLStoreSnapshot,
} from "tldraw";
import "tldraw/tldraw.css";

import { Badge } from "@/components/ui/Badge";
import { IconButton } from "@/components/ui/IconButton";
import { GroupIcon } from "@/components/ui/icons";
import { useStore } from "@/lib/store";
import { PergaminoNoteShapeUtil, type PostItMeta } from "./note-shape";
import { NoteContextPanel } from "./NoteContextPanel";
import { BoardToolbar, BoardZoom, type BoardTool } from "./BoardToolbar";
import type { Sage } from "@/lib/storage/types";

// Tldraw uses DOM APIs, so mount it client-only.
const Tldraw = dynamic(
  () => import("tldraw").then((m) => ({ default: m.Tldraw })),
  { ssr: false },
);

// Replaces the default note util by type ("note").
const SHAPE_UTILS = [PergaminoNoteShapeUtil];

// Hide tldraw's default chrome — we paint our own toolbar/zoom/header.
const COMPONENTS: TLComponents = {
  Toolbar: null,
  MainMenu: null,
  PageMenu: null,
  StylePanel: null,
  ZoomMenu: null,
  NavigationPanel: null,
  ActionsMenu: null,
  QuickActions: null,
  HelpMenu: null,
  DebugMenu: null,
  KeyboardShortcutsDialog: null,
  HelperButtons: null,
  TopPanel: null,
  SharePanel: null,
};

export function BoardPane() {
  const current = useStore((s) => s.current);
  const essayId = current?.id ?? "none";
  // Re-mount the canvas on essay switch — tldraw's local store is per
  // canvas, so we hydrate fresh from the new essay's snapshot.
  return <BoardPaneInner key={essayId} />;
}

function BoardPaneInner() {
  const updateBoard = useStore((s) => s.updateBoard);
  const initialSnapshot = useStore(
    (s) => s.current?.board as TLStoreSnapshot | null | undefined,
  );

  const [tool, setTool] = useState<BoardTool>("select");
  const [zoom, setZoom] = useState(1);
  const [counts, setCounts] = useState({ postits: 0, arrows: 0 });
  // Held in state (not a ref) so the NoteContextPanel can subscribe
  // to the editor's signals via useValue. Set once on mount.
  const [editor, setEditor] = useState<Editor | null>(null);
  const editorRef = useRef<Editor | null>(null);

  // Materialize sage interrogation results as post-its on the board
  // when the Lectura overlay finishes. The overlay dispatches the
  // event on `window` so we don't need to plumb the editor ref out.
  useEffect(() => {
    const handler = (e: Event) => {
      const ce = e as CustomEvent<{ sage: Sage; preguntas: string[] }>;
      const ed = editorRef.current;
      if (!ed) return;
      materializePreguntas(ed, ce.detail.sage, ce.detail.preguntas);
    };
    window.addEventListener("sage:materialize-preguntas", handler);
    return () =>
      window.removeEventListener("sage:materialize-preguntas", handler);
  }, []);

  return (
    <div className="board-grid relative h-full overflow-hidden">
      {/* Header */}
      <div className="absolute left-0 right-0 top-0 z-[2] flex items-center justify-between px-4 py-2.5 bg-paper-2 border-b border-rule-1">
        <div className="font-serif italic text-[16px] text-ink-1 truncate max-w-[60%]">
          Tablero
        </div>
        <div className="flex items-center gap-2">
          <Badge dotColor="bg-sis">
            {counts.postits} {counts.postits === 1 ? "nota" : "notas"}
          </Badge>
          <Badge dotColor="bg-ink-3">
            {counts.arrows} {counts.arrows === 1 ? "conexión" : "conexiones"}
          </Badge>
          <IconButton title="Agrupar (futuro)">
            <GroupIcon />
          </IconButton>
        </div>
      </div>

      <div className="absolute inset-0 pt-[44px]">
        <Tldraw
          shapeUtils={SHAPE_UTILS}
          components={COMPONENTS}
          onMount={(editor) => {
            editorRef.current = editor;
            setEditor(editor);

            if (initialSnapshot) {
              try {
                const migrated = migrateLegacyPostits(initialSnapshot);
                loadSnapshot(editor.store, migrated);
              } catch (err) {
                console.warn("loadSnapshot failed; starting empty", err);
              }
            }
            // Snapshots persist `selectedShapeIds`. Re-opening an essay
            // would auto-select whatever was selected when you closed
            // it, popping the NoteContextPanel open every time. Start
            // every session with a clean selection — explicit user
            // click is required to re-select.
            editor.selectNone();

            recomputeCounts(editor, setCounts);
            setZoom(editor.getZoomLevel());

            const unlistenStore = editor.store.listen(
              () => {
                const snap = getSnapshot(editor.store);
                updateBoard(snap);
                recomputeCounts(editor, setCounts);
              },
              { source: "user", scope: "document" },
            );

            const unlistenCamera = editor.store.listen(
              () => setZoom(editor.getZoomLevel()),
              { scope: "session" },
            );

            // Keep our toolbar's "tool" state in sync with tldraw's
            // current tool, so when the user uses keyboard shortcuts
            // (N for note, A/V for select, etc.) the highlight follows.
            const syncTool = () => {
              const t = editor.getCurrentToolId();
              if (t === "note") setTool("postit");
              else if (t === "arrow") setTool("arrow");
              else setTool("select");
            };
            const unlistenTool = editor.store.listen(syncTool, {
              scope: "session",
            });

            // Don't lock tools — tldraw default is "sticky": after
            // creating a note the tool stays active and every
            // subsequent click drops another empty note. Unlocking
            // means the note tool reverts to select after one
            // creation, while preserving the edit-in-place that
            // tldraw sets up internally (which our previous attempt
            // with `setCurrentTool('select')` accidentally cancelled,
            // breaking typing into the new note).
            editor.updateInstanceState({ isToolLocked: false });

            return () => {
              unlistenStore();
              unlistenCamera();
              unlistenTool();
            };
          }}
        />
      </div>

      <BoardToolbar
        active={tool}
        onTool={(t) => {
          setTool(t);
          const editor = editorRef.current;
          if (!editor) return;
          if (t === "postit") editor.setCurrentTool("note");
          else if (t === "arrow") editor.setCurrentTool("arrow");
          else editor.setCurrentTool("select");
        }}
        onMicTeaser={() => alert("Dictado · próximamente.")}
      />

      <BoardZoom
        zoom={zoom}
        onZoomIn={() => editorRef.current?.zoomIn()}
        onZoomOut={() => editorRef.current?.zoomOut()}
        onZoomFit={() => editorRef.current?.zoomToFit()}
      />

      {/* Sits OUTSIDE the Tldraw container so its clicks aren't
          intercepted by tldraw's background overlay. Receives the
          editor as a prop so it can still subscribe to selection. */}
      {editor ? <NoteContextPanel editor={editor} /> : null}
    </div>
  );
}

/**
 * Drop one note shape per pregunta, laid out in a grid centred on
 * the current viewport. Notes are tagged with `kind: "pregunta"` and
 * the sage as author, so they re-skin with the right colour + header
 * via PergaminoNoteShapeUtil.
 */
function materializePreguntas(
  editor: Editor,
  sage: Sage,
  preguntas: string[],
) {
  if (preguntas.length === 0) return;
  const center = editor.getViewportPageBounds().center;
  const W = 200;
  const H = 200;
  const GAP = 24;
  const cols = preguntas.length <= 3 ? preguntas.length : 3;
  const rows = Math.ceil(preguntas.length / cols);
  const totalW = cols * W + (cols - 1) * GAP;
  const totalH = rows * H + (rows - 1) * GAP;
  const startX = center.x - totalW / 2;
  const startY = center.y - totalH / 2;
  const now = Date.now();
  const tilt = [-0.025, 0.018, -0.012, 0.022, -0.02]; // subtle radians

  editor.createShapes(
    preguntas.map((text, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const meta: PostItMeta = {
        author: sage,
        kind: "pregunta",
        createdAt: now + i,
      };
      return {
        id: createShapeId(),
        type: "note" as const,
        x: startX + col * (W + GAP),
        y: startY + row * (H + GAP),
        rotation: tilt[i % tilt.length] ?? 0,
        props: {
          richText: toRichText(text),
          size: "s" as const,
          align: "start" as const,
          verticalAlign: "start" as const,
        },
        meta: {
          author: meta.author,
          kind: meta.kind,
          createdAt: meta.createdAt,
        },
      };
    }),
  );
}

function recomputeCounts(
  editor: Editor,
  setCounts: (c: { postits: number; arrows: number }) => void,
) {
  let postits = 0;
  let arrows = 0;
  for (const shape of editor.getCurrentPageShapes()) {
    if (shape.type === "note") postits += 1;
    else if (shape.type === "arrow") arrows += 1;
  }
  setCounts({ postits, arrows });
}

/**
 * Convert any leftover `type: "postit"` shapes (from the previous
 * custom-shape implementation) into the current `type: "note"` form,
 * preserving author / kind / text in `meta` + `richText`.
 *
 * `getSnapshot()` returns a TLEditorSnapshot shaped as
 * `{ document: { store, schema }, session }`, but `loadSnapshot()`
 * also accepts a bare TLStoreSnapshot (`{ store, schema }`). Walk
 * both layouts so we never miss the records.
 *
 * Idempotent: snapshots without legacy postits pass through
 * unchanged.
 */
function migrateLegacyPostits(snapshot: unknown): TLStoreSnapshot {
  const cloned = JSON.parse(JSON.stringify(snapshot)) as TLStoreSnapshot;

  type AnyRecord = {
    typeName?: string;
    type?: string;
    props?: Record<string, unknown>;
    meta?: Record<string, unknown>;
  };

  const candidates: Record<string, AnyRecord>[] = [];
  const root = cloned as {
    store?: Record<string, AnyRecord>;
    document?: { store?: Record<string, AnyRecord> };
  };
  if (root.store && typeof root.store === "object") candidates.push(root.store);
  if (root.document?.store && typeof root.document.store === "object") {
    candidates.push(root.document.store);
  }

  for (const store of candidates) {
    for (const key of Object.keys(store)) {
      const record = store[key];
      if (!record || record.typeName !== "shape" || record.type !== "postit") {
        continue;
      }

      const oldProps = record.props ?? {};
      const oldMeta = record.meta ?? {};
      const text = typeof oldProps.text === "string" ? oldProps.text : "";

      store[key] = {
        ...record,
        type: "note",
        props: {
          color: "yellow",
          labelColor: "black",
          size: "s",
          font: "draw",
          fontSizeAdjustment: 1,
          align: "start",
          verticalAlign: "start",
          growY: 0,
          url: "",
          richText: toRichText(text),
          scale: 1,
          textFirstEditedBy: null,
        },
        meta: {
          ...oldMeta,
          ...(oldProps.author !== undefined ? { author: oldProps.author } : {}),
          ...(oldProps.kind !== undefined ? { kind: oldProps.kind } : {}),
          ...(oldProps.createdAt !== undefined
            ? { createdAt: oldProps.createdAt }
            : {}),
        },
      };
    }
  }
  return cloned;
}
