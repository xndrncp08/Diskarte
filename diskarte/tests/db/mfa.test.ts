// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";
import { asService, asUser, createDb, failure, one, rows, signUp, type Db } from "./harness";

let db: Db;
let juan: string;

beforeAll(async () => {
  db = await createDb();
  juan = await signUp(db, "juan@diskarte.ph", { username: "juan" });
}, 60_000);

const aal = (level: "aal1" | "aal2") => db.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ sub: juan, aal: level })]);

describe("two-factor enforcement", () => {
  it("lets accounts without a verified factor through at aal1", async () => {
    await asUser(db, juan);
    await aal("aal1");
    expect(await one(db, "select public.mfa_ok() as ok")).toEqual({ ok: true });
    await db.query("select public.mfa_pre_request()");
  });

  it("blocks aal1 sessions once a factor is verified, everywhere, until the second step", async () => {
    await asService(db);
    await db.query("insert into auth.mfa_factors (user_id, status) values ($1, 'unverified')", [juan]);
    await asUser(db, juan);
    await aal("aal1");
    // An unfinished enrolment doesn't lock you out.
    expect(await one(db, "select public.mfa_ok() as ok")).toEqual({ ok: true });

    await asService(db);
    await db.query("update auth.mfa_factors set status = 'verified' where user_id = $1", [juan]);
    await asUser(db, juan);
    await aal("aal1");
    expect(await failure(db, "select public.mfa_pre_request()")).toMatch(/MFA_REQUIRED/);
    expect(await rows(db, "select * from realtime.messages")).toEqual([]);
    expect(await failure(db, "insert into storage.objects (bucket_id, name) values ('avatars', $1)", [`${juan}/avatar-3f2a1c4e-8b7d-4e6f-9a0b-1c2d3e4f5a6b.png`])).toMatch(/row-level security/);

    await aal("aal2");
    await db.query("select public.mfa_pre_request()");
    await db.query("insert into storage.objects (bucket_id, name) values ('avatars', $1)", [`${juan}/avatar-3f2a1c4e-8b7d-4e6f-9a0b-1c2d3e4f5a6b.png`]);
  });
});
