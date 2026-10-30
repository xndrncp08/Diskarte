// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ rpc }) }));
vi.mock("@/lib/env", () => ({ getPublicEnv: () => ({ supabaseUrl: "https://proj.supabase.co", supabaseAnonKey: "anon" }) }));
const { POST } = await import("../route");

const ID = "11111111-2222-4333-8444-555555555555";
const TOKEN = "ab".repeat(24);
const call = (body: unknown, id = ID, token = TOKEN) =>
  POST(new Request("https://x/api", { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body) }), { params: Promise.resolve({ id, token }) });

beforeEach(() => rpc.mockReset());

describe("channel webhook route", () => {
  it("posts content (and an optional username) through the database check", async () => {
    rpc.mockResolvedValue({ data: "m1", error: null });
    const res = await call({ content: "Build passed", username: "CI" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: "m1" });
    expect(rpc).toHaveBeenCalledWith("post_webhook_message", { p_id: ID, p_token: TOKEN, p_content: "Build passed", p_name: "CI" });
  });

  it("rejects malformed ids, bodies and content before touching the database", async () => {
    expect((await call({ content: "x" }, "nope")).status).toBe(404);
    expect((await call({ content: "x" }, ID, "short")).status).toBe(404);
    expect((await call("not json")).status).toBe(400);
    expect((await call({ content: "" })).status).toBe(400);
    expect((await call({ content: "x".repeat(2001) })).status).toBe(400);
    expect((await call({ content: "x", username: 5 })).status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("maps a wrong token to 404 and the per-webhook limit to 429", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: "WEBHOOK_NOT_FOUND" } });
    expect((await call({ content: "x" })).status).toBe(404);
    rpc.mockResolvedValueOnce({ data: null, error: { message: "WEBHOOK_RATE_LIMITED" } });
    const limited = await call({ content: "x" });
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBe("60");
  });
});
