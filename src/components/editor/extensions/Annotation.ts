// TipTap mark for Pluma Roja inline annotations.
//
// Renders as `<span class="anno" data-by="<agent id>" data-anno-id="..."
// data-pase="..." data-severidad="...">`. The .anno rules in globals.css,
// keyed on data-by, draw the per-agent underline.
//
// All annotation metadata (sage, pase, severidad, mensaje, reemplazo)
// is stored as mark attributes so it travels with the TipTap content
// — no separate side store. That means re-opening an essay just
// re-renders the marks for free.
//
// Sesión 16: el atributo antes se llamaba `sugerencia` y persistía
// como `data-sugerencia`. Ahora es `reemplazo` / `data-reemplazo`.
// El parseHTML acepta ambos para que anotaciones viejas guardadas en
// docs existentes sigan rindiéndose con el campo poblado; renderHTML
// sólo escribe el nuevo.
//
// Spec 005: `applyAnnotationReemplazo` is one isolated history step
// (closeHistory before and after). The review's own application, which
// must not be undoable, is `applyReview`, kept out of history.

import { Mark, mergeAttributes } from "@tiptap/core";
import { closeHistory } from "@tiptap/pm/history";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { ReviewEvidence, ReviewProvenance } from "@/lib/storage/types";
import { identityOf } from "@/lib/agent-identity";

export type AnnotationAttrs = {
  evidence?: ReviewEvidence[] | null;
  provenance?: ReviewProvenance | null;
  id: string | null;
  sage: "em" | "sis" | "pra" | "cri" | null;
  pase: "coherencia" | "estilo" | "argumento" | "apa" | null;
  severidad: "alta" | "media" | "baja" | null;
  mensaje: string | null;
  reemplazo: string | null;
  /** Optional id of the rubric criterio this annotation maps to. */
  criterioId: string | null;
};

// Transient visual effects on underlines (R4.3 draw and erase, R5.4
// narrowing). They live in a plugin as decorations, never in the document
// and never saved, and they survive ProseMirror redrawing the spans.
type Fx = { draw: Set<string>; erase: Set<string>; narrow: string | null };
type FxPatch = { draw?: string[]; erase?: string[]; narrow?: string | null; clear?: true };
const fxKey = new PluginKey<Fx>("annotationFx");
const FX_DRAW_MS = 400;
const FX_ERASE_MS = 700;

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    annotation: {
      /** Transient underline effects; see the annotationFx plugin. */
      annotationFx: (patch: FxPatch) => ReturnType;
      /**
       * Add an `annotation` mark over the given doc range. Used by the
       * Pluma Roja apply flow.
       */
      setAnnotation: (
        from: number,
        to: number,
        attrs: AnnotationAttrs,
      ) => ReturnType;
      /**
       * Remove the annotation mark with this id (the on-click "descartar"
       * action in the popover).
       */
      removeAnnotationById: (id: string) => ReturnType;
      /**
       * Replace the text under the annotation's mark with `reemplazo`
       * and remove the mark. Used by el popover/drilldown botón
       * "Reemplazar". Returns false (no-op) when the mark spans
       * multiple block nodes — those cases need manual editing.
       */
      applyAnnotationReemplazo: (id: string, reemplazo: string) => ReturnType;
      /** Strip every annotation mark from the document. */
      clearAllAnnotations: () => ReturnType;
      /**
       * A review landing: removes the marks with the given ids and adds
       * the new ones in one transaction kept out of the undo history, so
       * ⌘Z still undoes the last keystroke and never strips underlines.
       * Marks change no positions, so ranges located before the call stay
       * valid inside it.
       */
      applyReview: (args: {
        remove: string[];
        add: { from: number; to: number; attrs: AnnotationAttrs }[];
      }) => ReturnType;
    };
  }
}

function readJsonAttribute(element: HTMLElement, name: string): unknown {
  const raw = element.getAttribute(name);
  if (!raw) return null;
  try { return JSON.parse(raw) as unknown; } catch { return null; }
}

export const Annotation = Mark.create({
  name: "annotation",
  // Don't merge two adjacent annotation marks with different ids into
  // one — each sage's flag stays distinct even if they overlap.
  spanning: false,
  inclusive: false,
  excludes: "",

  addAttributes() {
    return {
      id: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-anno-id"),
        renderHTML: (attrs) =>
          attrs.id ? { "data-anno-id": String(attrs.id) } : {},
      },
      sage: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-sage"),
        renderHTML: (attrs) =>
          attrs.sage ? { "data-sage": String(attrs.sage) } : {},
      },
      pase: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-pase"),
        renderHTML: (attrs) =>
          attrs.pase ? { "data-pase": String(attrs.pase) } : {},
      },
      severidad: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-severidad"),
        renderHTML: (attrs) =>
          attrs.severidad
            ? { "data-severidad": String(attrs.severidad) }
            : {},
      },
      mensaje: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-mensaje"),
        renderHTML: (attrs) =>
          attrs.mensaje ? { "data-mensaje": String(attrs.mensaje) } : {},
      },
      reemplazo: {
        default: null,
        // Backward compat: anotaciones viejas guardadas con
        // data-sugerencia siguen poblando el campo. Nuevas se
        // escriben como data-reemplazo (renderHTML abajo).
        parseHTML: (el) =>
          el.getAttribute("data-reemplazo") ??
          el.getAttribute("data-sugerencia"),
        renderHTML: (attrs) =>
          attrs.reemplazo
            ? { "data-reemplazo": String(attrs.reemplazo) }
            : {},
      },
      evidence: {
        default: null,
        // Source verification is recalculated against the live library in UI.
        parseHTML: (el) => readJsonAttribute(el, "data-evidence"),
        renderHTML: (attrs) => attrs.evidence ? { "data-evidence": JSON.stringify(attrs.evidence) } : {},
      },
      provenance: {
        default: null,
        parseHTML: (el) => readJsonAttribute(el, "data-provenance"),
        renderHTML: (attrs) => attrs.provenance ? { "data-provenance": JSON.stringify(attrs.provenance) } : {},
      },
      criterioId: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-criterio-id"),
        renderHTML: (attrs) =>
          attrs.criterioId
            ? { "data-criterio-id": String(attrs.criterioId) }
            : {},
      },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-anno-id]" }];
  },

  renderHTML({ HTMLAttributes }) {
    const sage = HTMLAttributes["data-sage"] as
      | NonNullable<AnnotationAttrs["sage"]>
      | undefined;
    // `data-by` carries the agent id; the underline color is keyed on it
    // in globals.css. The id comes from the identity module.
    const by = sage ? identityOf(sage).id : "";
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        class: "anno",
        "data-by": by,
      }),
      0,
    ];
  },

  addProseMirrorPlugins() {
    const markName = this.name;
    return [
      new Plugin<Fx>({
        key: fxKey,
        state: {
          init: () => ({ draw: new Set(), erase: new Set(), narrow: null }),
          apply(tr, value) {
            const m = tr.getMeta(fxKey) as FxPatch | undefined;
            if (!m) return value;
            const next: Fx = { draw: new Set(value.draw), erase: new Set(value.erase), narrow: value.narrow };
            if (m.clear) {
              next.draw.clear();
              next.erase.clear();
            }
            m.draw?.forEach((id) => next.draw.add(id));
            m.erase?.forEach((id) => next.erase.add(id));
            if (m.narrow !== undefined) next.narrow = m.narrow;
            return next;
          },
        },
        props: {
          decorations(state) {
            const fx = fxKey.getState(state);
            if (!fx || (fx.draw.size === 0 && fx.erase.size === 0 && fx.narrow === null)) return null;
            const out: Decoration[] = [];
            state.doc.descendants((node, pos) => {
              if (!node.isText) return;
              for (const m of node.marks) {
                if (m.type.name !== markName) continue;
                const id = String(m.attrs.id);
                const to = pos + node.nodeSize;
                if (fx.draw.has(id)) out.push(Decoration.inline(pos, to, { class: "anno-draw" }));
                if (fx.erase.has(id)) out.push(Decoration.inline(pos, to, { class: "anno-erase" }));
                if (fx.narrow !== null && m.attrs.criterioId === fx.narrow) {
                  out.push(Decoration.inline(pos, to, { "data-narrowed-in": "" }));
                }
              }
            });
            return DecorationSet.create(state.doc, out);
          },
          attributes(state): Record<string, string> {
            return fxKey.getState(state)?.narrow != null ? { "data-annos-narrowed": "" } : {};
          },
        },
        view() {
          let timer: ReturnType<typeof setTimeout> | undefined;
          return {
            update(view) {
              const fx = fxKey.getState(view.state);
              if (!fx || timer || (fx.draw.size === 0 && fx.erase.size === 0)) return;
              timer = setTimeout(
                () => {
                  timer = undefined;
                  view.dispatch(view.state.tr.setMeta(fxKey, { clear: true } satisfies FxPatch).setMeta("addToHistory", false));
                },
                fx.erase.size > 0 ? FX_ERASE_MS : FX_DRAW_MS,
              );
            },
            destroy() {
              if (timer) clearTimeout(timer);
            },
          };
        },
      }),
    ];
  },

  addCommands() {
    return {
      annotationFx:
        (patch) =>
        ({ tr, dispatch }) => {
          if (dispatch) {
            tr.setMeta(fxKey, patch);
            tr.setMeta("addToHistory", false);
            dispatch(tr);
          }
          return true;
        },
      setAnnotation:
        (from, to, attrs) =>
        ({ tr, dispatch, state }) => {
          if (from >= to) return false;
          const max = state.doc.content.size;
          if (from < 0 || to > max) return false;
          const mark = this.type.create(attrs);
          if (dispatch) {
            tr.addMark(from, to, mark);
            dispatch(tr);
          }
          return true;
        },
      removeAnnotationById:
        (id) =>
        ({ tr, dispatch, state }) => {
          const positions: { from: number; to: number }[] = [];
          state.doc.descendants((node, pos) => {
            for (const m of node.marks) {
              if (m.type.name === "annotation" && m.attrs.id === id) {
                positions.push({ from: pos, to: pos + node.nodeSize });
              }
            }
            return true;
          });
          if (positions.length === 0) return false;
          if (dispatch) {
            for (const { from, to } of positions) {
              tr.removeMark(from, to, this.type);
            }
            dispatch(tr);
          }
          return true;
        },
      applyAnnotationReemplazo:
        (id, reemplazo) =>
        ({ tr, dispatch, state }) => {
          // Find the (contiguous, hopefully) range carrying this id.
          let firstFrom = -1;
          let lastTo = -1;
          let crossesBlock = false;
          let lastBlockTop = -1;
          state.doc.descendants((node, pos) => {
            if (node.isBlock) {
              lastBlockTop = pos;
              return true;
            }
            for (const m of node.marks) {
              if (m.type.name === "annotation" && m.attrs.id === id) {
                const from = pos;
                const to = pos + node.nodeSize;
                if (firstFrom === -1) firstFrom = from;
                else if (firstFrom > from) firstFrom = from;
                if (to > lastTo) {
                  // If we already had a lastTo, see if this segment lives
                  // in a *different* block from the previous one (which
                  // would mean the mark crosses paragraphs / headings).
                  if (lastTo !== -1 && pos > lastBlockTop && lastBlockTop !== -1) {
                    if (lastTo <= lastBlockTop) crossesBlock = true;
                  }
                  lastTo = to;
                }
              }
            }
            return true;
          });
          if (firstFrom === -1) return false;
          if (crossesBlock) {
            // Refuse to merge paragraphs — caller should surface a hint.
            return false;
          }
          if (!reemplazo || reemplazo.length === 0) return false;
          if (dispatch) {
            // Replace the marked range with the new prose. The new
            // text inherits the annotation mark on its left edge, so
            // we explicitly strip the mark afterwards.
            // One isolated history step: ⌘Z undoes exactly this and
            // nothing typed before or after merges into it.
            closeHistory(tr);
            tr.insertText(reemplazo, firstFrom, lastTo);
            tr.removeMark(
              firstFrom,
              firstFrom + reemplazo.length,
              this.type,
            );
            dispatch(closeHistory(tr));
          }
          return true;
        },
      applyReview:
        ({ remove, add }) =>
        ({ tr, dispatch, state }) => {
          const ids = new Set(remove);
          const max = state.doc.content.size;
          if (dispatch) {
            if (ids.size > 0) {
              state.doc.descendants((node, pos) => {
                for (const m of node.marks) {
                  if (m.type.name === "annotation" && ids.has(String(m.attrs.id))) {
                    tr.removeMark(pos, pos + node.nodeSize, m);
                  }
                }
                return true;
              });
            }
            for (const a of add) {
              if (a.from >= a.to || a.from < 0 || a.to > max) continue;
              tr.addMark(a.from, a.to, this.type.create(a.attrs));
            }
            tr.setMeta("addToHistory", false);
            // The draw plays once, only for the underlines added here.
            const drawn = add.map((a) => a.attrs.id).filter((v): v is string => !!v);
            if (drawn.length > 0) tr.setMeta(fxKey, { draw: drawn } satisfies FxPatch);
            dispatch(tr);
          }
          return true;
        },
      clearAllAnnotations:
        () =>
        ({ tr, dispatch, state }) => {
          let any = false;
          state.doc.descendants((node, pos) => {
            for (const m of node.marks) {
              if (m.type.name === "annotation") {
                any = true;
                if (dispatch) {
                  tr.removeMark(pos, pos + node.nodeSize, this.type);
                }
              }
            }
            return true;
          });
          return any;
        },
    };
  },
});
