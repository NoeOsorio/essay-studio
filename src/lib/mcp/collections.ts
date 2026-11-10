import { ToolError, type JsonObject } from "../../../shared/mcp";

// Keep each page comfortably below the authenticated bridge's 2 MiB frame.
export const PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 200;
export const TEXT_SIZE = 16_384;
export const MAX_TEXT_SIZE = 131_072;

export function page<T>(items: T[], args: JsonObject): { items: T[]; total: number; offset: number; nextOffset: number | null } {
  const offset = integer(args.offset, 0, Number.MAX_SAFE_INTEGER);
  const limit = integer(args.limit, PAGE_SIZE, MAX_PAGE_SIZE, 1);
  return { items: items.slice(offset, offset + limit), total: items.length, offset,
    nextOffset: offset + limit < items.length ? offset + limit : null };
}

function integer(value: unknown, fallback: number, max: number, min = 0): number {
  if (value === undefined) return fallback;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min || value > max) {
    throw new ToolError("INVALID_ARGUMENTS", "Use a valid bounded offset or limit.");
  }
  return value;
}

export function textRange(text: string, args: JsonObject): JsonObject {
  let from = integer(args.textOffset, 0, Number.MAX_SAFE_INTEGER);
  const limit = integer(args.textLimit, TEXT_SIZE, MAX_TEXT_SIZE, 1);
  from = Math.min(from, text.length);
  // Never return half a UTF-16 surrogate pair at page boundaries.
  if (from > 0 && /[\uDC00-\uDFFF]/u.test(text[from] ?? "")) from--;
  let to = Math.min(from + limit, text.length);
  if (to < text.length && /[\uDC00-\uDFFF]/u.test(text[to] ?? "")) to--;
  if (to === from && to < text.length) throw new ToolError("INVALID_ARGUMENTS", "The text limit must fit the next Unicode character. Increase textLimit.");
  return { text: text.slice(from, to), textOffset: from, textLength: text.length, nextTextOffset: to < text.length ? to : null };
}

export function matches(query: unknown, ...values: (string | undefined)[]): boolean {
  if (query === undefined || query === "") return true;
  const needle = (query as string).toLocaleLowerCase();
  return values.some(value => value?.toLocaleLowerCase().includes(needle));
}
