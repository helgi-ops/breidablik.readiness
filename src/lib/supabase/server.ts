import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export function createSupabaseServerClient() {
  const cookieStore = cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          // TS-safe
          return (cookieStore as any).get(name)?.value;
        },
        set(name: string, value: string, options: any) {
          try {
            // TS: cookies() er typed readonly, en í runtime virkar þetta í server contexts
            (cookieStore as any).set({ name, value, ...options });
          } catch {
            // middleware/edge eða readonly context → OK
          }
        },
        remove(name: string, options: any) {
          try {
            (cookieStore as any).set({ name, value: "", ...options });
          } catch {
            // OK
          }
        },
      },
    }
  );
}
