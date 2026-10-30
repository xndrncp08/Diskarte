// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";
import { asService, asUser, createDb, failure, one, rows, signUp, type Db } from "./harness";

let db: Db;
let ana: string;
let ben: string;

beforeAll(async () => {
  db = await createDb();
  ana = await signUp(db, "ana@diskarte.ph", { username: "ana" });
  ben = await signUp(db, "ben@diskarte.ph", { username: "ben" });
  await asService(db);
  await db.query("insert into public.friendships (user_low, user_high, requested_by, status) values (least($1::uuid, $2::uuid), greatest($1::uuid, $2::uuid), $1, 'accepted')", [ana, ben]);
  await db.query("insert into storage.objects (bucket_id, name, owner) values ('moments', $1, $2), ('moments', $3, $4)", [`${ana}/a.jpg`, ana, `${ben}/b.jpg`, ben]);
}, 60_000);

describe("account data coverage", () => {
  it("export includes favourites, moments and mutes, and still refuses signed-out callers", async () => {
    await asUser(db, ana);
    await db.query("insert into public.friend_favourites (target_id) values ($1)", [ben]);
    await db.query("insert into public.moments (body, image_path) values ('Kape', $1)", [`${ana}/a.jpg`]);
    await db.query("insert into public.moment_mutes (target_id) values ($1)", [ben]);
    const { data } = await one<{ data: Record<string, unknown> }>(db, "select public.export_my_data() as data");
    expect(data.favourite_friends).toEqual(["ben"]);
    expect(data.moments).toEqual([expect.objectContaining({ body: "Kape", image_path: `${ana}/a.jpg` })]);
    expect(data.muted_moments_from).toEqual(["ben"]);
    expect(data.profile).toEqual(expect.objectContaining({ username: "ana" }));
    expect(await failure(db, "select public.export_my_data_base()")).toBeTruthy();
  });

  it("deletion lists my moment photos and nobody else's", async () => {
    await asUser(db, ana);
    expect(await rows(db, "select bucket, path from public.account_deletion_files() where bucket = 'moments'")).toEqual([{ bucket: "moments", path: `${ana}/a.jpg` }]);
  });
});
