// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";
import { asService, asUser, createDb, failure, one, rows, signUp, type Db } from "./harness";

let db: Db;
let ana: string;
let ben: string;
let cris: string;
let stranger: string;

async function befriend(a: string, b: string) {
  await asService(db);
  await db.query("insert into public.friendships (user_low, user_high, requested_by, status) values (least($1::uuid, $2::uuid), greatest($1::uuid, $2::uuid), $1, 'accepted')", [a, b]);
}
const visible = async (viewer: string) => {
  await asUser(db, viewer);
  return (await rows<{ body: string }>(db, "select body from public.moments order by created_at")).map((r) => r.body);
};

beforeAll(async () => {
  db = await createDb();
  ana = await signUp(db, "ana@diskarte.ph", { username: "ana" });
  ben = await signUp(db, "ben@diskarte.ph", { username: "ben" });
  cris = await signUp(db, "cris@diskarte.ph", { username: "cris" });
  stranger = await signUp(db, "x@diskarte.ph", { username: "stranger" });
  await befriend(ana, ben);
  await befriend(ana, cris);
}, 60_000);

describe("moments", () => {
  it("reach friends (or only favourites), never strangers", async () => {
    await asUser(db, ana);
    await db.query("insert into public.friend_favourites (target_id) values ($1)", [ben]);
    await db.query("insert into public.moments (body) values ('Kape muna')");
    await db.query("insert into public.moments (body, audience) values ('Close friends lang', 'favourites')");
    expect(await visible(ben)).toEqual(["Kape muna", "Close friends lang"]);
    expect(await visible(cris)).toEqual(["Kape muna"]);
    expect(await visible(stranger)).toEqual([]);
    expect(await visible(ana)).toEqual(["Kape muna", "Close friends lang"]);
  });

  it("disappear for viewers after they expire and across a block", async () => {
    await asService(db);
    await db.query("update public.moments set expires_at = now() - interval '1 minute', created_at = now() - interval '2 hours' where body = 'Kape muna'");
    expect(await visible(ben)).toEqual(["Close friends lang"]);
    expect(await visible(ana)).toContain("Kape muna");
    await asUser(db, ben);
    await db.query("select public.block_user($1)", [ana]);
    expect(await visible(ben)).toEqual([]);
  });

  it("can't be posted as someone else, outside your photo folder, or for longer than a day", async () => {
    await asUser(db, cris);
    expect(await failure(db, "insert into public.moments (author_id, body) values ($1, 'fake')", [ana])).toBeTruthy();
    expect(await failure(db, "insert into public.moments (image_path) values ($1)", [`${ana}/x.jpg`])).toBeTruthy();
    await db.query("insert into public.moments (image_path) values ($1)", [`${cris}/sunset.jpg`]);
    expect(await failure(db, "update public.moments set expires_at = now() + interval '7 days'")).toBeTruthy();
  });

  it("photo files are readable only through a moment you can see", async () => {
    await asService(db);
    await db.query("insert into storage.objects (bucket_id, name, owner) values ('moments', $1, $2)", [`${cris}/sunset.jpg`, cris]);
    await asUser(db, ana);
    expect(await rows(db, "select name from storage.objects where bucket_id = 'moments'")).toEqual([{ name: `${cris}/sunset.jpg` }]);
    await asUser(db, stranger);
    expect(await rows(db, "select name from storage.objects where bucket_id = 'moments'")).toEqual([]);
  });

  it("caps live moments at 10 per person", async () => {
    await asUser(db, ben);
    for (let i = 0; i < 10; i++) await db.query("insert into public.moments (body) values ($1)", [`m${i}`]);
    expect(await failure(db, "insert into public.moments (body) values ('one more')")).toMatch(/MOMENT_LIMIT/);
  });

  it("mutes are private to whoever set them", async () => {
    await asUser(db, ben);
    await db.query("insert into public.moment_mutes (target_id) values ($1)", [cris]);
    await asUser(db, cris);
    expect(await rows(db, "select 1 from public.moment_mutes")).toHaveLength(0);
    expect(await one(db, "select count(*)::int as n from public.moments where author_id = $1", [cris])).toEqual({ n: 1 });
  });
});
