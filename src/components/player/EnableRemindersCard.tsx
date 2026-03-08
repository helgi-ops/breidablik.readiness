"use client";

import EnablePushNotificationsButton from "@/components/push/EnablePushNotificationsButton";

export default function EnableRemindersCard() {
  return (
    <div className="rounded-xl border bg-muted/20 p-3">
      <div className="text-xs font-semibold text-muted-foreground">Tilkynningar</div>
      <div className="mt-1 text-sm font-semibold text-foreground">Daglegar áminningar</div>
      <div className="mt-2">
        <EnablePushNotificationsButton />
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Virkjaðu vafratilkynningar til að fá áminningar.
      </p>
    </div>
  );
}
