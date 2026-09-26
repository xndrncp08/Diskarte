// @vitest-environment node
import { TokenVerifier } from "livekit-server-sdk";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { limiters } from "@/lib/rate-limit";

const USER = "00000000-0000-4000-8000-000000000001";
const VOICE = "20000000-0000-4000-8000-000000000003";
const TEXT = "20000000-0000-4000-8000-000000000001";

let currentUser: { id: string } | null = { id: USER };
const channels: Record<string, { id: string; type: string; server_id: string }> = {
  [VOICE]: { id: VOICE, type: "voice", server_id: "s1" },
  [TEXT]: { id: TEXT, type: "text", server_id: "s1" },
};

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: currentUser } }) },
    from: (table: string) => {
      let id = "";
      const api = {
        select: () => api,
        eq: (_c: string, v: string) => ((id = v), api),
        maybeSingle: async () => ({ data: table === "channels" ? (channels[id] ?? null) : null }),
        single: async () => ({ data: { display_name: "Juan", username: "juan", avatar_url: null, avatar_preset: "ube" } }),
      };
      return api;
    },
  }),
}));

const { POST } = await import("../route");

function request(body: unknown) {
  return new NextRequest("http://localhost/api/livekit/token", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });
}

beforeEach(() => {
  currentUser = { id: USER };
  limiters.voiceToken.reset();
  vi.stubEnv("SUPABASE_URL", "https://proj.supabase.co");
  vi.stubEnv("SUPABASE_ANON_KEY", "anon-key-that-is-long-enough");
  vi.stubEnv("LIVEKIT_URL", "wss://proj.livekit.cloud");
  vi.stubEnv("LIVEKIT_API_KEY", "APIdiskarte");
  vi.stubEnv("LIVEKIT_API_SECRET", "a-very-long-livekit-secret-for-tests-123456");
});

describe("POST /api/livekit/token", () => {
  it("requires a session", async () => {
    currentUser = null;
    expect((await POST(request({ channelId: VOICE }))).status).toBe(401);
  });

  it("validates the channel id and type", async () => {
    expect((await POST(request({ channelId: "nope" }))).status).toBe(400);
    expect((await POST(request({ channelId: "30000000-0000-4000-8000-000000000009" }))).status).toBe(404);
    expect((await POST(request({ channelId: TEXT }))).status).toBe(400);
  });

  it("mints a room-scoped token bound to the user's identity", async () => {
    const res = await POST(request({ channelId: VOICE }));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = await res.json();
    expect(body).toMatchObject({ url: "wss://proj.livekit.cloud", room: `voice:${VOICE}` });
    const claims = await new TokenVerifier("APIdiskarte", "a-very-long-livekit-secret-for-tests-123456").verify(body.token);
    expect(claims.sub).toBe(USER);
    expect(claims.name).toBe("Juan");
    expect(claims.video).toMatchObject({ room: `voice:${VOICE}`, roomJoin: true, canPublish: true, canSubscribe: true, canUpdateOwnMetadata: false });
    expect(JSON.parse(claims.metadata!)).toMatchObject({ username: "juan", avatar_preset: "ube" });
  });

  it("rejects tokens signed with another secret", async () => {
    const { token } = await (await POST(request({ channelId: VOICE }))).json();
    await expect(new TokenVerifier("APIdiskarte", "some-other-secret-value-xxxxxxxxxxxxxxxxxxx").verify(token)).rejects.toThrow();
  });

  it("rate limits join attempts", async () => {
    for (let i = 0; i < 20; i++) await POST(request({ channelId: VOICE }));
    const res = await POST(request({ channelId: VOICE }));
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBeTruthy();
  });

  it("reports missing LiveKit secrets as 503", async () => {
    vi.stubEnv("LIVEKIT_API_SECRET", "");
    expect((await POST(request({ channelId: VOICE }))).status).toBe(503);
  });
});
