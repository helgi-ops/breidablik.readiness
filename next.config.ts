import type { NextConfig } from "next";

const supabaseOrigin = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "");
const supabaseSocket = supabaseOrigin.replace(/^https:/, "wss:");

/** Enforced: these four cannot break a screen, since the app has no outside forms, plugins or embedders. */
const CSP_ENFORCED = ["frame-ancestors 'self'", "base-uri 'self'", "object-src 'none'", "form-action 'self'"].join("; ");

/**
 * Report-only: the browser logs what this WOULD block and blocks nothing. Enforce it once the coach and player
 * screens run clean. Outside scripts are the upload readers (SheetJS, mammoth, pdf.js); frames are video and Docs.
 */
const CSP_REPORT_ONLY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://cdn.sheetjs.com https://cdnjs.cloudflare.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https:",
  "media-src 'self' blob: https:",
  `connect-src 'self' ${supabaseOrigin} ${supabaseSocket}`,
  "frame-src 'self' blob: https://www.youtube.com https://www.youtube-nocookie.com https://player.vimeo.com https://docs.google.com",
  "worker-src 'self' blob: https://cdnjs.cloudflare.com",
  "frame-ancestors 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "form-action 'self'",
].join("; ");

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: CSP_ENFORCED },
          { key: "Content-Security-Policy-Report-Only", value: CSP_REPORT_ONLY },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
        ],
      },
    ];
  },
  reactCompiler: true,
  compiler: {
    // Strip console.* from PRODUCTION builds (server routes + client bundles)
    // so debug logs can't leak player IDs / load / injury data into prod logs.
    // console.error is kept so genuine failures still surface in ops logging.
    // Development is unaffected — all console output still works locally.
    removeConsole: { exclude: ["error"] },
  },
  experimental: {
    // Disable Turbopack persistence to avoid SST filesystem writes
    turbopackFileSystemCacheForDev: false,
    turbopackFileSystemCacheForBuild: false,
  },
};

export default nextConfig;
