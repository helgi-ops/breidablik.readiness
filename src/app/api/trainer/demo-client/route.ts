/**
 * /api/trainer/demo-client
 *
 *   DELETE ?team_id=… → remove the practice's demo client and everything seeded for it
 *                       (check-ins, set logs, bar speeds, session RPE cascade on players).
 *
 * Only ever touches the row marked players.is_demo on the trainer's own practice.
 */

import { NextResponse } from "next/server";
import { requireTrainerPractice } from "@/lib/trainer/requireTrainerPractice";

export const runtime = "nodejs";

export async function DELETE(req: Request) {
  const a = await requireTrainerPractice(req);
  if ("error" in a) return NextResponse.json({ error: a.error }, { status: a.status });
  const { sb, teamId } = a;

  const { data, error } = await sb.from("players")
    .delete()
    .eq("team_id", teamId)
    .eq("is_demo", true)
    .is("user_id", null)
    .select("id");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, removed: (data ?? []).length });
}
