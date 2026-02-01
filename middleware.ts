import { NextResponse, type NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  // ✅ Leyfa reset-password flæðið (Supabase sendir access_token í URL hash)
  if (pathname.startsWith("/reset-password")) {
    return NextResponse.next();
  }

  // Protected routes (auth redirect líka, því hún þarf session)
  const isProtected =
    pathname.startsWith("/player") ||
    pathname.startsWith("/coach") ||
    pathname.startsWith("/auth/redirect");

  if (!isProtected) return NextResponse.next();

  // Detect Supabase session cookie (sb-*)
  const hasSbCookie = req.cookies.getAll().some((c) => c.name.startsWith("sb-") && c.value);
  if (hasSbCookie) return NextResponse.next();

  // Redirect to login with next
  const nextParam = encodeURIComponent(pathname + search);
  const loginUrl = new URL(`/login?next=${nextParam}`, req.url);

  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/player/:path*", "/coach/:path*", "/auth/redirect", "/reset-password"],
};
