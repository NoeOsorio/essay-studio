// TipTap mark for Pluma Roja inline annotations.
//
// Renders as `<span class="anno anno-XX" data-by="XX" data-anno-id="..."
// data-pase="..." data-severidad="...">`. The .anno / .anno-em / .anno-sis
// etc. classes live in globals.css and supply the tinted underline +
// the circular sage chip.
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

import { Mark, mergeAttributes } from "@tiptap/core";

export type AnnotationAttrs = {
  id: string | null;
  sage: "em" | "sis" | "pra" | "cri" | null;
  pase: "coherencia" | "estilo" | "argumento" | "apa" | null;
  severidad: "alta" | "media" | "baja" | null;
  mensaje: string | null;
  reemplazo: string | null;
  /** Optional id of the rubric criterio this annotation maps to. */
  criterioId: string | null;
};

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    annotation: {
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
    };
  }
}

const SAGE_INITIALS: Record<NonNullable<AnnotationAttrs["sage"]>, string> = {
  em: "EM",
  sis: "SI",
  pra: "PR",
  cri: "CR",
};

const SAGE_CLASS: Record<NonNullable<AnnotationAttrs["sage"]>, string> = {
  em: "anno-emp",
  sis: "anno-sis",
  pra: "anno-pra",
  cri: "anno-cri",
};

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
    const sageClass = sage ? SAGE_CLASS[sage] : "";
    const initials = sage ? SAGE_INITIALS[sage] : "··";
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        class: `anno ${sageClass}`.trim(),
        "data-by": initials,
      }),
      0,
    ];
  },

  addCommands() {
    return {
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
            tr.insertText(reemplazo, firstFrom, lastTo);
            tr.removeMark(
              firstFrom,
              firstFrom + reemplazo.length,
              this.type,
            );
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
