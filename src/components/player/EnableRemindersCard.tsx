"use client";

import EnablePushNotificationsButton from "@/components/push/EnablePushNotificationsButton";

/**
 * With `lang` (the PT client app) the card is in that language. Without it, the team
 * app's card is exactly as it has always been.
 */
export default function EnableRemindersCard({ lang }: { lang?: "EN" | "IS" } = {}) {
  const t = lang === "EN"
    ? { kicker: "Notifications", title: "Session reminders", body: "Get a reminder on the days you have a session, and a short recap of your week." }
    : lang === "IS"
    ? { kicker: "Tilkynningar", title: "Áminningar um æfingar", body: "Fáðu áminningu þá daga sem þú átt æfingu, og stutt yfirlit yfir vikuna." }
    : { kicker: "Tilkynningar", title: "Daglegar áminningar", body: "Virkjaðu vafratilkynningar til að fá áminningar." };
  return (
    <div className="rounded-xl border bg-muted/20 p-3">
      <div className="text-xs font-semibold text-muted-foreground">{t.kicker}</div>
      <div className="mt-1 text-sm font-semibold text-foreground">{t.title}</div>
      <div className="mt-2">
        <EnablePushNotificationsButton lang={lang} />
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        {t.body}
      </p>
    </div>
  );
}
