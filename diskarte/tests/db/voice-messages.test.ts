// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";
import { asUser, createDb, failure, one, signUp, type Db } from "./harness";

const FILE = "3f2a1c4e-8b7d-4e6f-9a0b-1c2d3e4f5a6b";
let db: Db;
let juan: string;
let serverId: string;
let general: string;

beforeAll(async () => {
  db = await createDb();
  juan = await signUp(db, "juan@diskarte.ph", { username: "juan" });
  await asUser(db, juan);
  serverId = (await one<{ id: string }>(db, "select public.create_server('Barkada', '') as id")).id;
  general = (await one<{ id: string }>(db, "select id from public.channels where server_id = $1 and type = 'text' limit 1", [serverId])).id;
}, 60_000);

const send = (ext: string, type: string) =>
  db.query("insert into public.messages (channel_id, author_id, content, attachments) values ($1, $2, '', $3)", [
    general,
    juan,
    JSON.stringify([{ path: `${serverId}/${general}/${juan}/${FILE}.${ext}`, name: `voice-message.${ext}`, size: 4000, type, voice: true, duration: 3.2 }]),
  ]);

describe("voice messages", () => {
  it("accepts browser recordings (WebM, Ogg, MP4 audio) in messages and storage", async () => {
    await asUser(db, juan);
    await send("webm", "audio/webm");
    await send("ogg", "audio/ogg");
    await send("m4a", "audio/mp4");
    await db.query("insert into storage.objects (bucket_id, name) values ('attachments', $1)", [`${serverId}/${general}/${juan}/${FILE}.webm`]);
  });

  it("still refuses anything else", async () => {
    await asUser(db, juan);
    await expect(send("exe", "audio/webm")).rejects.toThrow(/INVALID_ATTACHMENT/);
    await expect(send("webm", "text/html")).rejects.toThrow(/INVALID_ATTACHMENT/);
    expect(await failure(db, "insert into storage.objects (bucket_id, name) values ('attachments', $1)", [`${serverId}/${general}/${juan}/${FILE}.html`])).toMatch(/row-level security/);
  });
});
