"use client";

import EnablePushNotificationsButton from "@/components/push/EnablePushNotificationsButton";

export default function EnableRemindersCard() {
  return (
    <div className="mt-4 rounded-xl border bg-muted/20 p-3">
      <div className="text-xs font-semibold text-muted-foreground">Notifications</div>
      <div className="mt-2">
        <EnablePushNotificationsButton />
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Allow notifications so we can remind you to complete your daily check-in.
      </p>
    </div>
  );
}
