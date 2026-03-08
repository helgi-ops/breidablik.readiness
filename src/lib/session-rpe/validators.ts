import { SESSION_TYPES, type SessionRpePayload, type SessionType } from "@/lib/session-rpe/types";

function isIsoDate(v: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(v);
}

export function isSessionType(v: string): v is SessionType {
  return SESSION_TYPES.includes(v as SessionType);
}

export function validateSessionRpePayload(input: unknown): { ok: true; data: SessionRpePayload } | { ok: false; error: string } {
  if (!input || typeof input !== "object") {
    return { ok: false, error: "Invalid payload" };
  }

  const body = input as Record<string, unknown>;
  const session_date = String(body.session_date ?? "").trim();
  const session_type = String(body.session_type ?? "").trim();
  const session_name = String(body.session_name ?? "").trim();
  const notes = String(body.notes ?? "").trim();

  const durationRaw = typeof body.duration_minutes === "string" ? Number(body.duration_minutes) : body.duration_minutes;
  const rpeRaw = typeof body.rpe === "string" ? Number(body.rpe) : body.rpe;

  const duration_minutes = Number(durationRaw);
  const rpe = Number(rpeRaw);

  if (!isIsoDate(session_date)) {
    return { ok: false, error: "session_date must be YYYY-MM-DD" };
  }

  if (!isSessionType(session_type)) {
    return { ok: false, error: "session_type is invalid" };
  }

  if (!Number.isFinite(duration_minutes) || duration_minutes < 1 || duration_minutes > 300) {
    return { ok: false, error: "duration_minutes must be between 1 and 300" };
  }

  if (!Number.isFinite(rpe) || rpe < 0 || rpe > 10) {
    return { ok: false, error: "rpe must be between 0 and 10" };
  }

  return {
    ok: true,
    data: {
      session_date,
      session_type,
      session_name: session_name || undefined,
      duration_minutes: Math.round(duration_minutes),
      rpe: Math.round(rpe * 10) / 10,
      notes: notes || undefined,
    },
  };
}
