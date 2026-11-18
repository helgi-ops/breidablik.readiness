/**
 * Before the 09:00 automatic send (B, 2026-11-18): label Today's card as a preview. `sameAsSend` = the card was built
 * exactly as the send will build it; otherwise (e.g. the team programme) the coach's session may differ.
 * Iceland is on UTC, so 09:00 UTC is 09:00 local. Null after 09:00, on other days, or when auto-send is off.
 */
export function autoSendPreviewNote(a: { autoTeam: boolean; isToday: boolean; nowHHMM: string; sameAsSend: boolean; isIS: boolean }): { title: string; text: string } | null {
  if (!a.autoTeam || !a.isToday || a.nowHHMM >= "09:00") return null;
  if (a.sameAsSend) {
    return a.isIS
      ? { title: "Forsýn · áætlun þjálfarans", text: "Þessi æfing er send til þín kl. 09:00. Ef þú skráir þig inn fyrst er hún sett saman eftir innskráningunni." }
      : { title: "Preview · your coach's plan", text: "This session is sent to you at 09:00. If you check in first, it is built from your check-in." };
  }
  return a.isIS
    ? { title: "Forsýn", text: "Æfing þjálfarans er send kl. 09:00 og getur verið önnur en þessi." }
    : { title: "Preview", text: "Your coach's session is sent at 09:00 and may differ from this one." };
}
