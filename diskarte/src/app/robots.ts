import type { MetadataRoute } from "next";
import { tryGetPublicEnv } from "@/lib/env";

export default function robots(): MetadataRoute.Robots {
  const base = tryGetPublicEnv()?.siteUrl;
  return {
    rules: [{ userAgent: "*", allow: ["/", "/invite/", "/docs"], disallow: ["/tambayan", "/settings", "/onboarding", "/api/"] }],
    ...(base ? { sitemap: `${base}/sitemap.xml` } : {}),
  };
}
