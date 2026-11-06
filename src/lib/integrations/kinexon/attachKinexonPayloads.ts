import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllPages } from "@/lib/supabasePaginate";

type LoadRow = { player_id: string; date: string; source: string | null; raw_payload_json?: unknown };

/**
 * Adds raw_payload_json to the Kinexon rows of a player_external_load_daily result.
 *
 * Only Kinexon rows read their metrics from the blob, and the blob is large: since
 * July 2026 Catapult rows carry 50-70 kB each, so selecting it for a whole squad over
 * 30 days pulled 17.7 MB for Breiðablik (85 kB without it) just to throw it away. So
 * select the load columns without it and call this, which costs no query at all for
 * a team with no Kinexon rows. (player_id, date, source) is the table's primary key.
 */
export async function attachKinexonPayloads<T extends LoadRow>(
  sb: SupabaseClient,
  rows: T[],
  scope: { teamId: string | null; startDate: string; endDate: string },
): Promise<T[]> {
  if (!rows.some((row) => row.source === "kinexon")) return rows;

  const payloads = await fetchAllPages<{ player_id: string; date: string; raw_payload_json: unknown }>((from, to) => {
    let query = sb
      .from("player_external_load_daily")
      .select("player_id, date, raw_payload_json")
      .eq("source", "kinexon")
      .gte("date", scope.startDate)
      .lte("date", scope.endDate);
    if (scope.teamId) query = query.eq("team_id", scope.teamId);
    return query.order("date", { ascending: true }).order("player_id", { ascending: true }).range(from, to);
  });

  const byKey = new Map(payloads.map((p) => [`${p.player_id}|${p.date}`, p.raw_payload_json]));
  return rows.map((row) =>
    row.source === "kinexon" ? { ...row, raw_payload_json: byKey.get(`${row.player_id}|${row.date}`) ?? null } : row,
  );
}
