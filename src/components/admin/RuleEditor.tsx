"use client";

import { useMemo, useState } from "react";
import { createEmptyEditableRuleForm } from "@/lib/micropulse/adminConfig/ruleFormMapping";
import type { EditableRuleForm } from "@/lib/micropulse/adminConfig";
import { validateEditableRuleForm } from "@/lib/micropulse/adminConfig";

type Props = {
  initial?: EditableRuleForm | null;
  onCancel: () => void;
  onSave: (form: EditableRuleForm) => void;
};

const OPERATORS = ["EQ", "NEQ", "GT", "GTE", "LT", "LTE", "IN", "NOT_IN", "CONTAINS", "TRUE", "FALSE"] as const;
const SCOPES = ["GLOBAL", "ORGANIZATION", "TEAM", "PLAYER", "MATCH_CONTEXT", "PROTECTED_PLAYER"] as const;
const SEVERITIES = ["INFO", "SOFT", "HARD"] as const;

export default function RuleEditor({ initial, onCancel, onSave }: Props) {
  const [form, setForm] = useState<EditableRuleForm>(initial ?? createEmptyEditableRuleForm());
  const validation = useMemo(() => validateEditableRuleForm(form), [form]);

  return (
    <div className="rounded-xl border bg-white p-4">
      <div className="mb-3 text-sm font-semibold">{initial ? "Edit rule" : "New rule"}</div>

      <div className="grid gap-3 md:grid-cols-2">
        <label className="text-xs text-zinc-600">
          Name
          <input
            className="mt-1 w-full rounded border px-2 py-1.5 text-sm"
            value={form.name}
            onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
          />
        </label>

        <label className="text-xs text-zinc-600">
          Priority
          <input
            type="number"
            className="mt-1 w-full rounded border px-2 py-1.5 text-sm"
            value={form.priority}
            onChange={(e) => setForm((p) => ({ ...p, priority: Number(e.target.value) }))}
          />
        </label>

        <label className="text-xs text-zinc-600">
          Scope
          <select
            className="mt-1 w-full rounded border px-2 py-1.5 text-sm"
            value={form.scope}
            onChange={(e) => setForm((p) => ({ ...p, scope: e.target.value as EditableRuleForm["scope"] }))}
          >
            {SCOPES.map((scope) => (
              <option key={scope} value={scope}>
                {scope}
              </option>
            ))}
          </select>
        </label>

        <label className="text-xs text-zinc-600">
          Severity
          <select
            className="mt-1 w-full rounded border px-2 py-1.5 text-sm"
            value={form.severity}
            onChange={(e) => setForm((p) => ({ ...p, severity: e.target.value as EditableRuleForm["severity"] }))}
          >
            {SEVERITIES.map((severity) => (
              <option key={severity} value={severity}>
                {severity}
              </option>
            ))}
          </select>
        </label>

        <label className="text-xs text-zinc-600 md:col-span-2">
          Description
          <textarea
            rows={2}
            className="mt-1 w-full rounded border px-2 py-1.5 text-sm"
            value={form.description ?? ""}
            onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
          />
        </label>

        <label className="inline-flex items-center gap-2 text-xs text-zinc-700">
          <input
            type="checkbox"
            checked={form.enabled}
            onChange={(e) => setForm((p) => ({ ...p, enabled: e.target.checked }))}
          />
          Enabled
        </label>
      </div>

      <div className="mt-4 grid gap-3">
        <div className="rounded border p-3">
          <div className="mb-2 text-xs font-semibold uppercase text-zinc-500">Conditions</div>
          {form.conditions.map((condition, index) => (
            <div key={`cond-${index}`} className="mb-2 grid gap-2 md:grid-cols-3">
              <input
                className="rounded border px-2 py-1.5 text-sm"
                placeholder="Field (e.g. dayType)"
                value={condition.field}
                onChange={(e) =>
                  setForm((p) => ({
                    ...p,
                    conditions: p.conditions.map((c, i) => (i === index ? { ...c, field: e.target.value } : c)),
                  }))
                }
              />
              <select
                className="rounded border px-2 py-1.5 text-sm"
                value={condition.operator}
                onChange={(e) =>
                  setForm((p) => ({
                    ...p,
                    conditions: p.conditions.map((c, i) => (i === index ? { ...c, operator: e.target.value as EditableRuleForm["conditions"][number]["operator"] } : c)),
                  }))
                }
              >
                {OPERATORS.map((op) => (
                  <option key={op} value={op}>
                    {op}
                  </option>
                ))}
              </select>
              <input
                className="rounded border px-2 py-1.5 text-sm"
                placeholder="Value"
                value={Array.isArray(condition.value) ? condition.value.join(",") : condition.value == null ? "" : String(condition.value)}
                onChange={(e) =>
                  setForm((p) => ({
                    ...p,
                    conditions: p.conditions.map((c, i) => (i === index ? { ...c, value: e.target.value } : c)),
                  }))
                }
              />
            </div>
          ))}
          <button
            type="button"
            className="rounded border px-2 py-1 text-xs"
            onClick={() => setForm((p) => ({ ...p, conditions: [...p.conditions, { field: "", operator: "EQ", value: "" }] }))}
          >
            Add condition
          </button>
        </div>

        <div className="rounded border p-3">
          <div className="mb-2 text-xs font-semibold uppercase text-zinc-500">Effects</div>
          {form.effects.map((effect, index) => (
            <div key={`eff-${index}`} className="mb-2 grid gap-2 md:grid-cols-2">
              <input
                className="rounded border px-2 py-1.5 text-sm"
                placeholder="Effect (e.g. setAction)"
                value={effect.type}
                onChange={(e) =>
                  setForm((p) => ({
                    ...p,
                    effects: p.effects.map((c, i) => (i === index ? { ...c, type: e.target.value } : c)),
                  }))
                }
              />
              <input
                className="rounded border px-2 py-1.5 text-sm"
                placeholder="Value"
                value={Array.isArray(effect.value) ? effect.value.join(",") : effect.value == null ? "" : String(effect.value)}
                onChange={(e) =>
                  setForm((p) => ({
                    ...p,
                    effects: p.effects.map((c, i) => (i === index ? { ...c, value: e.target.value } : c)),
                  }))
                }
              />
            </div>
          ))}
          <button
            type="button"
            className="rounded border px-2 py-1 text-xs"
            onClick={() => setForm((p) => ({ ...p, effects: [...p.effects, { type: "", value: "" }] }))}
          >
            Add effect
          </button>
        </div>
      </div>

      {!validation.valid ? (
        <div className="mt-3 rounded border border-red-200 bg-red-50 p-2 text-xs text-red-700">
          {Object.values(validation.errors).slice(0, 3).map((err) => (
            <div key={err}>{err}</div>
          ))}
        </div>
      ) : null}

      <div className="mt-4 flex items-center justify-end gap-2">
        <button type="button" onClick={onCancel} className="rounded border px-3 py-1.5 text-sm">
          Cancel
        </button>
        <button
          type="button"
          onClick={() => {
            const result = validateEditableRuleForm(form);
            if (!result.valid) return;
            onSave(form);
          }}
          className="rounded bg-zinc-900 px-3 py-1.5 text-sm font-semibold text-white"
        >
          Save rule
        </button>
      </div>
    </div>
  );
}
