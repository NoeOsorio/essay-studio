/** Browser-safe question parsing. The only route from model text to a question. */
import { QUESTIONS_PER_AGENT } from "./review-contract.js";

const ITEM_START = /^\d+[.)]\s+(.*)$/;

/**
 * An item starts on a line like `1. ` or `1) `. Following non-blank lines
 * continue it (joined with a space). A blank line ends it. Text before item 1
 * is ignored. No match returns `[]`: there is no fallback to raw text.
 */
export function parseQuestions(text: string): string[] {
  const items: string[] = [];
  let open = false;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) { open = false; continue; }
    const start = ITEM_START.exec(line);
    if (start) {
      if (items.length >= QUESTIONS_PER_AGENT) break;
      items.push(start[1].trim());
      open = true;
    } else if (open) {
      items[items.length - 1] = `${items[items.length - 1]} ${line}`.trim();
    }
  }
  return items.filter((item) => item.length > 0);
}

/**
 * Item k goes out once item k+1 exists (a newline alone can arrive in the
 * middle of a wrapped question). `finish` parses the authoritative result and
 * emits every index not yet sent. Emission is keyed by index, so nothing
 * goes out twice.
 */
export function createQuestionEmitter(emit: (index: number, text: string) => void) {
  let accumulated = "";
  let sent = 0;
  const flush = (items: string[], upTo: number) => {
    for (; sent < upTo && sent < items.length; sent += 1) emit(sent, items[sent]);
  };
  return {
    push(delta: string): void {
      accumulated += delta;
      const items = parseQuestions(accumulated);
      flush(items, items.length - 1);
    },
    /** Returns the number of questions in the final result. */
    finish(result: string): number {
      const items = parseQuestions(result || accumulated);
      flush(items, items.length);
      return items.length;
    },
  };
}
