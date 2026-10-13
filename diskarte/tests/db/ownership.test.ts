// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";
import { asUser, createDb, failure, one, signUp, type Db } from "./harness";

let db: Db;
let owner: string;
let juan: string;
let outsider: string;
let serverId: string;

beforeAll(async () => {
  db = await createDb();
  owner = await signUp(db, "owner@diskarte.ph", { username: "kapitan" });
  juan = await signUp(db, "juan@diskarte.ph", { username: "juan" });
  outsider = await signUp(db, "out@diskarte.ph", { username: "outsider" });
  await asUser(db, owner);
  serverId = (await one<{ id: string }>(db, "select public.create_server('Barkada', '') as id")).id;
  const { invite_code } = await one<{ invite_code: string }>(db, "select invite_code from public.servers where id = $1", [serverId]);
  await asUser(db, juan);
  await db.query("select public.join_server($1)", [invite_code]);
}, 60_000);

describe("ownership transfer", () => {
  it("only the owner hands it to a member, who becomes an admin", async () => {
    await asUser(db, juan);
    // RLS hides the row from non-admins, so nothing changes.
    await db.query("update public.servers set owner_id = $1 where id = $2", [juan, serverId]).catch(() => undefined);
    expect(await one(db, "select owner_id from public.servers where id = $1", [serverId])).toEqual({ owner_id: owner });
    await asUser(db, owner);
    expect(await failure(db, "update public.servers set owner_id = $1 where id = $2", [outsider, serverId])).toMatch(/NEW_OWNER_MUST_BE_MEMBER/);
    await db.query("update public.servers set owner_id = $1 where id = $2", [juan, serverId]);
    expect(await one(db, "select owner_id from public.servers where id = $1", [serverId])).toEqual({ owner_id: juan });
    expect(await one(db, "select role from public.members where server_id = $1 and user_id = $2", [serverId, juan])).toEqual({ role: "admin" });
    // The old owner can leave now; the new one can't.
    await db.query("delete from public.members where server_id = $1 and user_id = $2", [serverId, owner]);
    await asUser(db, juan);
    expect(await failure(db, "delete from public.members where server_id = $1 and user_id = $2", [serverId, juan])).toMatch(/OWNER_CANNOT_LEAVE/);
  });
});
