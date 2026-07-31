import "server-only";

/**
 * KKÍ (baskethotel MBT) widget-service client — the free, public, no-login feed.
 * Server-side GET with the public widget key + `referer: kki.is`; the body is
 * windows-1252 and must be decoded before parsing. Request recipe reverse-
 * engineered from MBT api.js (widget ids + the [part] partial key); see the
 * captured fixtures in basketballStats/__tests__/fixtures/.
 */

const WIDGET_BASE = "https://widgets.baskethotel.com/widget-service/show";
// Public widget key embedded in kki.is (not a secret — overridable via env).
const PUBLIC_KEY = process.env.KKI_WIDGET_KEY?.trim() || "a0d07178160bf749eb6e5e761fc623fe42e2bb57";
const REFERER = "https://www.kki.is/";

const WIDGET_SCHEDULE = 303; // SEASON_SCHEDULE_LONG
const WIDGET_BOXSCORE = 400; // GAME_FULL_VIEW
export const DEFAULT_STAGE_ID = "300475"; // Deildarkeppni (regular season)

function q(params: Record<string, string>): string {
  return Object.entries(params).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&");
}

export function buildScheduleUrl(seasonId: string, stageId: string, page: number): string {
  return `${WIDGET_BASE}?${q({
    api: PUBLIC_KEY, lang: "is",
    "request[0][container]": "view110",
    "request[0][widget]": String(WIDGET_SCHEDULE),
    "request[0][part]": "schedule_and_results",
    "request[0][param][season_id]": seasonId,
    "request[0][param][stage_id]": stageId,
    "request[0][param][page]": String(page),
    "request[0][param][game_link_visible]": "1",
  })}`;
}

export function buildBoxScoreUrl(gameId: string, seasonId: string): string {
  return `${WIDGET_BASE}?${q({
    api: PUBLIC_KEY, lang: "is",
    "request[0][container]": "view110",
    "request[0][widget]": String(WIDGET_BOXSCORE),
    "request[0][part]": "boxscore",
    "request[0][param][game_id]": gameId,
    "request[0][param][season_id]": seasonId,
    "request[0][param][player_link_visible]": "1",
  })}`;
}

/** GET a widget and decode its windows-1252 body to a string. */
export async function fetchWidget(url: string): Promise<string> {
  const res = await fetch(url, { headers: { referer: REFERER, "user-agent": "Mozilla/5.0" } });
  if (!res.ok) throw new Error(`kki widget ${res.status}`);
  const buf = await res.arrayBuffer();
  return new TextDecoder("windows-1252").decode(buf);
}
