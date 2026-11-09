"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { sessionNeedsMfa } from "@/lib/auth/mfaClient";
import MfaChallenge from "@/components/auth/MfaChallenge";
import { useLang } from "@/lib/lang";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [needsCode, setNeedsCode] = useState(false);
  const [recheck, setRecheck] = useState(0);
  const [lang] = useLang();

  useEffect(() => {
    async function checkAdmin() {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) { router.replace("/login"); return; }

      // Code first: once two-step sign-in is enforced, a session without a code cannot read the profile below.
      if (await sessionNeedsMfa()) {
        setNeedsCode(true);
        setChecking(false);
        return;
      }

      const { data: prof } = await supabase
        .from("profiles")
        .select("is_admin")
        .eq("id", auth.user.id)
        .maybeSingle();

      if (!(prof as { is_admin?: boolean } | null)?.is_admin) {
        router.replace("/");
        return;
      }
      setNeedsCode(false);
      setChecking(false);
    }
    checkAdmin();
  }, [router, recheck]);

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground text-sm">
        Sæki heimildir…
      </div>
    );
  }

  if (needsCode) {
    return (
      <div className="min-h-screen bg-background px-4">
        <MfaChallenge onVerified={() => { setChecking(true); setNeedsCode(false); setRecheck((n) => n + 1); }} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto max-w-7xl px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold tracking-tight">⚙️ Admin</span>
            <span className="hidden text-xs text-muted-foreground sm:block">MicroPulse</span>
          </div>
          <nav className="flex items-center gap-3 text-sm text-muted-foreground">
            <a href="/admin/drill-upload" className="font-medium text-foreground hover:underline">⬆️ Hlaða í safn þjálfara</a>
            <a href="/admin/security" className="hover:text-foreground transition-colors">{lang === "IS" ? "Öryggi" : "Security"}</a>
            <a href="/coach" className="hover:text-foreground transition-colors">← Þjálfari</a>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">
        {children}
      </main>
    </div>
  );
}
