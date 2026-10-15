// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";
import { asUser, createDb, failure, one, rows, signUp, type Db } from "./harness";
let db: Db, owner: string, member: string, outsider: string, channel: string, secret: string, server: string;
const id = "10000000-0000-4000-8000-000000000001";
const save = "select * from public.save_workspace_asset($1,$2,$3::jsonb,$4)";
const resource = { items: [{ id, title: "Reference", url: "https://example.com/guide", description: "A shared guide" }] };
beforeAll(async () => {
  db = await createDb();
  owner = await signUp(db, "assets-owner@test.ph"); member = await signUp(db, "assets-member@test.ph"); outsider = await signUp(db, "assets-outsider@test.ph");
  await asUser(db, owner);
  server = (await one<{ id: string }>(db,"select public.create_server('Resources','') id")).id;
  const invite = (await one<{ invite_code: string }>(db,"select invite_code from public.servers where id=$1",[server])).invite_code;
  channel = (await one<{ id: string }>(db,"select id from public.channels where server_id=$1 and type='text' limit 1",[server])).id;
  secret = (await one<{ id: string }>(db,"insert into public.channels(server_id,name,type,is_private) values($1,'secret','text',true) returning id",[server])).id;
  await asUser(db,member); await db.query("select public.join_server($1)",[invite]);
});
describe("workspace resources and whiteboards", () => {
  it("keeps resources private and requires current revisions", async () => {
    await asUser(db,owner);
    await db.query(save,[secret,"resources",JSON.stringify(resource),0]);
    await db.query(save,[channel,"resources",JSON.stringify(resource),0]);
    await asUser(db,member);
    expect(await rows(db,"select * from public.workspace_assets")).toHaveLength(1);
    expect(await failure(db,save,[secret,"resources",JSON.stringify(resource),0])).toMatch(/WORKSPACE_FORBIDDEN/);
    await db.query(save,[channel,"resources",'{"items":[]}',1]);
    expect(await failure(db,save,[channel,"resources",JSON.stringify(resource),1])).toMatch(/WORKSPACE_CONFLICT/);
    expect(await one(db,"select revision,content from public.workspace_assets where channel_id=$1",[channel])).toMatchObject({revision:2,content:{items:[]}});
    expect(await failure(db,"update public.workspace_assets set content='{}'")).toMatch(/permission denied/);
    await asUser(db,outsider);
    expect(await rows(db,"select * from public.workspace_assets")).toEqual([]);
  });
  it("validates URLs, point bounds, duplicate IDs and drawing size", async () => {
    await asUser(db,owner);
    expect(await failure(db,save,[channel,"resources",JSON.stringify({items:[{...resource.items[0],url:"javascript:alert(1)"}]}),2])).toMatch(/WORKSPACE_INVALID/);
    expect(await failure(db,save,[channel,"resources",JSON.stringify({items:[resource.items[0],resource.items[0]]}),2])).toMatch(/WORKSPACE_INVALID/);
    const stroke={id,color:"#142138",width:4,points:[[0,0],[1200,800]]};
    await db.query(save,[channel,"whiteboard",JSON.stringify({strokes:[stroke]}),0]);
    expect(await failure(db,save,[channel,"whiteboard",JSON.stringify({strokes:[{...stroke,points:[[1201,0]]}]}),1])).toMatch(/WORKSPACE_INVALID/);
    expect(await failure(db,save,[channel,"whiteboard",JSON.stringify({strokes:[{...stroke,color:"url(https://evil.test)"}]}),1])).toMatch(/WORKSPACE_INVALID/);
    expect(await failure(db,save,[channel,"whiteboard",JSON.stringify({strokes:[{...stroke,points:Array.from({length:257},()=>[1,1])}]}),1])).toMatch(/WORKSPACE_INVALID/);
  });
  it("blocks timed-out members from modifying shared assets", async () => {
    await asUser(db,owner); await db.query("select public.timeout_member($1,$2,10,'test')",[server,member]);
    await asUser(db,member);
    expect(await failure(db,save,[channel,"resources",'{"items":[]}',2])).toMatch(/WORKSPACE_FORBIDDEN/);
  });
});
