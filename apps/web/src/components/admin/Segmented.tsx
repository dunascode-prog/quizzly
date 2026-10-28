"use client";

import { useRef } from "react";

/** Pill radio group (range picker, takedown target type). Arrow keys move the choice, as in a native radio group. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  raised = false,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  label: string;
  /** Inside an ink card. */
  raised?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);

  function onKeyDown(e: React.KeyboardEvent) {
    const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const i = options.findIndex((o) => o.value === value);
    const next = (i + step + options.length) % options.length;
    onChange(options[next].value);
    ref.current?.querySelectorAll<HTMLButtonElement>("button")[next]?.focus();
  }

  return (
    <div ref={ref} className={`a-seg${raised ? " a-seg-raised" : ""}`} role="radiogroup" aria-label={label} onKeyDown={onKeyDown}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          tabIndex={o.value === value ? 0 : -1}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
