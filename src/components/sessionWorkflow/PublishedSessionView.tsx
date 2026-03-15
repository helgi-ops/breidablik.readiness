"use client";

import React from "react";
import type { PlayerPublishedSessionView } from "@/lib/micropulse/sessionWorkflow";

type Props = {
  view: PlayerPublishedSessionView | null;
  title?: string;
};

export default function PublishedSessionView({ view, title = "Published Session" }: Props) {
  if (!view) {
    return (
      <div className="rounded-xl border bg-white p-3 text-xs text-gray-500">
        <div className="font-semibold uppercase tracking-wide text-gray-600">{title}</div>
        <div className="mt-2">No published session available.</div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border bg-white p-3 text-xs text-gray-700">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="font-semibold uppercase tracking-wide text-gray-600">{title}</div>
        <div className="text-[11px] text-gray-500">{view.publishedAt ? new Date(view.publishedAt).toLocaleString() : ""}</div>
      </div>
      <div className="mt-2 text-sm font-semibold text-gray-900">{view.title}</div>
      <div className="mt-1 text-xs text-gray-700">{view.summary}</div>
      <ul className="mt-2 list-disc space-y-1 pl-4">
        {view.blocks.map((block) => (
          <li key={block.id}>
            <span className="font-medium">{block.title}</span>
            {block.description ? ` - ${block.description}` : ""}
            {block.durationMin ? ` · ${block.durationMin} min` : ""}
            {block.sets ? ` · ${block.sets} sets` : ""}
            {block.reps ? ` · ${block.reps}` : ""}
          </li>
        ))}
      </ul>
      {view.notes?.length ? (
        <div className="mt-2 text-[11px] text-gray-600">Notes: {view.notes.join(" | ")}</div>
      ) : null}
    </div>
  );
}
