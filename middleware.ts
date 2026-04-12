import { NextResponse, type NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  // ✅ Always allow public + static
  if (
    pathname === "/" ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/signup") ||
    pathname.startsWith("/reset-password") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/home") ||
    pathname.startsWith("/pricing") ||
    pathname === "/favicon.ico" ||
    pathname.startsWith("/api")
  ) {
    return NextResponse.next();
  }

  // ✅ Only protect these routes
  const isProtected =
    pathname.startsWith("/coach") ||
    pathname.startsWith("/player") ||
    pathname.startsWith("/team") ||
    pathname.startsWith("/auth/redirect");

  if (!isProtected) return NextResponse.next();

  // ✅ Supabase cookies (any sb-* cookie)
  const hasSbCookie = req.cookies
    .getAll()
    .some((c) => c.name.startsWith("sb-") && c.value);

  if (hasSbCookie) return NextResponse.next();

  // 🔁 Redirect unauthenticated users
  const nextParam = encodeURIComponent(pathname + search);
  const loginUrl = new URL(`/login?next=${nextParam}`, req.url);

  return NextResponse.redirect(loginUrl);
}

// 🚨 CRITICAL: Do NOT include "/" here
export const config = {
  matcher: ["/coach/:path*", "/player/:path*", "/team/:path*", "/auth/redirect", "/reset-password"],
};