import type { MetadataRoute } from "next";
import { tryGetPublicEnv } from "@/lib/env";
import { allDocSlugs } from "@/lib/docs/site";

/** Public pages only: the landing page and the published Help Center. */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = tryGetPublicEnv()?.siteUrl ?? "http://localhost:3000";
  return [{ url: base }, { url: `${base}/docs` }, ...allDocSlugs().map((slug) => ({ url: `${base}/docs/${slug}` }))];
}
