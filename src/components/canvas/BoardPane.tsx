"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  createShapeId,
  getSnapshot,
  loadSnapshot,
  toRichText,
  type Editor,
  type TLComponents,
  type TLNoteShape,
  type TLStoreSnapshot,
} from "tldraw";
import "tldraw/tldraw.css";

import { Badge } from "@/components/ui/Badge";
import { IconButton } from "@/components/ui/IconButton";
import { GroupIcon } from "@/components/ui/icons";
import { useStore } from "@/lib/store";
import {
  PergaminoNoteShapeUtil,
  type PostItMeta,
} from "./note-shape";
import { PostItModal, type PostItDraft } from "./PostItModal";
import { BoardToolbar, BoardZoom, type BoardTool } from "./BoardToolbar";

// Tldraw uses DOM APIs, so we only mount it on the client. Doing it
// via next/dynamic keeps the SSR pass clean without resorting to a
// useEffect-driven mounted flag.
const Tldraw = dynamic(
  () => import("tldraw").then((m) => ({ default: m.Tldraw })),
  { ssr: false },
);

// We replace the default note util — tldraw merges by `static type`,
// so passing this overrides the built-in NoteShapeUtil ("note" type).
const SHAPE_UTILS = [PergaminoNoteShapeUtil];

const HIDDEN_COMPONENTS: TLComponents = {
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

const NOTE_SIZE = 200;

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
  const [modalOpen, setModalOpen] = useState(false);
  const dropPointRef = useRef<{ x: number; y: number } | null>(null);
  const editorRef = useRef<Editor | null>(null);

  const openModal = useMemo(
    () => () => {
      const editor = editorRef.current;
      if (!editor) return;
      if (!dropPointRef.current) {
        const { x, y } = editor.getViewportPageBounds().center;
        dropPointRef.current = {
          x: x - NOTE_SIZE / 2,
          y: y - NOTE_SIZE / 2,
        };
      }
      setModalOpen(true);
    },
    [],
  );

  // Global N key opens our modal. Capture phase + stopImmediatePropagation
  // so tldraw's own "note tool" shortcut doesn't also fire (which would
  // drop a default sticky on next click).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "n" && e.key !== "N") return;
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea, [contenteditable=true]")) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      dropPointRef.current = null;
      openModal();
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () =>
      window.removeEventListener("keydown", onKey, { capture: true });
  }, [openModal]);

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
          components={HIDDEN_COMPONENTS}
          hideUi={false}
          onMount={(editor) => {
            editorRef.current = editor;

            if (initialSnapshot) {
              try {
                loadSnapshot(editor.store, initialSnapshot);
              } catch (err) {
                console.warn("loadSnapshot failed; starting empty", err);
              }
            }

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

            const onPointerDown = (e: PointerEvent) => {
              if (e.detail < 2) return;
              const target = e.target as HTMLElement | null;
              if (target?.closest(".tl-shape")) return;
              const pt = editor.screenToPage({ x: e.clientX, y: e.clientY });
              dropPointRef.current = {
                x: pt.x - NOTE_SIZE / 2,
                y: pt.y - NOTE_SIZE / 2,
              };
              openModal();
            };
            const container = editor.getContainer();
            container.addEventListener("pointerdown", onPointerDown);

            return () => {
              unlistenStore();
              unlistenCamera();
              container.removeEventListener("pointerdown", onPointerDown);
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
          if (t === "postit") {
            dropPointRef.current = null;
            openModal();
          } else if (t === "arrow") {
            editor.setCurrentTool("arrow");
          } else {
            editor.setCurrentTool("select");
          }
        }}
        onMicTeaser={() => {
          alert("Dictado · próximamente.");
        }}
      />

      <BoardZoom
        zoom={zoom}
        onZoomIn={() => editorRef.current?.zoomIn()}
        onZoomOut={() => editorRef.current?.zoomOut()}
        onZoomFit={() => editorRef.current?.zoomToFit()}
      />

      <PostItModal
        open={modalOpen}
        onCancel={() => {
          setModalOpen(false);
          setTool("select");
        }}
        onConfirm={(draft) => {
          createPostIt(editorRef.current, dropPointRef.current, draft);
          dropPointRef.current = null;
          setModalOpen(false);
          setTool("select");
        }}
      />
    </div>
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

function createPostIt(
  editor: Editor | null,
  point: { x: number; y: number } | null,
  draft: PostItDraft,
) {
  if (!editor) return;
  const center = editor.getViewportPageBounds().center;
  const pos =
    point ?? {
      x: center.x - NOTE_SIZE / 2,
      y: center.y - NOTE_SIZE / 2,
    };
  const id = createShapeId();
  const meta: PostItMeta = {
    author: draft.author,
    kind: draft.kind,
    createdAt: Date.now(),
  };
  editor.createShape<TLNoteShape>({
    id,
    type: "note",
    x: pos.x,
    y: pos.y,
    props: {
      richText: toRichText(draft.text),
    },
    meta,
  });
  editor.setCurrentTool("select");
  editor.select(id);
}
