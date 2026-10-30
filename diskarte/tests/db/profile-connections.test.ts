// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";
import { asService, asUser, createDb, failure, one, rows, signUp, type Db } from "./harness";

let db: Db;
let juan: string;
let maria: string;
let pedro: string;
let ana: string;

async function befriend(a: string, b: string) {
  await asService(db);
  await db.query("insert into public.friendships (user_low, user_high, requested_by, status) values (least($1::uuid, $2::uuid), greatest($1::uuid, $2::uuid), $1, 'accepted')", [a, b]);
}

beforeAll(async () => {
  db = await createDb();
  juan = await signUp(db, "juan@diskarte.ph", { username: "juan" });
  maria = await signUp(db, "maria@diskarte.ph", { username: "maria" });
  pedro = await signUp(db, "pedro@diskarte.ph", { username: "pedro" });
  ana = await signUp(db, "ana@diskarte.ph", { username: "ana" });
  await befriend(juan, pedro);
  await befriend(maria, pedro);
  await befriend(maria, ana); // ana is maria's friend but not juan's
  await asService(db);
  const { id } = await one<{ id: string }>(db, "insert into public.servers (name, owner_id) values ('Kanto', $1) returning id", [juan]);
  await db.query("insert into public.members (server_id, user_id) values ($1, $2) on conflict do nothing", [id, maria]);
  await db.query("insert into public.servers (name, owner_id) values ('Solo', $1)", [maria]);
}, 60_000);

describe("profile connections", () => {
  it("shows only friends and Tambayans the caller shares", async () => {
    await asUser(db, juan);
    const { c } = await one<{ c: { mutual_friends: { username: string }[]; shared_servers: { name: string }[] } }>(db, "select public.profile_connections($1) as c", [maria]);
    expect(c.mutual_friends.map((f) => f.username)).toEqual(["pedro"]);
    expect(c.shared_servers.map((s) => s.name)).toEqual(["Kanto"]);
  });

  it("returns nothing across a block or for yourself", async () => {
    await asUser(db, maria);
    await db.query("select public.block_user($1)", [juan]);
    await asUser(db, juan);
    const { c } = await one<{ c: Record<string, unknown[]> }>(db, "select public.profile_connections($1) as c", [maria]);
    expect(c).toEqual({ mutual_friends: [], shared_servers: [] });
    const self = await one<{ c: Record<string, unknown[]> }>(db, "select public.profile_connections($1) as c", [juan]);
    expect(self.c.shared_servers).toEqual([]);
  });
});

describe("friend favourites", () => {
  it("are private to their owner", async () => {
    await asUser(db, juan);
    await db.query("insert into public.friend_favourites (target_id) values ($1)", [pedro]);
    expect(await rows(db, "select target_id from public.friend_favourites")).toEqual([{ target_id: pedro }]);
    expect(await failure(db, "insert into public.friend_favourites (owner_id, target_id) values ($1, $2)", [maria, pedro])).toBeTruthy();
    await asUser(db, maria);
    expect(await rows(db, "select 1 from public.friend_favourites")).toHaveLength(0);
  });
});

describe("custom status expiry", () => {
  it("drops an old expiry when the status changes and clears expired ones", async () => {
    await asUser(db, pedro);
    await db.query("update public.profiles set custom_status = 'Nagluto', custom_status_expires_at = now() + interval '1 hour' where id = $1", [pedro]);
    await db.query("update public.profiles set custom_status = 'LFG' where id = $1", [pedro]);
    expect(await one(db, "select custom_status, custom_status_expires_at from public.profiles where id = $1", [pedro])).toEqual({ custom_status: "LFG", custom_status_expires_at: null });

    await db.query("update public.profiles set custom_status = 'AFK', custom_status_expires_at = now() - interval '1 second' where id = $1", [pedro]);
    await asUser(db, ana);
    expect(await one(db, "select public.clear_expired_custom_statuses() as n")).toEqual({ n: 1 });
    expect(await one(db, "select custom_status, custom_status_expires_at from public.profiles where id = $1", [pedro])).toEqual({ custom_status: null, custom_status_expires_at: null });
  });
});
