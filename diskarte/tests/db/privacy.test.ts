// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";
import { asUser, createDb, failure, one, rows, signUp, type Db } from "./harness";

let db: Db;
let maria: string;
let juan: string;
let pedro: string;

beforeAll(async () => {
  db = await createDb();
  maria = await signUp(db, "maria@diskarte.ph", { username: "maria" });
  juan = await signUp(db, "juan@diskarte.ph", { username: "juan" });
  pedro = await signUp(db, "pedro@diskarte.ph", { username: "pedro" });
  // Maria and Juan share a server; Pedro doesn't.
  await asUser(db, maria);
  const serverId = (await one<{ id: string }>(db, "select public.create_server('Barkada', '') as id")).id;
  const { invite_code } = await one<{ invite_code: string }>(db, "select invite_code from public.servers where id = $1", [serverId]);
  await asUser(db, juan);
  await db.query("select public.join_server($1)", [invite_code]);
}, 60_000);

const request = (from: string, to: string) => asUser(db, from).then(() => db.query("select public.send_friend_request($1)", [to]));

describe("privacy settings", () => {
  it("keeps settings private to their owner", async () => {
    await asUser(db, maria);
    await db.query("insert into public.privacy_settings (friend_requests_from) values ('server_members')");
    expect(await rows(db, "select friend_requests_from from public.privacy_settings")).toEqual([{ friend_requests_from: "server_members" }]);
    expect(await failure(db, "insert into public.privacy_settings (user_id, friend_requests_from) values ($1, 'nobody')", [juan])).toMatch(/row-level security/);
    await asUser(db, juan);
    expect(await rows(db, "select * from public.privacy_settings")).toEqual([]);
  });

  it("limits who can send friend requests", async () => {
    // server_members: Juan (shared server) can, Pedro can't.
    await asUser(db, pedro);
    expect(await failure(db, "select public.send_friend_request('maria')")).toMatch(/FRIEND_REQUESTS_CLOSED/);
    await request(juan, "maria");

    await asUser(db, maria);
    await db.query("update public.privacy_settings set friend_requests_from = 'nobody'");
    await asUser(db, pedro);
    expect(await failure(db, "select public.send_friend_request('maria')")).toMatch(/FRIEND_REQUESTS_CLOSED/);
    // Maria can still send requests herself, and accept them.
    await request(maria, "pedro");
    await request(pedro, "maria");
    expect(await one(db, "select status from public.friendships where requested_by = $1", [maria])).toEqual({ status: "accepted" });
  });
});
