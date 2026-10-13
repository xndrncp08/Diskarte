// @vitest-environment node
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

let user: { id: string } | null = { id: "00000000-0000-4000-8000-00000000000a" };
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser: async () => ({ data: { user } }) } }) }));
vi.stubEnv("LIVEKIT_API_KEY", "key");
vi.stubEnv("LIVEKIT_API_SECRET", "secret-for-tests");

const { GET: unfurl } = await import("@/app/api/unfurl/route");
const { GET: image } = await import("@/app/api/unfurl/image/route");
const { signedImageUrl } = await import("@/lib/unfurl-sign");

const req = (path: string) => new NextRequest(new URL(path, "https://diskarte.test"));

beforeEach(() => {
  user = { id: "00000000-0000-4000-8000-00000000000a" };
});

describe("/api/unfurl", () => {
  it("needs a signed-in user", async () => {
    user = null;
    expect((await unfurl(req("/api/unfurl?url=https://example.com"))).status).toBe(401);
  });

  it("refuses internal and non-web URLs before fetching anything", async () => {
    for (const url of ["http://127.0.0.1/", "http://169.254.169.254/latest/meta-data/", "file:///etc/passwd", "http://localhost:3000/api/admin/snapshot", "https://example.com:8443/"]) {
      expect((await unfurl(req(`/api/unfurl?${new URLSearchParams({ url })}`))).status, url).toBe(400);
    }
  });
});

describe("/api/unfurl/image", () => {
  it("only proxies URLs it signed", async () => {
    expect((await image(req("/api/unfurl/image?u=https://example.com/a.png&s=forged"))).status).toBe(403);
    const signed = signedImageUrl("http://127.0.0.1/a.png")!;
    // Even a signed URL can't reach an internal address.
    expect((await image(req(signed))).status).toBe(403);
  });
});
