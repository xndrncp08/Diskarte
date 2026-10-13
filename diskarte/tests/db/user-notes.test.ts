// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";
import { asUser, createDb, failure, rows, signUp, type Db } from "./harness";

let db: Db;
let juan: string;
let maria: string;

beforeAll(async () => {
  db = await createDb();
  juan = await signUp(db, "juan@diskarte.ph", { username: "juan" });
  maria = await signUp(db, "maria@diskarte.ph", { username: "maria" });
}, 60_000);

describe("notes", () => {
  it("are private to whoever wrote them", async () => {
    await asUser(db, juan);
    await db.query("insert into public.user_notes (target_id, note) values ($1, 'Owes me 50 pesos')", [maria]);
    expect(await rows(db, "select note from public.user_notes")).toEqual([{ note: "Owes me 50 pesos" }]);
    await asUser(db, maria);
    expect(await rows(db, "select 1 from public.user_notes")).toHaveLength(0);
    expect(await failure(db, "insert into public.user_notes (owner_id, target_id, note) values ($1, $2, 'x')", [juan, maria])).toBeTruthy();
    expect(await failure(db, "insert into public.user_notes (target_id, note) values ($1, '  ')", [juan])).toBeTruthy();
  });
});
