// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { checkDatabase, databaseCheckState } from "../../scripts/check-database.mjs";

describe("database readiness", () => {
  it("distinguishes a missing migration from denied anonymous access and invalid credentials", () => {
    expect(databaseCheckState(404, "PGRST205")).toBe("missing");
    expect(databaseCheckState(404, "PGRST202")).toBe("missing");
    expect(databaseCheckState(401, "42501")).toBe("present");
    expect(databaseCheckState(403, "42501")).toBe("present");
    expect(databaseCheckState(200, undefined)).toBe("present");
    expect(databaseCheckState(401, "PGRST301")).toBe("inconclusive");
    expect(databaseCheckState(503, undefined)).toBe("inconclusive");
  });

  it("probes schema without reading documents or using a service-role credential", async () => {
    const request = vi.fn<typeof fetch>().mockImplementation(async () => new Response(JSON.stringify({ code: "42501" }), { status: 401 }));
    const results = await checkDatabase({ SUPABASE_URL: "https://example.supabase.co/", SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test", SUPABASE_SERVICE_ROLE_KEY: "private" }, request);
    expect(results.map((result: { state: string }) => result.state)).toEqual(["present", "present"]);
    expect(request.mock.calls[0][0]).toBe("https://example.supabase.co/rest/v1/workspace_documents?select=id&limit=0");
    const options = request.mock.calls[1][1];
    expect(options?.headers).toEqual({ apikey: "sb_publishable_test", "Content-Type": "application/json" });
    expect(options?.body).toBe(JSON.stringify({ p_channel: "00000000-0000-0000-0000-000000000000" }));
    expect(request.mock.calls.map(([url]) => String(url))).not.toEqual(expect.arrayContaining([expect.stringContaining("save_workspace_document"), expect.stringContaining("delete_workspace_document")]));
  });

  it("never reports readiness when configuration or the network fails", async () => {
    await expect(checkDatabase({}, vi.fn())).rejects.toThrow("Set SUPABASE_URL");
    const request = vi.fn<typeof fetch>().mockRejectedValue(new TypeError("Failed to fetch"));
    const results = await checkDatabase({ SUPABASE_URL: "https://example.supabase.co", SUPABASE_ANON_KEY: "public" }, request);
    expect(results.every((result: { state: string }) => result.state === "inconclusive")).toBe(true);
  });
});
