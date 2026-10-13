import { NextResponse, type NextRequest } from "next/server";
import { BlockedUrlError, safeFetch } from "@/lib/ssrf";
import { verifyImageUrl } from "@/lib/unfurl-sign";

const MAX_BYTES = 3 * 1024 * 1024;
const TYPES = /^image\/(png|jpeg|gif|webp)$/i;

/**
 * GET /api/unfurl/image?u=…&s=… — serves a preview's image from our origin (the CSP blocks
 * third-party images). Only URLs /api/unfurl signed are fetched, through the SSRF guard; only
 * raster images up to 3 MB come back, with sniffing and scripting switched off.
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get("u") ?? "";
  const signature = request.nextUrl.searchParams.get("s") ?? "";
  if (!url || !verifyImageUrl(url, signature)) return new NextResponse(null, { status: 403 });
  try {
    const res = await safeFetch(url, { accept: "image/webp,image/png,image/jpeg,image/gif", maxBytes: MAX_BYTES + 1, timeoutMs: 8000 });
    const type = res.contentType.split(";")[0].trim().toLowerCase();
    if (res.status >= 400 || !TYPES.test(type) || res.body.length > MAX_BYTES) return new NextResponse(null, { status: 404 });
    return new NextResponse(new Uint8Array(res.body), {
      headers: {
        "Content-Type": type,
        "Cache-Control": "public, max-age=86400, immutable",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
      },
    });
  } catch (err) {
    return new NextResponse(null, { status: err instanceof BlockedUrlError ? 403 : 502 });
  }
}
