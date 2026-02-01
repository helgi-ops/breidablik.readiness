import { NextResponse, type NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  // Protected routes
  const isProtected =
    pathname.startsWith("/player") ||
    pathname.startsWith("/coach") ||
    pathname.startsWith("/checkin");

  if (!isProtected) return NextResponse.next();

  // Detect Supabase session cookie (sb-*)
  const hasSbCookie = req.cookies.getAll().some((c) => c.name.startsWith("sb-") && c.value);
  if (hasSbCookie) return NextResponse.next();

  // Build login URL robustly
  const nextParam = encodeURIComponent(pathname + search);
  const loginUrl = new URL(`/login?next=${nextParam}`, req.url);

  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/player/:path*", "/coach/:path*", "/checkin/:path*"],
};
