/**
 * Who may delete a client report (pt_client_reports).
 *
 * The trainer (any coach with access to the client) may delete any report on
 * that client. The client may delete only the reports they uploaded themselves —
 * never the trainer's uploads or the monthly reports the trainer sends.
 * (Before: the route only checked that the report was on the client's own
 * record, so a client could delete what the trainer had added.)
 */
export function canDeleteReport(
  viewer: { uid: string; isCoach: boolean },
  report: { uploaded_by: string | null },
): boolean {
  if (viewer.isCoach) return true;
  return !!report.uploaded_by && report.uploaded_by === viewer.uid;
}
