"use client";

import dynamic from "next/dynamic";
import { useRef, useState } from "react";
import {
  loadSnapshot,
  ShapeIndicatorOverlayUtil,
  toRichText,
  type Editor,
  type TLComponents,
  type TLStoreSnapshot,
} from "tldraw";
import "tldraw/tldraw.css";

import { useStore } from "@/lib/store";
import { boardHasNotes } from "@/lib/board-empty";
import { registerPointerLanding } from "@/lib/canvas/note-motion";
import { PergaminoNoteShapeUtil } from "./note-shape";
import { NoteBar } from "./NoteBar";
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

  return (
    <div className="board-grid relative h-full overflow-hidden" data-board-surface>
      <div className="absolute inset-0">
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
        onFit={() => {
          // Ver todo is the writer's move: a running question run stops following.
          markWriterMovedCamera();
          editorRef.current?.zoomToFit();
        }}
      />

      {editor ? <NoteBar editor={editor} /> : null}
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
