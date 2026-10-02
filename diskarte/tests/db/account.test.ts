// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";
import { asAnon, asService, asUser, createDb, failure, one, rows, signUp, type Db } from "./harness";

let db: Db;
let leaving: string; // the account being deleted
let mod: string;
let member: string;
let friend: string;
let shared: string; // server with other members: passes to `mod`
let solo: string; // server where `leaving` is alone: deleted
let general: string;
let soloGeneral: string;

const FILE = "11111111-2222-4333-8444-555555555555";

async function createServer(userId: string, name: string) {
  await asUser(db, userId);
  return (await one<{ id: string }>(db, "select public.create_server($1) as id", [name])).id;
}

async function textChannel(serverId: string) {
  await asService(db);
  return (await one<{ id: string }>(db, "select id from public.channels where server_id = $1 and name = 'general'", [serverId])).id;
}

beforeAll(async () => {
  db = await createDb();
  leaving = await signUp(db, "leaving@diskarte.ph", { username: "paalam" });
  mod = await signUp(db, "mod@diskarte.ph", { username: "maria" });
  member = await signUp(db, "member@diskarte.ph", { username: "juan" });
  friend = await signUp(db, "friend@diskarte.ph", { username: "dayo" });

  shared = await createServer(leaving, "Barkada HQ");
  solo = await createServer(leaving, "Solo Base");
  const code = (await one<{ invite_code: string }>(db, "select invite_code from public.servers where id = $1", [shared])).invite_code;
  for (const uid of [mod, member]) {
    await asUser(db, uid);
    await db.query("select public.join_server($1)", [code]);
  }
  await asUser(db, leaving);
  await db.query("update public.members set role = 'moderator' where server_id = $1 and user_id = $2", [shared, mod]);
  general = await textChannel(shared);
  soloGeneral = await textChannel(solo);

  // Messages: one text-only, one with an attachment.
  await asUser(db, leaving);
  await db.query("insert into public.messages (channel_id, author_id, content) values ($1, $2, 'Paalam, mga tropa!')", [general, leaving]);
  await asService(db);
  await db.query("update public.messages set created_at = created_at - interval '1 minute' where author_id = $1", [leaving]);
  await asUser(db, leaving);
  const attachment = { path: `${shared}/${general}/${leaving}/${FILE}.png`, name: "meme.png", size: 1200, type: "image/png" };
  await db.query("insert into public.messages (channel_id, author_id, content, attachments) values ($1, $2, '', $3)", [general, leaving, JSON.stringify([attachment])]);

  // Files: my avatar, my attachment, the solo server's icon; someone else's files must not be listed.
  await db.query("insert into storage.objects (bucket_id, name) values ('avatars', $1)", [`${leaving}/avatar-${FILE}.png`]);
  await db.query("insert into storage.objects (bucket_id, name) values ('attachments', $1)", [attachment.path]);
  await db.query("insert into storage.objects (bucket_id, name) values ('avatars', $1)", [`servers/${solo}/icon-${FILE}.png`]);
  await db.query("insert into storage.objects (bucket_id, name) values ('attachments', $1)", [`${solo}/${soloGeneral}/${leaving}/${FILE}.mp4`]);
  await asUser(db, member);
  await db.query("insert into storage.objects (bucket_id, name) values ('avatars', $1)", [`${member}/avatar-${FILE}.png`]);

  // A friendship that must disappear with the account.
  await asUser(db, leaving);
  await db.query("select public.send_friend_request('dayo')");
  await asUser(db, friend);
  await db.query("select public.respond_friend_request($1, true)", [leaving]);
}, 60_000);

describe("account deletion", () => {
  it("lists only my files and the assets of servers that will be deleted with me", async () => {
    await asUser(db, leaving);
    const files = await rows<{ bucket: string; path: string }>(db, "select bucket, path from public.account_deletion_files() order by bucket, path");
    expect(files).toEqual(
      [
        { bucket: "attachments", path: `${shared}/${general}/${leaving}/${FILE}.png` },
        { bucket: "attachments", path: `${solo}/${soloGeneral}/${leaving}/${FILE}.mp4` },
        { bucket: "avatars", path: `${leaving}/avatar-${FILE}.png` },
        { bucket: "avatars", path: `servers/${solo}/icon-${FILE}.png` },
      ].sort((a, b) => a.bucket.localeCompare(b.bucket) || a.path.localeCompare(b.path)),
    );
    await asAnon(db);
    expect(await failure(db, "select * from public.account_deletion_files()")).toMatch(/permission denied/);
  });

  it("refuses without an exact username confirmation, and for anonymous callers", async () => {
    await asUser(db, leaving);
    expect(await failure(db, "select public.delete_my_account('juan')")).toMatch(/CONFIRMATION_MISMATCH/);
    expect(await failure(db, "select public.delete_my_account('')")).toMatch(/CONFIRMATION_MISMATCH/);
    await asAnon(db);
    expect(await failure(db, "select public.delete_my_account('paalam')")).toMatch(/permission denied/);
    await asService(db);
    expect(await rows(db, "select 1 from auth.users where id = $1", [leaving])).toHaveLength(1);
  });

  it("hands shared servers to the next most senior member, deletes solo servers and purges the account", async () => {
    await asUser(db, leaving);
    await db.query("select public.delete_my_account('  PAALAM ')");

    await asService(db);
    expect(await rows(db, "select 1 from auth.users where id = $1", [leaving])).toHaveLength(0);
    expect(await rows(db, "select 1 from public.profiles where id = $1", [leaving])).toHaveLength(0);
    expect(await rows(db, "select 1 from public.members where user_id = $1", [leaving])).toHaveLength(0);
    expect(await rows(db, "select 1 from public.friendships")).toHaveLength(0);

    // The shared server lives on under the moderator, now an admin.
    expect((await one<{ owner_id: string }>(db, "select owner_id from public.servers where id = $1", [shared])).owner_id).toBe(mod);
    expect((await one<{ role: string }>(db, "select role from public.members where server_id = $1 and user_id = $2", [shared, mod])).role).toBe("admin");
    expect(await rows(db, "select 1 from public.servers where id = $1", [solo])).toHaveLength(0);

    // Text messages stay (from a deleted user); messages whose files were purged are gone.
    const left = await rows<{ content: string; author_id: string | null }>(db, "select content, author_id from public.messages where channel_id = $1", [general]);
    expect(left).toEqual([{ content: "Paalam, mga tropa!", author_id: null }]);

    // Other members are untouched.
    await asUser(db, member);
    expect(await rows(db, "select 1 from public.members where server_id = $1", [shared])).toHaveLength(2);
  });
});
