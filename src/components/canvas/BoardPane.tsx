"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import {
  loadSnapshot,
  type TLShapeId,
  ShapeIndicatorOverlayUtil,
  toRichText,
  type Editor,
  type TLClickEventInfo,
  type TLComponents,
  type TLPointerEventInfo,
  type TLShape,
  type TLStoreSnapshot,
} from "tldraw";
import "tldraw/tldraw.css";

import { useStore } from "@/lib/store";
import { boardHasNotes } from "@/lib/board-empty";
import { registerPointerLanding } from "@/lib/canvas/note-motion";
import { PergaminoNoteShapeUtil } from "./note-shape";
import { NoteBar } from "./NoteBar";
import { NoteReading } from "./NoteReading";
import { linkFindingNote } from "@/lib/review/actions";
import { BoardEmpty } from "./BoardEmpty";
import { BoardToolbar, type BoardTool } from "./BoardToolbar";
import { persistBoardSnapshot, registerBoard } from "@/lib/mcp/board";
import { attachRunToEditor } from "@/lib/questions/run";
import { markWriterMovedCamera } from "@/lib/questions/landing";
import { AgentRunChips } from "@/components/questions/AgentRunChips";
import { LandedNoteActions } from "@/components/questions/LandedNoteActions";

// Tldraw uses DOM APIs, so mount it client-only.
const Tldraw = dynamic(
  () => import("tldraw").then((m) => ({ default: m.Tldraw })),
  { ssr: false },
);

// Replaces the default note util by type ("note").
const SHAPE_UTILS = [PergaminoNoteShapeUtil];

// Paper draws no outline on a note that is only hovered; only the selection
// gets one. Same type as the default, so this replaces it.
class SelectionOnlyIndicatorUtil extends ShapeIndicatorOverlayUtil {
  override getOverlays() {
    const selected = new Set(this.editor.getSelectedShapeIds());
    return super.getOverlays().map((o) => ({
      ...o,
      props: { ...o.props, idsToDisplay: o.props.idsToDisplay.filter((id) => selected.has(id)) },
    }));
  }
}
const OVERLAY_UTILS = [SelectionOnlyIndicatorUtil];

// Hide tldraw's default chrome — we paint our own toolbar and note bar.
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
  // A pick that was waiting belongs to the essay it started in.
  const seenEssay = useRef(essayId);
  useEffect(() => {
    if (seenEssay.current === essayId) return;
    seenEssay.current = essayId;
    useStore.getState().setLinkingFinding(null);
  }, [essayId]);
  // Re-mount the canvas on essay switch — tldraw's local store is per
  // canvas, so we hydrate fresh from the new essay's snapshot.
  return <BoardPaneInner key={essayId} essayId={essayId} />;
}

function BoardPaneInner({ essayId }: { essayId: string }) {
  const initialSnapshot = useStore(
    (s) => s.current?.board as TLStoreSnapshot | null | undefined,
  );

  const [tool, setTool] = useState<BoardTool>("select");
  // Same selector as the toolbar: the board is empty until the saved
  // snapshot holds a shape record.
  const empty = useStore((s) => !boardHasNotes(s.current?.board));
  // Held in state (not a ref) so the NoteBar can subscribe to the
  // editor's signals via useValue. Set once on mount.
  const [editor, setEditor] = useState<Editor | null>(null);
  const editorRef = useRef<Editor | null>(null);
  const surfaceRef = useRef<HTMLDivElement | null>(null);

  const linking = useStore((s) => s.linkingFindingId !== null);
  const focusNote = useStore((s) => (s.noteView?.focus ? s.noteView.id : null));

  // Pick mode: the next press on a note links it; anywhere else, or Esc,
  // cancels. Capture phase, so the board never sees the press.
  useEffect(() => {
    const surface = surfaceRef.current;
    if (!linking || !surface || !editor) return;
    document.documentElement.setAttribute("data-picking-note", "");
    const cancel = () => useStore.getState().setLinkingFinding(null);
    const onDown = (e: PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const findingId = useStore.getState().linkingFindingId;
      const point = editor.screenToPage({ x: e.clientX, y: e.clientY });
      const hit = editor.getShapeAtPoint(point, { hitInside: true, margin: 6 / editor.getZoomLevel() });
      cancel();
      if (hit && hit.type === "note" && findingId) linkFindingNote(findingId, hit.id);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopImmediatePropagation();
      cancel();
    };
    surface.addEventListener("pointerdown", onDown, true);
    window.addEventListener("keydown", onKey, true);
    return () => {
      document.documentElement.removeAttribute("data-picking-note");
      surface.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [linking, editor]);

  // Ver nota from a card: center and select the note, then its reading view opens (NoteReading).
  useEffect(() => {
    if (!focusNote || !editor) return;
    const shape = editor.getShape(focusNote as TLShapeId);
    if (!shape) return;
    editor.select(shape.id);
    const bounds = editor.getShapePageBounds(shape.id);
    if (bounds) editor.centerOnPoint(bounds.center, { animation: { duration: editor.options.animationMediumMs } });
  }, [focusNote, editor]);

  return (
    <div className="board-grid relative h-full overflow-hidden" data-board-surface>
      <div
        ref={surfaceRef}
        className="absolute inset-0"
        style={linking ? { cursor: "pointer" } : undefined}
      >
        <Tldraw
          shapeUtils={SHAPE_UTILS}
          overlayUtils={OVERLAY_UTILS}
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
            // Defense in depth against the "rogue selection on
            // reopen" bug: we already wipe selection state inside
            // the snapshot above, but tldraw applies the session in
            // a separate phase, so we also call selectNone() once
            // now and once on the next frame in case it gets
            // re-asserted after our sync call.
            editor.selectNone();
            requestAnimationFrame(() => editor.selectNone());

            // A dropped file must not become an asset inside the essay JSON.
            editor.registerExternalContentHandler("files", null);

            // Double-click on a note opens its reading view, not the text
            // editor. The reading view edits in place; Enter and a new note
            // still edit on the board. A double-click lands in one of two select states: idle
            // (note not yet selected, or the press came from the selection
            // box) and pointing_shape (the second press of a click pair on a
            // note), so both are covered.
            const openReading = (shape: TLShape | undefined | null): boolean => {
              if (!shape || shape.type !== "note" || editor.getIsReadonly()) return false;
              editor.select(shape.id);
              useStore.getState().openNote(shape.id);
              return true;
            };
            const idle = editor.getStateDescendant("select.idle") as unknown as {
              onDoubleClick: (info: TLClickEventInfo) => void;
            } | undefined;
            if (idle) {
              const original = idle.onDoubleClick.bind(idle);
              idle.onDoubleClick = (info) => {
                if (info.phase === "up" && !info.shiftKey && !info.ctrlKey) {
                  let shape: TLShape | undefined;
                  if (info.target === "shape") shape = info.shape;
                  else if (info.target === "selection") shape = editor.getOnlySelectedShape() ?? undefined;
                  else if (info.target === "canvas") {
                    const p = editor.inputs.getCurrentPagePoint();
                    shape =
                      editor.getHoveredShape() ??
                      editor.getSelectedShapeAtPoint(p) ??
                      editor.getShapeAtPoint(p, { margin: editor.options.hitTestMargin / editor.getZoomLevel(), hitInside: false });
                  }
                  if (openReading(shape)) return;
                }
                original(info);
              };
            }
            const pointing = editor.getStateDescendant("select.pointing_shape") as unknown as {
              onDoubleClick: (info: TLClickEventInfo) => void;
              onPointerUp: (info: TLPointerEventInfo) => void;
              hitShape?: TLShape;
              parent: { transition: (id: string, info?: unknown) => void };
            } | undefined;
            if (pointing) {
              const original = pointing.onDoubleClick.bind(pointing);
              // A press on the note that is already selected used to start
              // text editing, which would swallow the first click of a
              // double-click. It now only keeps the selection.
              const originalUp = pointing.onPointerUp.bind(pointing);
              pointing.onPointerUp = (info) => {
                const hit = pointing.hitShape;
                const alone = hit ? editor.getOnlySelectedShapeId() === hit.id : false;
                if (hit && hit.type === "note" && alone && !info.shiftKey && !info.ctrlKey && !info.accelKey) {
                  pointing.parent.transition("idle", info);
                  return;
                }
                originalUp(info);
              };
              pointing.onDoubleClick = (info) => {
                if (!info.shiftKey && !info.ctrlKey && openReading(pointing.hitShape)) {
                  pointing.parent.transition("idle", info);
                  return;
                }
                original(info);
              };
            }

            const unregisterBoard = registerBoard(editor, essayId);
            const unregisterLanding = registerPointerLanding(editor);
            // A question run follows its notes through deletes and undos.
            attachRunToEditor(editor);

            // Persist only what the user changed on the board. tldraw also
            // keeps a `user:` record for the local person in the document
            // scope, added the first time an essay opens (the editor syncs
            // it by itself, not the user). Treating that as a change would
            // save the essay, bump `updatedAt` and mark reviews out of date
            // just for opening it.
            const unlistenStore = editor.store.listen(
              (entry) => {
                const { added, updated, removed } = entry.changes;
                const isUser = (record: { typeName: string }) => record.typeName === "user";
                const changed =
                  Object.values(added).some((r) => !isUser(r)) ||
                  Object.values(updated).some(([, to]) => !isUser(to)) ||
                  Object.values(removed).some((r) => !isUser(r));
                if (changed) persistBoardSnapshot(editor);
              },
              { source: "user", scope: "document" },
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
              unregisterBoard();
              unregisterLanding();
              unlistenStore();
              unlistenTool();
            };
          }}
        />
      </div>

      {/* Everything below sits OUTSIDE the Tldraw container so its clicks
          aren't intercepted by tldraw's background overlay. The bar receives
          the editor as a prop so it can still subscribe to selection. */}
      <BoardEmpty empty={empty} />

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
        onZoomIn={() => {
          markWriterMovedCamera();
          const ed = editorRef.current;
          ed?.zoomIn(undefined, { animation: { duration: ed.options.animationMediumMs } });
        }}
        onZoomOut={() => {
          markWriterMovedCamera();
          const ed = editorRef.current;
          ed?.zoomOut(undefined, { animation: { duration: ed.options.animationMediumMs } });
        }}
        onFit={() => {
          // Ver todo is the writer's move: a running question run stops following.
          markWriterMovedCamera();
          editorRef.current?.zoomToFit();
        }}
      />

      {linking ? (
        <div
          role="status"
          data-testid="note-pick-pill"
          className="pointer-events-none absolute left-1/2 top-[16px] z-[3] -translate-x-1/2 rounded-full bg-sheet px-[14px] py-[8px] font-sans text-[13px] font-medium leading-[16px] text-ink-1 shadow-[0_0_0_1px_#1D1B1814,0_4px_14px_-4px_#1D1B182E]"
        >
          Elige una nota
        </div>
      ) : null}
      {editor ? <NoteBar editor={editor} /> : null}
      {editor ? <NoteReading editor={editor} /> : null}
      {editor ? <AgentRunChips editor={editor} /> : null}
      {editor ? <LandedNoteActions editor={editor} /> : null}
    </div>
  );
}

/**
 * Convert any leftover `type: "postit"` shapes (from the previous
 * custom-shape implementation) into the current `type: "note"` form,
 * preserving author / kind / text in `meta` + `richText`. Also
 * clears any persisted `selectedShapeIds` so reopening an essay
 * doesn't auto-pop the NoteBar for whatever shape was
 * selected at save time.
 *
 * `getSnapshot()` returns a TLEditorSnapshot shaped as
 * `{ document: { store, schema }, session }`, but `loadSnapshot()`
 * also accepts a bare TLStoreSnapshot (`{ store, schema }`). Walk
 * both layouts so we never miss the records.
 *
 * Idempotent.
 */
function migrateLegacyPostits(snapshot: unknown): TLStoreSnapshot {
  const cloned = JSON.parse(JSON.stringify(snapshot)) as TLStoreSnapshot;

  type AnyRecord = {
    typeName?: string;
    type?: string;
    props?: Record<string, unknown>;
    meta?: Record<string, unknown>;
    selectedShapeIds?: unknown[];
  };

  const candidates: Record<string, AnyRecord>[] = [];
  const root = cloned as {
    store?: Record<string, AnyRecord>;
    document?: { store?: Record<string, AnyRecord> };
    session?: {
      selectedShapeIds?: unknown[];
      pageStates?: Array<{ selectedShapeIds?: unknown[] }>;
    };
  };

  // Clear selection state at the session level so it doesn't get
  // re-applied when tldraw hydrates the snapshot.
  if (root.session) {
    if (Array.isArray(root.session.selectedShapeIds)) {
      root.session.selectedShapeIds = [];
    }
    if (Array.isArray(root.session.pageStates)) {
      for (const ps of root.session.pageStates) {
        if (Array.isArray(ps.selectedShapeIds)) ps.selectedShapeIds = [];
      }
    }
  }
  if (root.store && typeof root.store === "object") candidates.push(root.store);
  if (root.document?.store && typeof root.document.store === "object") {
    candidates.push(root.document.store);
  }

  for (const store of candidates) {
    for (const key of Object.keys(store)) {
      const record = store[key];
      if (!record) continue;

      // Clear selectedShapeIds on any instance / page_state record
      // — these are the record-level mirrors of session selection.
      if (
        (record.typeName === "instance" ||
          record.typeName === "instance_page_state") &&
        Array.isArray(record.selectedShapeIds)
      ) {
        record.selectedShapeIds = [];
      }

      if (record.typeName !== "shape" || record.type !== "postit") {
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
