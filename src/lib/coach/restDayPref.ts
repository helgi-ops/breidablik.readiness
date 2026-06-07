/**
 * src/lib/coach/restDayPref
 *
 * Tiny client-side persistence for the coach's "Rest day" choice on the
 * Pre-Session report, keyed by date. Shared by the /coach/load-plan page and
 * the Today dashboard download button so the choice sticks across navigation
 * and both surfaces agree (mark today as a rest day on one, it's a rest day on
 * the other). Best-effort: silently no-ops when localStorage is unavailable.
 */

const keyFor = (date: string) => `mp:restday:${date}`;

export function readRestDayPref(date: string): boolean {
  if (typeof window === "undefined" || !date) return false;
  try {
    return window.localStorage.getItem(keyFor(date)) === "1";
  } catch {
    return false;
  }
}

export function writeRestDayPref(date: string, on: boolean): void {
  if (typeof window === "undefined" || !date) return;
  try {
    if (on) window.localStorage.setItem(keyFor(date), "1");
    else window.localStorage.removeItem(keyFor(date));
  } catch {
    /* ignore */
  }
}
