/**
 * Test push notification — sends directly to a player's subscription.
 * Run from project root: node scripts/test-push.mjs
 */

import webpush from "web-push";

webpush.setVapidDetails(
  "mailto:helgi@metabolic.is",
  "BOtPBK9tNf-bl8HTbzXsJwLO_C8hOE_ilMJI7CRQ1qbCFRPQ6_AAxLpJfZzyz6XpAggK-rZCzHNd1fSihfXDUi8",
  "87BRcemduuw1aqNRpdWdJNoCmHK-wo4MY5u64le5pbI"
);

// Arnór Tristan Helgason — active Apple Push subscription (registered 30 Mar 2026)
const subscription = {
  endpoint:
    "https://web.push.apple.com/QC_B8sYs4jD5IyrNTUyjB_Wfo7_XP3DB7IzhPpFlUaw_aESfpPYxuIz7leZJxvu5ci7k7GjmIoYykyOBWfivPKe_o06Y6LDk1rlvEyBmPM_0GzV_TDHMbhwTDu7HTvlJVsPG6jsnQpVcafHr2CSAPrDF2O2hFKBDrc39IA0db7o",
  keys: {
    p256dh: "BA4QDCYhTA-Fz2ZGk-by4Uiedyr40ySicze0HAf8OMTvSIYWqREoMo7nRZ1JTHlCZi72WsaevYnprf3PkJelAVE",
    auth: "tIpgWMIlPkt6BXzwFOFPfQ",
  },
};

const payload = JSON.stringify({
  title: "📋 MicroPulse",
  body: "Skráðu líðan þína til að kerfið geti stillt æfinguna fyrir þig í dag.",
  url: "/player/checkin",
  icon: "/icons/icon-192.png",
});

console.log("Sending test push to Arnór Tristan Helgason...");

try {
  const result = await webpush.sendNotification(subscription, payload);
  console.log("✅ Sent! Status:", result.statusCode);
} catch (err) {
  console.error("❌ Failed:", err.statusCode ?? err.message);
  if (err.body) console.error("Body:", err.body);
}
