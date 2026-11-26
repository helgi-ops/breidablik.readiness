"use client";

import * as React from "react";

// A × a match input (pre-season week 1, the in-season standard week): typing re-flows the plan ~0.4 s after the
// last change, Enter / leaving the box at once.
// While the coach types, the box shows what they typed; otherwise it follows the plan's value (reset, draft reload).
export function MultipleInput({ value, label, onCommit, big = false }: { value: number | null; label: string; onCommit: (x: number) => void; big?: boolean }) {
  const [txt, setTxt] = React.useState("");
  const [editing, setEditing] = React.useState(false);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  React.useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const fire = (v: string) => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    const x = Number(v.replace(",", "."));
    if (v.trim() !== "" && Number.isFinite(x) && x > 0 && x !== value) onCommit(x);
  };
  return (
    <input type="number" step={0.05} min={0} aria-label={label}
      value={editing ? txt : (value ?? "")}
      onFocus={() => { setTxt(value == null ? "" : String(value)); setEditing(true); }}
      onChange={(e) => {
        const v = e.target.value; setTxt(v);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => fire(v), 400);
      }}
      onBlur={() => { fire(txt); setEditing(false); }}
      onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
      className={`h-full min-w-0 flex-1 border-0 bg-transparent px-0 text-right font-bold tabular-nums text-[#14181c] outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none ${big ? "text-[18px]" : "text-[16px]"}`} style={{ fontFamily: "var(--font-archivo, inherit)" }} />
  );
}
