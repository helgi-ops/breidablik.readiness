"use client";

import { useSyncExternalStore } from "react";

export type Lang = "IS" | "EN";

const LANG_KEY = "mp_lang";
// Set once the user manually picks a language — a manual choice always wins over
// a club default and sticks for this browser.
const EXPLICIT_KEY = "mp_lang_explicit";
// Fired whenever the language changes so every useLang() instance (and other
// tabs) re-read and stay in sync.
const CHANGE_EVENT = "mp_lang_changed";

function readLang(): Lang {
  if (typeof window === "undefined") return "EN";
  const saved = window.localStorage.getItem(LANG_KEY);
  return saved === "IS" || saved === "EN" ? saved : "EN";
}

function subscribe(cb: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, cb);
  window.addEventListener("storage", cb); // other tabs
  return () => {
    window.removeEventListener(CHANGE_EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

/**
 * Reads/writes language preference from localStorage (default "EN"). Backed by
 * useSyncExternalStore so every instance stays in sync — SSR renders "EN", the
 * client reconciles, and a change anywhere updates all consumers.
 */
export function useLang(): [Lang, (l: Lang) => void] {
  const lang = useSyncExternalStore(subscribe, readLang, () => "EN" as Lang);

  function setLang(l: Lang) {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(LANG_KEY, l);
    window.localStorage.setItem(EXPLICIT_KEY, "1"); // user explicitly chose
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }

  return [lang, setLang];
}

/**
 * Apply a club/team default language. Sets the language ONLY when the user has
 * not explicitly picked one on this browser (a manual toggle always wins and
 * sticks). Call this once the coach's current team is known so a club can default
 * to e.g. English regardless of the per-browser toggle.
 */
export function applyTeamDefaultLanguage(def: string | null | undefined): void {
  if (typeof window === "undefined") return;
  if (def !== "IS" && def !== "EN") return;
  if (window.localStorage.getItem(EXPLICIT_KEY) === "1") return; // respect manual choice
  if (window.localStorage.getItem(LANG_KEY) === def) return; // already set
  window.localStorage.setItem(LANG_KEY, def);
  window.dispatchEvent(new Event(CHANGE_EVENT));
}
