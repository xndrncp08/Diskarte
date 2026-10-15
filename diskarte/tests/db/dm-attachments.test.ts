// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";
import { asUser, createDb, failure, one, rows, signUp, type Db } from "./harness";
let db: Db, juan: string, maria: string, stranger: string, conversation: string, path: string, message: string;
const attachments = () => JSON.stringify([{ path, name: "voice.webm", size: 1234, type: "audio/webm", voice: true, duration: 5 }]);
beforeAll(async () => {
  db = await createDb();
  juan = await signUp(db, "juan-dm@example.test", { username: "juan_media" }); maria = await signUp(db, "maria-dm@example.test", { username: "maria_media" }); stranger = await signUp(db, "stranger-dm@example.test", { username: "stranger_media" });
  await asUser(db, juan); await db.query("select public.send_friend_request('maria_media')");
  await asUser(db, maria); await db.query("select public.respond_friend_request($1, true)", [juan]);
  await asUser(db, juan); conversation = (await one<{ id: string }>(db, "select public.open_dm($1) id", [maria])).id;
  path = `dm/${conversation}/${juan}/20000000-0000-4000-8000-000000000005.webm`;
});
describe("private DM media", () => {
  it("keeps unsent uploads private and permits only a participant’s own folder", async () => {
    await asUser(db, stranger);
    expect(await failure(db, "insert into storage.objects(bucket_id,name,metadata) values ('attachments',$1,$2)", [path, { mimetype: "audio/webm", size: 1234 }])).toMatch(/row-level security/);
    await asUser(db, juan);
    await db.query("insert into storage.objects(bucket_id,name,metadata) values ('attachments',$1,$2)", [path, { mimetype: "audio/webm", size: 1234 }]);
    expect(await rows(db, "select name from storage.objects where name=$1", [path])).toHaveLength(1);
    await asUser(db, maria);
    expect(await rows(db, "select name from storage.objects where name=$1", [path])).toEqual([]);
    expect(await failure(db, "insert into public.direct_messages(conversation_id,attachments) values ($1,$2)", [conversation, attachments()])).toMatch(/INVALID_ATTACHMENT/);
  });
  it("delivers attachment-only voice messages and enforces storage metadata and immutable media", async () => {
    await asUser(db, juan);
    const wrong = JSON.parse(attachments()); wrong[0].size++;
    expect(await failure(db, "insert into public.direct_messages(conversation_id,attachments) values ($1,$2)", [conversation, JSON.stringify(wrong)])).toMatch(/INVALID_ATTACHMENT/);
    message = (await one<{ id: string }>(db, "insert into public.direct_messages(conversation_id,attachments) values ($1,$2) returning id", [conversation, attachments()])).id;
    expect(await failure(db, "update public.direct_messages set attachments='[]' where id=$1", [message])).toMatch(/MESSAGE_IMMUTABLE_FIELD/);
    await asUser(db, maria);
    expect(await rows(db, "select name from storage.objects where name=$1", [path])).toHaveLength(1);
    expect(await one(db, "select attachments from public.direct_messages where id=$1", [message])).toEqual({ attachments: JSON.parse(attachments()) });
    expect(await rows(db, "select id from public.search_all_messages('',p_kind=>'audio')")).toEqual([{ id: message }]);
    await asUser(db, stranger);
    expect(await rows(db, "select name from storage.objects where name=$1", [path])).toEqual([]);
    expect(await rows(db, "select id from public.search_all_messages('',p_kind=>'audio')")).toEqual([]);
  });
  it("revokes recipient access after deletion and lets the uploader remove the orphan", async () => {
    await asUser(db, juan); await db.query("delete from public.direct_messages where id=$1", [message]);
    await asUser(db, maria); expect(await rows(db, "select name from storage.objects where name=$1", [path])).toEqual([]);
    await asUser(db, juan); await db.query("delete from storage.objects where name=$1", [path]);
    expect(await rows(db, "select name from storage.objects where name=$1", [path])).toEqual([]);
  });
});
