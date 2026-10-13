import { NextResponse, type NextRequest } from "next/server";
import { limiters } from "@/lib/rate-limit";
import { BlockedUrlError, safeFetch, vetUrl } from "@/lib/ssrf";
import { createClient } from "@/lib/supabase/server";
import { parseMeta, type LinkPreview } from "@/lib/unfurl";
import { signedImageUrl } from "@/lib/unfurl-sign";

const IMAGE_TYPES = /^image\/(png|jpeg|gif|webp)\b/i;
const TTL_MS = 60 * 60 * 1000;
// shortcut: per-instance memory cache; move to a shared store (Upstash) if previews get hot.
const cache = new Map<string, { at: number; value: LinkPreview | null }>();

/**
 * GET /api/unfurl?url=… — a link preview for signed-in users. The page is fetched server-side
 * through the SSRF guard (public addresses only, re-checked on redirects, 512 KB, 5 s).
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const raw = request.nextUrl.searchParams.get("url") ?? "";
  const url = raw.length <= 2048 ? vetUrl(raw) : null;
  if (!url) return NextResponse.json({ error: "Link not allowed" }, { status: 400 });
  const key = url.toString();
  const headers = { "Cache-Control": "private, max-age=3600" };

  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return NextResponse.json({ preview: hit.value }, { headers });
  if (!limiters.unfurl.check(`unfurl:${user.id}`).ok) return NextResponse.json({ error: "Too many previews" }, { status: 429 });

  let preview: LinkPreview | null = null;
  try {
    const res = await safeFetch(key, { accept: "text/html,application/xhtml+xml;q=0.9,image/*;q=0.8", maxBytes: 512 * 1024 });
    if (res.status < 400 && IMAGE_TYPES.test(res.contentType)) {
      // A direct image link: the preview is the image itself.
      preview = { url: key, siteName: new URL(res.url).hostname.replace(/^www\./, ""), title: null, description: null, image: signedImageUrl(res.url), color: null };
    } else if (res.status < 400 && /html/i.test(res.contentType)) {
      const charset = /charset=([\w-]+)/i.exec(res.contentType)?.[1] ?? "utf-8";
      let html: string;
      try {
        html = new TextDecoder(charset).decode(res.body);
      } catch {
        html = res.body.toString("utf8");
      }
      const meta = parseMeta(html, res.url);
      if (meta.title || meta.description || meta.image) preview = { url: key, ...meta, image: meta.image ? signedImageUrl(meta.image) : null };
    }
  } catch (err) {
    if (err instanceof BlockedUrlError) return NextResponse.json({ error: "Link not allowed" }, { status: 400 });
    preview = null;
  }
  if (cache.size >= 500) cache.delete(cache.keys().next().value!);
  cache.set(key, { at: Date.now(), value: preview });
  return NextResponse.json({ preview }, { headers });
}
