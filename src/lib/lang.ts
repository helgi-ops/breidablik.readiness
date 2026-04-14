"use client";

import { useEffect, useState } from "react";

export type Lang = "IS" | "EN";

const LANG_KEY = "mp_lang";

/** Reads/writes language preference from localStorage. Defaults to "EN". */
export function useLang(): [Lang, (l: Lang) => void] {
  const [lang, setLangState] = useState<Lang>("EN");

  // Restore saved preference on mount
  useEffect(() => {
    const saved =
      typeof window !== "undefined" ? window.localStorage.getItem(LANG_KEY) : null;
    if (saved === "IS" || saved === "EN") setLangState(saved);
  }, []);

  function setLang(l: Lang) {
    setLangState(l);
    if (typeof window !== "undefined") window.localStorage.setItem(LANG_KEY, l);
  }

  return [lang, setLang];
}
