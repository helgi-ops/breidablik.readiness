"use client";

/**
 * A short two-note chime + a vibration when a rest timer runs out.
 *
 * Best-effort and silent on failure: Web Audio only produces sound after a user
 * gesture (the session runner is interactive, so that's satisfied), and the
 * Vibration API only fires on supporting devices (Android Chrome; iOS Safari has
 * no Vibration API and simply no-ops). Nothing here throws into the caller.
 */
export function playTimerDone(): void {
  try {
    navigator.vibrate?.([140, 70, 140]);
  } catch {
    /* no Vibration API — ignore */
  }
  try {
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const beep = (freq: number, start: number, dur: number) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.value = freq;
      o.connect(g);
      g.connect(ctx.destination);
      g.gain.setValueAtTime(0.0001, ctx.currentTime + start);
      g.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + start + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + dur);
      o.start(ctx.currentTime + start);
      o.stop(ctx.currentTime + start + dur);
    };
    beep(880, 0, 0.15); // ding
    beep(1175, 0.16, 0.22); // dong
    setTimeout(() => { void ctx.close().catch(() => {}); }, 700);
  } catch {
    /* Web Audio not available — ignore */
  }
}
