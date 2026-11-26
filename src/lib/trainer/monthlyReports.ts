/**
 * Monthly client reports for personal-trainer practices.
 *
 * On the 1st of each month the cron (/api/trainer/monthly-reports/cron) builds one
 * progress report per active client for the month that just ended and stores it in
 * pt_monthly_reports. The trainer sees it with their client's reports and decides when
 * to "Send to client" (that only makes it visible in the client's app — nothing is
 * emailed). The PDF is drawn in the browser from the stored snapshot (PtClientReportPdf).
 */

import { isDemoClient } from "./demoClient";

export type MonthPeriod = { month: string; start: string; end: string; weeks: number };

const pad = (n: number) => String(n).padStart(2, "0");

/** The calendar month a given "YYYY-MM" names. */
export function monthPeriod(yyyyMm: string): MonthPeriod {
  const m = /^(\d{4})-(\d{2})$/.exec(yyyyMm);
  if (!m) throw new Error(`Bad month: ${yyyyMm}`);
  const y = Number(m[1]);
  const mo = Number(m[2]);
  if (mo < 1 || mo > 12) throw new Error(`Bad month: ${yyyyMm}`);
  const lastDay = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  return {
    month: `${y}-${pad(mo)}-01`,
    start: `${y}-${pad(mo)}-01`,
    end: `${y}-${pad(mo)}-${pad(lastDay)}`,
    weeks: Math.round(lastDay / 7),
  };
}

/** The month before the one `todayIso` (YYYY-MM-DD) falls in. */
export function previousMonth(todayIso: string): MonthPeriod {
  const y = Number(todayIso.slice(0, 4));
  const mo = Number(todayIso.slice(5, 7));
  return mo === 1 ? monthPeriod(`${y - 1}-12`) : monthPeriod(`${y}-${pad(mo - 1)}`);
}

export type ReportCandidate = { id: string; user_id: string | null; is_active: boolean | null; is_demo?: boolean | null };

/** Who gets a monthly report: active clients with an account — never the demo client. */
export function monthlyReportClients<T extends ReportCandidate>(rows: readonly T[]): T[] {
  return rows.filter((p) => p.is_active === true && !!p.user_id && !isDemoClient(p));
}
