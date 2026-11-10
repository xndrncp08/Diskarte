// @vitest-environment node
// The avatars bucket is public for image URLs, but its rows must not be listable: only the uploader
// (own folder) or a server admin (that server's folder) may see storage.objects rows.
import { beforeAll, describe, expect, it } from "vitest";
import { asAnon, asService, asUser, createDb, one, rows, signUp, type Db } from "./harness";

let db: Db;
let owner: string; // owns server A
let admin: string; // admin of A
let mod: string; // moderator of A
let member: string; // plain member of A
let outsider: string; // owns server B only
let serverA: string;
let serverB: string;
const F = "3f2a1c4e-8b7d-4e6f-9a0b-1c2d3e4f5a6b";
const names = () => [`${owner}/avatar-${F}.png`, `${member}/banner-${F}.png`, `servers/${serverA}/icon-${F}.png`, `servers/${serverB}/icon-${F}.png`];
const visible = async (user: string) => {
  await asUser(db, user);
  return (await rows<{ name: string }>(db, "select name from storage.objects where bucket_id = 'avatars' order by name")).map((r) => r.name);
};

beforeAll(async () => {
  db = await createDb();
  owner = await signUp(db, "owner@avatar.ph");
  admin = await signUp(db, "admin@avatar.ph");
  mod = await signUp(db, "mod@avatar.ph");
  member = await signUp(db, "member@avatar.ph");
  outsider = await signUp(db, "outsider@avatar.ph");
  await asUser(db, owner);
  serverA = (await one<{ id: string }>(db, "select public.create_server('Private A') as id")).id;
  const code = (await one<{ invite_code: string }>(db, "select invite_code from public.servers where id = $1", [serverA])).invite_code;
  for (const u of [admin, mod, member]) {
    await asUser(db, u);
    await db.query("select public.join_server($1)", [code]);
  }
  await asUser(db, outsider);
  serverB = (await one<{ id: string }>(db, "select public.create_server('Private B') as id")).id;
  await asService(db);
  await db.query("update public.members set role = 'admin' where server_id = $1 and user_id = $2", [serverA, admin]);
  await db.query("update public.members set role = 'moderator' where server_id = $1 and user_id = $2", [serverA, mod]);
  for (const name of names()) await db.query("insert into storage.objects (bucket_id, name) values ('avatars', $1)", [name]);
}, 60_000);

describe("avatars bucket listing", () => {
  it("hides every row from anon", async () => {
    await asAnon(db);
    expect(await rows(db, "select name from storage.objects where bucket_id = 'avatars'")).toEqual([]);
  });

  it("shows an outsider only their own server's folder, never guessed ids", async () => {
    expect(await visible(outsider)).toEqual([`servers/${serverB}/icon-${F}.png`]);
    await asUser(db, outsider);
    expect(await rows(db, "select 1 from storage.objects where bucket_id = 'avatars' and name = $1", [`servers/${serverA}/icon-${F}.png`])).toEqual([]);
  });

  it("shows a user their own folder only", async () => {
    expect(await visible(member)).toEqual([`${member}/banner-${F}.png`]);
  });

  it("shows a moderator nothing of the server folder", async () => {
    expect(await visible(mod)).toEqual([]);
  });

  it("shows a server admin that server's folder but not another server's", async () => {
    expect(await visible(admin)).toEqual([`servers/${serverA}/icon-${F}.png`]);
  });

  it("lets the owner see (and so remove) every path account deletion returns", async () => {
    await asUser(db, outsider);
    const files = await rows<{ bucket: string; path: string }>(db, "select bucket, path from public.account_deletion_files() where bucket = 'avatars'");
    expect(files).toEqual([{ bucket: "avatars", path: `servers/${serverB}/icon-${F}.png` }]);
    expect(await rows(db, "delete from storage.objects where bucket_id = 'avatars' and name = $1 returning name", [files[0].path])).toHaveLength(1);
  });

  it("still lets an uploader insert with returning (Storage upload)", async () => {
    await asUser(db, member);
    expect(await rows(db, "insert into storage.objects (bucket_id, name) values ('avatars', $1) returning name", [`${member}/avatar-${F}.png`])).toHaveLength(1);
  });
});
