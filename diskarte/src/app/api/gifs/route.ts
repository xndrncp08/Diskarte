import { NextResponse, type NextRequest } from "next/server";
import type { Gif } from "@/lib/gifs";
import { limiters } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";

const PAGE = 24;

interface GiphyImage {
  url?: string;
  webp?: string;
  width?: string;
  height?: string;
}
interface GiphyResult {
  id: string;
  title?: string;
  images?: { fixed_width?: GiphyImage; downsized?: GiphyImage };
}

/**
 * GET /api/gifs?q=…&offset=… — GIPHY search (trending when q is empty) for signed-in users.
 * The API key (GIPHY_API_KEY) stays on the server; results are rated PG-13 at most.
 */
export async function GET(request: NextRequest) {
  const key = process.env.GIPHY_API_KEY;
  if (!key) return NextResponse.json({ error: "GIF search isn't set up" }, { status: 503 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!limiters.unfurl.check(`gifs:${user.id}`).ok) return NextResponse.json({ error: "Too many searches" }, { status: 429 });

  const q = (request.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 50);
  const offset = Math.min(Math.max(0, Number.parseInt(request.nextUrl.searchParams.get("offset") ?? "0", 10) || 0), 4999);
  const params = new URLSearchParams({ api_key: key, limit: String(PAGE), offset: String(offset), rating: "pg-13", bundle: "messaging_non_clips" });
  if (q) params.set("q", q);
  const res = await fetch(`https://api.giphy.com/v1/gifs/${q ? "search" : "trending"}?${params}`, { next: { revalidate: q ? 300 : 900 } }).catch(() => null);
  if (!res?.ok) return NextResponse.json({ error: "GIPHY didn't answer" }, { status: 502 });

  const body = (await res.json()) as { data?: GiphyResult[]; pagination?: { total_count?: number } };
  const gifs: Gif[] = (body.data ?? []).flatMap((g) => {
    const small = g.images?.fixed_width;
    const send = g.images?.downsized;
    const preview = small?.webp ?? small?.url;
    if (!preview || !send?.url) return [];
    return [{ id: g.id, title: g.title ?? "GIF", preview, width: Number(small?.width) || 200, height: Number(small?.height) || 150, url: send.url.split("?")[0] }];
  });
  const more = offset + PAGE < (body.pagination?.total_count ?? 0);
  return NextResponse.json({ gifs, next: more ? offset + PAGE : null }, { headers: { "Cache-Control": "private, max-age=300" } });
}
