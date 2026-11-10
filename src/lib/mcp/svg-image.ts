import { sanitizeSvg } from "tldraw";
import { MAX_REQUEST_BYTES, ToolError } from "../../../shared/mcp";

const SVG = "http://www.w3.org/2000/svg";
const XLINK = "http://www.w3.org/1999/xlink";
const XML = "http://www.w3.org/XML/1998/namespace";
const XMLNS = "http://www.w3.org/2000/xmlns/";
const tags = new Set("svg g defs rect circle ellipse path line polygon polyline text tspan textPath title desc linearGradient radialGradient stop clipPath mask pattern marker symbol use style".split(" "));
const presentation = new Set("fill fill-opacity fill-rule stroke stroke-width stroke-opacity stroke-linecap stroke-linejoin stroke-miterlimit stroke-dasharray stroke-dashoffset opacity color stop-color stop-opacity clip-path clip-rule mask marker-start marker-mid marker-end vector-effect display visibility font-family font-size font-weight font-style font-stretch text-anchor dominant-baseline alignment-baseline baseline-shift letter-spacing word-spacing paint-order color-interpolation image-rendering shape-rendering text-rendering".split(" "));
const attributes = new Set("id class x y x1 y1 x2 y2 cx cy r rx ry width height dx dy viewBox preserveAspectRatio transform gradientTransform gradientUnits spreadMethod offset patternTransform patternUnits patternContentUnits maskUnits maskContentUnits clipPathUnits refX refY markerWidth markerHeight markerUnits orient pathLength points d textLength lengthAdjust rotate startOffset method spacing style version".split(" "));
const idPattern = /^[A-Za-z_][A-Za-z0-9_.:-]*$/u;
const functions = new Set("rgb rgba hsl hsla hwb lab lch oklab oklch color color-mix calc min max clamp".split(" "));
function fail(message: string): never { throw new ToolError("INVALID_SVG", message); }

/** This is an image subset, not a general SVG document sanitizer. Reject
 * unsupported input before the native decoder or any persistence is invoked. */
function validate(source: string, budget: number): void {
  if (/<!\s*(?:DOCTYPE|ENTITY)/iu.test(source) || /<\?(?!xml\s)/iu.test(source)) fail("SVG declarations and processing instructions are unsupported.");
  const doc = new DOMParser().parseFromString(source, "image/svg+xml");
  const root = doc.documentElement;
  if (doc.doctype || doc.querySelector("parsererror") || root.localName !== "svg" || root.namespaceURI !== SVG || root.prefix) fail("Provide well-formed UTF-8 SVG with an SVG root.");
  const ids = new Map<string, Element>();
  const refs = new Map<Element, string[]>();
  const elements: Element[] = [];
  const pending: Array<{ element: Element; depth: number }> = [{ element: root, depth: 0 }];
  while (pending.length) {
    const { element, depth } = pending.pop()!;
    if (depth > 64 || elements.length >= budget) fail("SVG structure exceeds the native board complexity budget.");
    if (element.namespaceURI !== SVG || element.prefix || !tags.has(element.localName)) fail("SVG contains an unsupported element.");
    elements.push(element);
    const id = element.getAttribute("id");
    if (id !== null) {
      if (!idPattern.test(id) || ids.has(id)) fail("SVG identifiers must be unique simple identifiers.");
      ids.set(id, element);
    }
    pending.push(...Array.from(element.children, (child) => ({ element: child, depth: depth + 1 })));
  }
  const reference = (element: Element, value: string): void => {
    if (!value.startsWith("#") || !idPattern.test(value.slice(1)) || !ids.has(value.slice(1))) fail("SVG references must point to an existing local identifier.");
    refs.set(element, [...refs.get(element) ?? [], value.slice(1)]);
  };
  const cssValue = (element: Element, value: string): void => {
    if (/[\\@{}<>]/u.test(value) || /\/\*|\*\/|expression\s*\(|(?:javascript|https?|data)\s*:/iu.test(value)) fail("Unsupported or external SVG style value.");
    const remaining = value.replace(/url\(\s*(?:"(#[^"]+)"|'(#[^']+)'|(#[^\s)'";]+))\s*\)/giu, (_match, double: string | undefined, single: string | undefined, plain: string | undefined) => {
      reference(element, double ?? single ?? plain ?? ""); return "";
    });
    for (const match of remaining.matchAll(/([\w-]+)\s*\(/gu)) if (!functions.has(match[1].toLowerCase())) fail("Unsupported SVG CSS function.");
  };
  const declarations = (element: Element, value: string): void => {
    if (/[\\@{}<>]/u.test(value) || /\/\*|\*\//u.test(value)) fail("Unsupported SVG CSS syntax.");
    for (const item of value.split(";")) {
      if (!item.trim()) continue;
      const split = item.indexOf(":");
      if (split < 1) fail("Invalid SVG CSS declaration.");
      const property = item.slice(0, split).trim().toLowerCase();
      if (!presentation.has(property)) fail("SVG contains an unsupported style property.");
      cssValue(element, item.slice(split + 1));
    }
  };
  for (const element of elements) {
    for (const attribute of Array.from(element.attributes)) {
      const { localName: name, namespaceURI: namespace, value } = attribute;
      if (/^on/iu.test(name)) fail("SVG event handlers are forbidden.");
      if (namespace === XMLNS) {
        if (!((attribute.name === "xmlns" && value === SVG) || (attribute.name === "xmlns:xlink" && value === XLINK))) fail("Foreign SVG namespaces are forbidden.");
        continue;
      }
      if (namespace === XML && (name === "space" || name === "lang")) continue;
      if (!namespace && name === "type" && element.localName === "style" && value === "text/css") continue;
      if (name === "href" && (!namespace || namespace === XLINK)) {
        if (!["use", "textPath", "linearGradient", "radialGradient", "pattern"].includes(element.localName)) fail("Unsupported SVG link.");
        reference(element, value);
        continue;
      }
      if (namespace || (!attributes.has(name) && !presentation.has(name) && !/^(?:aria|data)-[\w-]+$/u.test(name))) fail("SVG contains an unsupported attribute.");
      if (name === "style") declarations(element, value);
      else if (presentation.has(name)) cssValue(element, value);
    }
    if (element.localName === "style") {
      if (element.children.length) fail("SVG styles cannot contain elements.");
      let remaining = element.textContent ?? "";
      // Only flat static selector rules are accepted. No at-rules, pseudo
      // selectors, escapes, comments or nested rules can bypass declarations.
      const rule = /^\s*([A-Za-z0-9_\s.#,>*+~-]+)\{([^{}]*)\}/u;
      while (remaining.trim()) {
        const match = rule.exec(remaining);
        if (!match) fail("SVG styles require simple static selectors.");
        declarations(element, match[2]); remaining = remaining.slice(match[0].length);
      }
    }
  }
  // Count the expanded use tree, not just its tiny XML representation. Also
  // reject cycles through paint/clip inheritance before handing SVG to WebKit.
  const visiting = new Set<Element>();
  const costs = new Map<Element, number>();
  const cost = (element: Element, depth: number): number => {
    if (depth > 64 || visiting.has(element)) fail("SVG references contain a cycle or excessive nesting.");
    const cached = costs.get(element); if (cached !== undefined) return cached;
    visiting.add(element);
    let total = 1;
    for (const child of Array.from(element.children)) total += cost(child, depth + 1);
    for (const id of refs.get(element) ?? []) {
      const target = ids.get(id)!;
      const referenced = cost(target, depth + 1);
      total += referenced;
    }
    if (total > budget) fail("SVG expansion exceeds the native board complexity budget.");
    visiting.delete(element); costs.set(element, total); return total;
  };
  cost(root, 0);
}

export async function prepareSvgImage(file: File, budget: number): Promise<File> {
  if (file.size > MAX_REQUEST_BYTES) fail("SVG XML exceeds the 2 MiB content limit.");
  let source: string;
  try { source = new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer()); }
  catch { return fail("SVG content must use valid UTF-8."); }
  validate(source, budget);
  const safe = sanitizeSvg(source);
  if (!safe) fail("SVG does not contain an image.");
  validate(safe, budget);
  return new File([safe], file.name, { type: "image/svg+xml", lastModified: file.lastModified });
}
