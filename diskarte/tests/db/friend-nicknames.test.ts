// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";
import { asUser, createDb, failure, rows, signUp, type Db } from "./harness";

let db: Db;
let juan: string;
let maria: string;
let pedro: string;

beforeAll(async () => {
  db = await createDb();
  juan = await signUp(db, "juan@diskarte.ph", { username: "juan" });
  maria = await signUp(db, "maria@diskarte.ph", { username: "maria" });
  pedro = await signUp(db, "pedro@diskarte.ph", { username: "pedro" });
}, 60_000);

describe("friend nicknames", () => {
  it("are private to whoever set them and can be changed or removed", async () => {
    await asUser(db, juan);
    await db.query("insert into public.friend_nicknames (target_id, nickname) values ($1, 'Mars')", [maria]);
    await db.query("update public.friend_nicknames set nickname = 'Marites' where target_id = $1", [maria]);
    expect(await rows(db, "select nickname from public.friend_nicknames")).toEqual([{ nickname: "Marites" }]);

    await asUser(db, maria);
    expect(await rows(db, "select 1 from public.friend_nicknames")).toHaveLength(0);
    // Can't plant one as someone else, or nickname yourself.
    expect(await failure(db, "insert into public.friend_nicknames (owner_id, target_id, nickname) values ($1, $2, 'x')", [pedro, juan])).toBeTruthy();
    expect(await failure(db, "insert into public.friend_nicknames (target_id, nickname) values ($1, 'me')", [maria])).toBeTruthy();
    expect(await failure(db, "insert into public.friend_nicknames (target_id, nickname) values ($1, '   ')", [juan])).toBeTruthy();

    await asUser(db, juan);
    await db.query("delete from public.friend_nicknames where target_id = $1", [maria]);
    expect(await rows(db, "select 1 from public.friend_nicknames")).toHaveLength(0);
  });
});
