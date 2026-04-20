"use client";

import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";

// ── Types ────────────────────────────────────────────────────────────

type Step = "credentials" | "parameters" | "test";
type ConnectionStatus = "idle" | "testing" | "success" | "error";

// ── Auth helper ──────────────────────────────────────────────────────

async function getAuthToken(): Promise<string | null> {
  const supabase = getSupabaseClient();
  const { data } = await supabase.auth.getSession();
  return data?.session?.access_token ?? null;
}

// ── Required Catapult Reporting Parameters ───────────────────────────

const REQUIRED_PARAMS = [
  { group: "Base (venjulega sjálfgefið)", items: [
    "Total Distance",
    "Velocity Band 5 Total Distance",
    "Velocity Band 6 Total Distance",
    "Total Player Load",
    "Player Load Per Minute",
    "Max Velocity",
    "HI Running Dist",
  ]},
  { group: "IMA (Inertial Movement Analysis)", items: [
    "IMA Accel High",
    "IMA Accel Medium",
    "IMA Accel Low",
    "IMA Decel High",
    "IMA Decel Medium",
    "IMA Decel Low",
    "IMA CoD Left High",
    "IMA CoD Right High",
  ]},
  { group: "Metabolic Power", items: [
    "Peak Meta Power",
    "High Metabolic Load Dist (m)",
    "Meta Energy (KJ/kg)",
  ]},
];

// ── Component ────────────────────────────────────────────────────────

export default function CatapultSetupWizard() {
  const [step, setStep] = useState<Step>("credentials");
  const [apiKey, setApiKey] = useState("");
  const [orgId, setOrgId] = useState("");
  const [apiBase, setApiBase] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saved, setSaved] = useState(false);
  const [connStatus, setConnStatus] = useState<ConnectionStatus>("idle");
  const [connMessage, setConnMessage] = useState("");
  const [isOpen, setIsOpen] = useState(false);

  // Load existing credentials on mount
  useEffect(() => {
    (async () => {
      try {
        const token = await getAuthToken();
        if (!token) return;
        const res = await fetch("/api/team/settings", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const data = await res.json();
        if (data.catapult_api_key) {
          setApiKey(data.catapult_api_key);
          setOrgId(data.catapult_org_id ?? "");
          setApiBase(data.catapult_api_base ?? "");
          setSaved(true);
        }
      } catch { /* ignore */ }
    })();
  }, []);

  const hasCredentials = apiKey.trim().length > 0 && orgId.trim().length > 0;

  async function saveCredentials() {
    setSaving(true);
    setSaveError("");
    try {
      const token = await getAuthToken();
      if (!token) throw new Error("Ekki innskráð/ur");
      const res = await fetch("/api/team/settings", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          catapult_api_key: apiKey.trim(),
          catapult_org_id: orgId.trim(),
          catapult_api_base: apiBase.trim() || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Villa við að vista");
      }
      setSaved(true);
      setStep("parameters");
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Villa við að vista");
    } finally {
      setSaving(false);
    }
  }

  async function testConnection() {
    setConnStatus("testing");
    setConnMessage("");
    try {
      const token = await getAuthToken();
      if (!token) throw new Error("Ekki innskráð/ur");
      const res = await fetch("/api/integrations/catapult/test-connection", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          apiKey: apiKey.trim(),
          orgId: orgId.trim(),
          apiBase: apiBase.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setConnStatus("success");
        setConnMessage(data.message ?? "Tenging virkar!");
      } else {
        setConnStatus("error");
        setConnMessage(data.error ?? "Tenging mistókst");
      }
    } catch (err) {
      setConnStatus("error");
      setConnMessage(err instanceof Error ? err.message : "Villa");
    }
  }

  async function triggerSync() {
    try {
      const token = await getAuthToken();
      if (!token) return;
      await fetch("/api/integrations/catapult/daily-sync?skipPush=1", {
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch { /* best effort */ }
  }

  // ── Step indicator ─────────────────────────────────────────────────

  const steps: { key: Step; label: string; num: number }[] = [
    { key: "credentials", label: "Tengja Catapult", num: 1 },
    { key: "parameters", label: "Parameter uppsetning", num: 2 },
    { key: "test", label: "Prófa tengingu", num: 3 },
  ];

  function stepDone(s: Step): boolean {
    if (s === "credentials") return saved;
    if (s === "parameters") return step === "test";
    if (s === "test") return connStatus === "success";
    return false;
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      {/* Header */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between p-4 text-left"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-100">
            <svg className="h-5 w-5 text-emerald-700" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.348 14.652a3.75 3.75 0 0 1 0-5.304m5.304 0a3.75 3.75 0 0 1 0 5.304m-7.425 2.121a6.75 6.75 0 0 1 0-9.546m9.546 0a6.75 6.75 0 0 1 0 9.546M5.106 18.894c-3.808-3.807-3.808-9.98 0-13.788m13.788 0c3.808 3.807 3.808 9.98 0 13.788" />
            </svg>
          </div>
          <div>
            <div className="text-sm font-semibold text-slate-900">Catapult GPS tenging</div>
            <div className="text-xs text-slate-500">
              {saved && connStatus === "success"
                ? "Tengt og virkar"
                : saved
                  ? "Credentials vistaðar — kláraðu uppsetningu"
                  : "Tengdu Catapult OpenField til að sækja GPS gögn sjálfvirkt"}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {saved && (
            <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${
              connStatus === "success"
                ? "bg-emerald-100 text-emerald-800"
                : "bg-amber-100 text-amber-800"
            }`}>
              {connStatus === "success" ? "Tengt" : "Í uppsetningu"}
            </span>
          )}
          <svg className={`h-4 w-4 text-slate-400 transition-transform ${isOpen ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
          </svg>
        </div>
      </button>

      {isOpen && (
        <div className="border-t border-slate-200 p-4">
          {/* Step indicator */}
          <div className="mb-5 flex items-center gap-1">
            {steps.map((s, i) => (
              <div key={s.key} className="flex items-center gap-1">
                {i > 0 && <div className="mx-1 h-px w-6 bg-slate-300" />}
                <button
                  type="button"
                  onClick={() => setStep(s.key)}
                  className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
                    step === s.key
                      ? "bg-slate-900 text-white"
                      : stepDone(s.key)
                        ? "bg-emerald-100 text-emerald-800"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {stepDone(s.key) ? (
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                    </svg>
                  ) : (
                    <span className="font-bold">{s.num}</span>
                  )}
                  {s.label}
                </button>
              </div>
            ))}
          </div>

          {/* ── Step 1: Credentials ──────────────────────────── */}
          {step === "credentials" && (
            <div className="space-y-4">
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
                <div className="text-xs font-semibold text-blue-900 mb-2">Hvar finn ég API Key?</div>
                <ol className="text-xs text-blue-800 space-y-1.5 list-decimal pl-4">
                  <li>Skráðu þig inn á <strong>OpenField Cloud</strong> (eu.openfield.catapultsports.com)</li>
                  <li>Farðu í <strong>Settings</strong> tab efst → <strong>API Tokens</strong> í vinstri valmynd</li>
                  <li>Sláðu inn nafn (t.d. &quot;MicroPulse&quot;), hakaðu við <strong>&quot;Token never expires&quot;</strong></li>
                  <li>Veldu scope: <strong>Summary Data</strong></li>
                  <li>Smelltu á <strong>Create</strong> og afritaðu token-ið</li>
                </ol>
                <div className="mt-3 text-xs font-semibold text-blue-900 mb-1.5">Hvar finn ég Organization ID?</div>
                <p className="text-xs text-blue-800">
                  Org ID sést í URL-inu þegar þú ert innskráð/ur á OpenField: <code className="rounded bg-blue-100 px-1">eu.openfield.catapultsports.com/org/<strong>1234</strong>/...</code> — tölustafir á eftir <code>/org/</code>.
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">API Key</label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={e => { setApiKey(e.target.value); setSaved(false); }}
                  placeholder="eyJhbGciOiJSUz..."
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs focus:border-slate-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Organization ID</label>
                <input
                  type="text"
                  value={orgId}
                  onChange={e => { setOrgId(e.target.value); setSaved(false); }}
                  placeholder="t.d. 2415"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs focus:border-slate-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  API Base URL <span className="text-slate-400 font-normal">(valfrjálst — sjálfgefið EU)</span>
                </label>
                <input
                  type="text"
                  value={apiBase}
                  onChange={e => { setApiBase(e.target.value); setSaved(false); }}
                  placeholder="https://backend-eu.openfield.catapultsports.com"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-500 focus:border-slate-500 focus:outline-none"
                />
              </div>

              {saveError && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-800">{saveError}</div>
              )}

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={saveCredentials}
                  disabled={!hasCredentials || saving}
                  className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                >
                  {saving ? "Vista..." : saved ? "Vistað ✓" : "Vista credentials"}
                </button>
                {saved && (
                  <button
                    type="button"
                    onClick={() => setStep("parameters")}
                    className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Næsta skref →
                  </button>
                )}
              </div>
            </div>
          )}

          {/* ── Step 2: Parameters ───────────────────────────── */}
          {step === "parameters" && (
            <div className="space-y-4">
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                <div className="text-xs font-semibold text-amber-900 mb-1.5">Mikilvægt: Bættu við Reporting Parameters í Catapult</div>
                <p className="text-xs text-amber-800 mb-2">
                  MicroPulse þarf ákveðnar mælingar frá Catapult til að reikna álag, mechanical load og metabolic profíl.
                  Þú þarft að bæta þeim við í OpenField svo gögnin komi sjálfkrafa.
                </p>
                <ol className="text-xs text-amber-800 space-y-1.5 list-decimal pl-4">
                  <li>Opnaðu <strong>Catapult OpenField Cloud</strong></li>
                  <li>Farðu í <strong>Settings → Parameters → Parameter Groups</strong></li>
                  <li>Opnaðu <strong>&quot;Reporting_Parameters&quot;</strong> group (eða búðu hann til)</li>
                  <li>Bættu við öllum parameters sem eru listaðir hér fyrir neðan</li>
                  <li>Smelltu á <strong>Save</strong></li>
                </ol>
              </div>

              {REQUIRED_PARAMS.map(group => (
                <div key={group.group} className="rounded-lg border border-slate-200 p-3">
                  <div className="text-xs font-semibold text-slate-800 mb-2">{group.group}</div>
                  <div className="grid gap-1 sm:grid-cols-2">
                    {group.items.map(param => (
                      <div key={param} className="flex items-center gap-1.5 text-xs text-slate-600">
                        <div className="h-1.5 w-1.5 rounded-full bg-slate-400 shrink-0" />
                        <code className="font-mono text-[11px]">{param}</code>
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="text-xs text-slate-600">
                  <strong>Athugaðu:</strong> Ef þú getur ekki bætt við öllum parameters, þá mun kerfið samt virka
                  með base metrics (distance, player load, velocity). IMA og metabolic gögn verða þá ekki tiltæk.
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setStep("credentials")}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  ← Til baka
                </button>
                <button
                  type="button"
                  onClick={() => setStep("test")}
                  className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800"
                >
                  Búinn — prófa tengingu →
                </button>
              </div>
            </div>
          )}

          {/* ── Step 3: Test connection ──────────────────────── */}
          {step === "test" && (
            <div className="space-y-4">
              <div className="text-xs text-slate-600">
                Smelltu á hnappinn til að prófa hvort MicroPulse nái sambandi við Catapult reikninginn þinn.
              </div>

              <button
                type="button"
                onClick={testConnection}
                disabled={connStatus === "testing" || !hasCredentials}
                className="rounded-lg bg-emerald-600 px-5 py-2.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {connStatus === "testing" ? "Prófa..." : "Prófa tengingu"}
              </button>

              {connStatus === "success" && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <svg className="h-4 w-4 text-emerald-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                    </svg>
                    <span className="text-xs font-semibold text-emerald-800">{connMessage}</span>
                  </div>
                  <div className="text-xs text-emerald-700">
                    Catapult gögn verða sjálfkrafa sótt á hverjum degi. Þú getur líka keyrt sync handvirkt.
                  </div>
                  <button
                    type="button"
                    onClick={triggerSync}
                    className="rounded-lg border border-emerald-300 bg-white px-3 py-1.5 text-[11px] font-semibold text-emerald-800 hover:bg-emerald-50"
                  >
                    Keyra sync núna
                  </button>
                </div>
              )}

              {connStatus === "error" && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                  <div className="flex items-center gap-2">
                    <svg className="h-4 w-4 text-red-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
                    </svg>
                    <span className="text-xs font-semibold text-red-800">{connMessage}</span>
                  </div>
                  <div className="mt-1.5 text-xs text-red-700">
                    Athugaðu að API key og Org ID séu rétt. Farðu í skref 1 til að laga.
                  </div>
                </div>
              )}

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setStep("parameters")}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  ← Til baka
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
