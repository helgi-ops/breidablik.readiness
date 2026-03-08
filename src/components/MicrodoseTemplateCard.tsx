"use client";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import type { MicrodoseTemplate } from "@/lib/templates";

export function MicrodoseTemplateCard({ t }: { t: MicrodoseTemplate }) {
  return (
    <Card className="rounded-2xl">
      <CardHeader className="space-y-2">
        <div className="text-sm opacity-70">ÆFING DAGSINS</div>
        <div className="text-xl font-semibold">{t.name}</div>
        {t.description ? <div className="text-sm opacity-80">{t.description}</div> : null}
      </CardHeader>

      <CardContent className="space-y-4">
        {t.blocks?.map((b) => (
          <div key={b.key} className="rounded-2xl border p-4">
            <div className="font-semibold">
              {b.key}. {b.title}
              {b.duration ? <span className="opacity-70"> ({b.duration})</span> : null}
              {typeof b.rounds === "number" ? <span className="opacity-70"> ({b.rounds} rounds)</span> : null}
              {typeof b.sets === "number" ? <span className="opacity-70"> ({b.sets} sets)</span> : null}
            </div>
            <ul className="mt-2 list-disc pl-5 space-y-1">
              {b.items.map((it, i) => (
                <li key={i} className="text-sm opacity-90">{it}</li>
              ))}
            </ul>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
