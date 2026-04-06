"use client";

import { useMemo, useState } from "react";
import type { CoachRule } from "@/lib/micropulse/rulesEngine";
import {
  buildRulePreviewText,
  mapCoachRuleToForm,
  mapFormToCoachRule,
  createEmptyEditableRuleForm,
  type EditableRuleForm,
} from "@/lib/micropulse/adminConfig";
import RuleEditor from "./RuleEditor";

type Props = {
  rules: CoachRule[];
  onChange: (rules: CoachRule[]) => void;
};

export default function RulesManager({ rules, onChange }: Props) {
  const [scopeFilter, setScopeFilter] = useState<string>("ALL");
  const [showDisabled, setShowDisabled] = useState(true);
  const [editing, setEditing] = useState<EditableRuleForm | null>(null);

  const filtered = useMemo(() => {
    return [...rules]
      .filter((rule) => (scopeFilter === "ALL" ? true : rule.scope === scopeFilter))
      .filter((rule) => (showDisabled ? true : rule.enabled))
      .sort((a, b) => b.priority - a.priority);
  }, [rules, scopeFilter, showDisabled]);

  return (
    <div className="rounded-2xl border bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-xs font-medium text-zinc-500">Rules Manager</div>
          <div className="text-base font-semibold">Active recommendation rules</div>
        </div>
        <button
          type="button"
          className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-semibold text-white"
          onClick={() => setEditing(createEmptyEditableRuleForm())}
        >
          New rule
        </button>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
        <select className="rounded border px-2 py-1.5" value={scopeFilter} onChange={(e) => setScopeFilter(e.target.value)}>
          <option value="ALL">All scopes</option>
          <option value="GLOBAL">Global</option>
          <option value="ORGANIZATION">Organization</option>
          <option value="TEAM">Team</option>
          <option value="PLAYER">Player</option>
          <option value="MATCH_CONTEXT">Match context</option>
          <option value="PROTECTED_PLAYER">Protected player</option>
        </select>

        <label className="inline-flex items-center gap-2 text-xs text-zinc-700">
          <input type="checkbox" checked={showDisabled} onChange={(e) => setShowDisabled(e.target.checked)} />
          Show disabled
        </label>
      </div>

      {editing ? (
        <div className="mt-3">
          <RuleEditor
            initial={editing}
            onCancel={() => setEditing(null)}
            onSave={(form) => {
              const nextRule = mapFormToCoachRule(form);
              const next = [...rules.filter((r) => r.id !== nextRule.id), nextRule].sort((a, b) => b.priority - a.priority);
              onChange(next);
              setEditing(null);
            }}
          />
        </div>
      ) : null}

      <div className="mt-3 grid gap-2">
        {filtered.length === 0 ? <div className="rounded border bg-zinc-50 px-3 py-2 text-sm text-zinc-600">No rules for this filter.</div> : null}

        {filtered.map((rule) => {
          const form = mapCoachRuleToForm(rule);
          return (
            <div key={rule.id} className="rounded-xl border px-3 py-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold text-zinc-900">{rule.name}</div>
                  <div className="text-xs text-zinc-500">
                    {rule.scope} · {rule.severity} · Priority {rule.priority}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="rounded border px-2 py-1 text-xs"
                    onClick={() => setEditing(form)}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="rounded border px-2 py-1 text-xs"
                    onClick={() =>
                      onChange(
                        rules.map((r) =>
                          r.id === rule.id
                            ? { ...r, id: `${r.id}-copy-${Date.now()}`, name: `${r.name} (copy)`, updatedAt: new Date().toISOString() }
                            : r,
                        ),
                      )
                    }
                  >
                    Duplicate
                  </button>
                  <button
                    type="button"
                    className="rounded border px-2 py-1 text-xs"
                    onClick={() =>
                      onChange(
                        rules.map((r) => (r.id === rule.id ? { ...r, enabled: !r.enabled, updatedAt: new Date().toISOString() } : r)),
                      )
                    }
                  >
                    {rule.enabled ? "Disable" : "Enable"}
                  </button>
                </div>
              </div>
              <div className="mt-1 text-xs text-zinc-600">{buildRulePreviewText(form)}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
