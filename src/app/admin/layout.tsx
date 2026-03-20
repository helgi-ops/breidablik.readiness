"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    async function checkAdmin() {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) { router.replace("/login"); return; }

      const { data: prof } = await supabase
        .from("profiles")
        .select("is_admin")
        .eq("id", auth.user.id)
        .maybeSingle();

      if (!(prof as any)?.is_admin) {
        router.replace("/");
        return;
      }
      setChecking(false);
    }
    checkAdmin();
  }, [router]);

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground text-sm">
        Sæki heimildir…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto max-w-7xl px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold tracking-tight">⚙️ Admin</span>
            <span className="hidden text-xs text-muted-foreground sm:block">Breiðablik Readiness</span>
          </div>
          <nav className="flex items-center gap-2 text-sm text-muted-foreground">
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
