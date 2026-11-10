// @vitest-environment node
import { expect, it, vi } from "vitest";
import { createFakeSupabase } from "../../../tests/fixtures/fake-supabase";
import { makeProfile, OWNER_ID } from "../../../tests/fixtures/server";

vi.mock("server-only", () => ({}));
const tables: Record<string, unknown[]> = {};
const fake = createFakeSupabase(tables);
const client = { ...fake.client, auth: { getUser: async () => ({ data: { user: { id: OWNER_ID } }, error: null }) } };
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => client }));
const { getCurrentProfile } = await import("../auth");

// The public profile never says "invisible" (migration 20261109000000); only my own privacy row does.
it("reads my real status: invisible comes from my private settings", async () => {
  tables.profiles = [{ ...makeProfile(OWNER_ID, "Kapitan"), status: "dnd" }];
  tables.privacy_settings = [{ user_id: OWNER_ID, invisible: true }];
  expect((await getCurrentProfile())?.status).toBe("invisible");
});
