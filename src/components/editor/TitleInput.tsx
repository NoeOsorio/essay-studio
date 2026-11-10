"use client";

import { useEffect, useRef, useState } from "react";
import { registerTitleInput } from "@/lib/mcp/document";

type TitleInputProps = {
  essayId: string;
  initialValue: string;
  onChange: (value: string) => void;
  placeholder?: string;
};

/**
 * Single-line contentEditable for the essay title.
 *
 * Controlled-at-init, uncontrolled afterwards: the parent passes
 * `initialValue` only at mount and is expected to remount the
 * component (via a `key` prop) when switching to another essay.
 * This avoids cascading-renders / setState-in-effect lint warnings.
 */
export function TitleInput({
  essayId,
  initialValue,
  onChange,
  placeholder = "Título",
}: TitleInputProps) {
  const ref = useRef<HTMLDivElement>(null);
  const composing = useRef(false);
  const [empty, setEmpty] = useState(initialValue.length === 0);

  // Set the DOM text exactly once on mount. After that, the user
  // owns the text — we only emit changes upward.
  useEffect(() => {
    if (ref.current) {
      ref.current.textContent = initialValue;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => registerTitleInput(essayId, (title) => {
    const element = ref.current;
    if (!element || composing.current) return false;
    // The browser's editable transaction keeps title rename in its native
    // undo stack. Assigning textContent here would discard that history.
    element.focus();
    const range = document.createRange();
    range.selectNodeContents(element);
    const selection = window.getSelection();
    if (!selection) return false;
    selection.removeAllRanges(); selection.addRange(range);
    const applied = document.execCommand(title ? "insertText" : "delete", false, title);
    if (applied) {
      setEmpty(title.length === 0);
      onChange(element.textContent ?? "");
    }
    return applied && element.textContent === title;
  }), [essayId, onChange]);

  return (
    <div
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      role="textbox"
      aria-label="Título del ensayo"
      data-placeholder={placeholder}
      data-empty={empty}
      onCompositionStart={() => { composing.current = true; }}
      onCompositionEnd={() => { composing.current = false; }}
      onInput={(e) => {
        const text = e.currentTarget.textContent ?? "";
        setEmpty(text.length === 0);
        onChange(text);
      }}
      onKeyDown={(e) => {
        // Title is a single line; Enter should not insert a newline.
        if (e.key === "Enter") {
          e.preventDefault();
          (e.currentTarget as HTMLDivElement).blur();
        }
      }}
      onPaste={(e) => {
        e.preventDefault();
        const text = e.clipboardData.getData("text/plain").replace(/\n/g, " ");
        document.execCommand("insertText", false, text);
      }}
      className="title-input font-serif font-medium text-[40px] tracking-[-0.015em] text-ink-1 leading-[46px] outline-none caret-ink-1"
      style={{ minHeight: "46px" }}
    />
  );
}
