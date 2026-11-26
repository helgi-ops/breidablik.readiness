import type { MetadataRoute } from "next";
import { OPERATOR } from "@/lib/legal/operator";

/**
 * Public marketing and legal pages may be indexed; the app itself (signed-in
 * surfaces, invites, API) may not.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/", "/admin", "/auth/", "/checkin", "/client", "/coach", "/dashboard", "/demo",
          "/exec", "/invite/", "/join", "/player", "/reset-password", "/settings", "/stage4",
          "/team", "/trainer",
        ],
      },
    ],
    sitemap: `${OPERATOR.siteUrl}/sitemap.xml`,
  };
}
