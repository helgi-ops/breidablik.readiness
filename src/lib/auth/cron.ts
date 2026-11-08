/** True when the request carries one of the shared cron secrets. */
export function isCronCall(req: Request): boolean {
  const authz = req.headers.get("authorization") || "";
  const secret = process.env.CRON_SECRET;
  const reminder = process.env.REMINDER_CRON_SECRET;
  return (!!secret && authz === `Bearer ${secret}`) || (!!reminder && authz === `Bearer ${reminder}`);
}
