// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";
import { asAnon, asUser, createDb, failure, one, rows, signUp, type Db } from "./harness";
let db: Db, juan: string, maria: string;
beforeAll(async () => { db = await createDb(); juan = await signUp(db, "juan-sync@example.test", { username: "juan_sync" }); maria = await signUp(db, "maria-sync@example.test", { username: "maria_sync" }); });
const save = "select revision from public.save_account_state($1, $2::jsonb, $3)";
describe("private account sync", () => {
  it("isolates preferences and drafts and rejects direct table writes", async () => {
    await asUser(db, juan);
    expect(await one(db, save, ["prefs:display", '{"fontSize":18}', 0])).toEqual({ revision: 1 });
    expect(await failure(db, "update public.account_state set value = '{}'" )).toMatch(/permission denied/);
    await asUser(db, maria);
    expect(await rows(db, "select * from public.account_state")).toEqual([]);
    expect(await one(db, save, ["prefs:display", '{"fontSize":14}', 0])).toEqual({ revision: 1 });
    await asAnon(db);
    expect(await failure(db, save, ["prefs:display", '{}', 0])).toMatch(/permission denied/);
  });
  it("uses compare-and-swap revisions and validates namespaces and size", async () => {
    await asUser(db, juan);
    expect(await one(db, save, ["prefs:display", '{"fontSize":20}', 1])).toEqual({ revision: 2 });
    expect(await failure(db, save, ["prefs:display", '{}', 1])).toMatch(/STATE_CONFLICT/);
    expect(await one(db, "select value from public.account_state where key='prefs:display'")).toEqual({ value: { fontSize: 20 } });
    const key = "draft:20000000-0000-4000-8000-000000000001:main";
    expect(await one(db, save, [key, JSON.stringify("private draft"), 0])).toEqual({ revision: 1 });
    expect(await one(db, save, [key, '""', 1])).toEqual({ revision: 2 });
    expect(await failure(db, save, [key, JSON.stringify("x".repeat(5001)), 2])).toMatch(/STATE_INVALID/);
    expect(await failure(db, save, ["admin:role", '"super_admin"', 0])).toMatch(/STATE_INVALID/);
    expect(await failure(db, save, ["prefs:display", '[]', 2])).toMatch(/STATE_INVALID/);
    expect(await failure(db, save, [key, 'null', -1])).toMatch(/STATE_INVALID/);
    await asUser(db, maria);
    expect(await rows(db, "select value from public.account_state where key = $1", [key])).toEqual([]);
  });
});
