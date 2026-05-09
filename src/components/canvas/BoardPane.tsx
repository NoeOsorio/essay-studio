"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  createShapeId,
  getSnapshot,
  loadSnapshot,
  type Editor,
  type TLComponents,
  type TLStoreSnapshot,
} from "tldraw";
import "tldraw/tldraw.css";

// Tldraw uses DOM APIs, so we only mount it on the client. Doing it
// via next/dynamic keeps the SSR pass clean without resorting to a
// useEffect-driven mounted flag.
const Tldraw = dynamic(
  () => import("tldraw").then((m) => ({ default: m.Tldraw })),
  { ssr: false },
);

import { Badge } from "@/components/ui/Badge";
import { IconButton } from "@/components/ui/IconButton";
import { GroupIcon } from "@/components/ui/icons";
import { useStore } from "@/lib/store";
import {
  PostItShapeUtil,
  POSTIT_INITIAL_W,
  POSTIT_INITIAL_H,
  type PostItShape,
} from "./postit-shape";
import { PostItModal, type PostItDraft } from "./PostItModal";
import { BoardToolbar, BoardZoom, type BoardTool } from "./BoardToolbar";

const SHAPE_UTILS = [PostItShapeUtil];

/**
 * Hide tldraw's default chrome — we render our own toolbar, zoom and
 * header to fit the Pergamino paper-tone palette.
 */
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

export function BoardPane() {
  const current = useStore((s) => s.current);
  // Mount + hydrate fresh on each essay switch. Tldraw's store is
  // local; when the user opens a different essay we re-mount the
  // whole canvas with the new snapshot.
  const essayId = current?.id ?? "none";
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
  // Where to drop the next post-it (in tldraw page coords).
  const dropPointRef = useRef<{ x: number; y: number } | null>(null);
  const editorRef = useRef<Editor | null>(null);

  // Open the modal; uses the center of the current viewport as the
  // drop point if no explicit one is set.
  const openModal = useMemo(
    () => () => {
      const editor = editorRef.current;
      if (!editor) return;
      if (!dropPointRef.current) {
        const { x, y } = editor.getViewportPageBounds().center;
        dropPointRef.current = { x: x - POSTIT_INITIAL_W / 2, y: y - POSTIT_INITIAL_H / 2 };
      }
      setModalOpen(true);
    },
    [],
  );

  // Global N key opens the modal. Skip when the user is typing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "n" && e.key !== "N") return;
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea, [contenteditable=true]")) return;
      // Don't trigger while a modifier is held (so Cmd+N etc. pass through).
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      e.preventDefault();
      dropPointRef.current = null;
      openModal();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openModal]);

  return (
    <div className="board-grid relative h-full overflow-hidden">
      {/* Header */}
      <div className="absolute left-0 right-0 top-0 z-[2] flex items-center justify-between px-4 py-2.5 bg-paper-2 border-b border-rule-1">
        <div className="font-serif italic text-[16px] text-ink-1 truncate max-w-[60%]">
          Tablero
        </div>
        <div className="flex items-center gap-2">
          <Badge dotColor="bg-sis">{counts.postits} {counts.postits === 1 ? "nota" : "notas"}</Badge>
          <Badge dotColor="bg-ink-3">{counts.arrows} {counts.arrows === 1 ? "conexión" : "conexiones"}</Badge>
          <IconButton title="Agrupar (futuro)">
            <GroupIcon />
          </IconButton>
        </div>
      </div>

      {/* The canvas */}
      <div className="absolute inset-0 pt-[44px]">
        <Tldraw
          shapeUtils={SHAPE_UTILS}
          components={HIDDEN_COMPONENTS}
          hideUi={false}
          onMount={(editor) => {
            editorRef.current = editor;

            // Hydrate from the saved snapshot exactly once on mount.
            if (initialSnapshot) {
              try {
                loadSnapshot(editor.store, initialSnapshot);
              } catch (err) {
                console.warn("loadSnapshot failed; starting empty", err);
              }
            }

            // Initial counts + zoom.
            recomputeCounts(editor, setCounts);
            setZoom(editor.getZoomLevel());

            // Subscribe to document-level changes for autosave.
            const unlistenStore = editor.store.listen(
              () => {
                const snap = getSnapshot(editor.store);
                updateBoard(snap);
                recomputeCounts(editor, setCounts);
              },
              { source: "user", scope: "document" },
            );

            // Camera changes update the zoom indicator.
            const unlistenCamera = editor.store.listen(
              () => setZoom(editor.getZoomLevel()),
              { scope: "session" },
            );

            // Double-click on empty space → create post-it modal at that point.
            const onPointerDown = (e: PointerEvent) => {
              if (e.detail < 2) return;
              const target = e.target as HTMLElement | null;
              if (target?.closest(".tl-shape")) return; // click on shape, not empty
              const pt = editor.screenToPage({ x: e.clientX, y: e.clientY });
              dropPointRef.current = {
                x: pt.x - POSTIT_INITIAL_W / 2,
                y: pt.y - POSTIT_INITIAL_H / 2,
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

      {/* Custom toolbar / zoom overlays */}
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
          } else if (t === "select") {
            editor.setCurrentTool("select");
          } else if (t === "group") {
            // Group = select tool with marquee — we just switch back.
            editor.setCurrentTool("select");
          }
        }}
        onMicTeaser={() => {
          // Hint until voice arrives in a future session.
          alert("Dictado · próximamente.");
        }}
      />

      <BoardZoom
        zoom={zoom}
        onZoomIn={() => editorRef.current?.zoomIn()}
        onZoomOut={() => editorRef.current?.zoomOut()}
        onZoomFit={() => editorRef.current?.zoomToFit()}
      />

      {/* Modal */}
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
    if (shape.type === "postit") postits += 1;
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
      x: center.x - POSTIT_INITIAL_W / 2,
      y: center.y - POSTIT_INITIAL_H / 2,
    };
  const id = createShapeId();
  editor.createShape({
    id,
    type: "postit",
    x: pos.x,
    y: pos.y,
    props: {
      w: POSTIT_INITIAL_W,
      h: POSTIT_INITIAL_H,
      text: draft.text,
      author: draft.author,
      kind: draft.kind,
      createdAt: Date.now(),
    },
  } satisfies Partial<PostItShape> & { id: PostItShape["id"]; type: "postit" });
  editor.setCurrentTool("select");
  editor.select(id);
}
