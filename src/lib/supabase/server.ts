import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

type CookieStoreLike = {
  get: (name: string) => { value: string } | undefined;
  set?: (input: { name: string; value: string } & Record<string, unknown>) => void;
};

export async function createSupabaseServerClient() {
  const cookieStore = (await cookies()) as unknown as CookieStoreLike;

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: Record<string, unknown>) {
          try {
            cookieStore.set?.({ name, value, ...options });
          } catch {
            // middleware/edge eða readonly context → OK
          }
        },
        remove(name: string, options: Record<string, unknown>) {
          try {
            cookieStore.set?.({ name, value: "", ...options });
          } catch {
            // OK
          }
        },
      },
    }
  );
}
