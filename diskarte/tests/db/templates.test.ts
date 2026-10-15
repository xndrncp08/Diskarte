// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";
import { asUser, createDb, failure, one, rows, signUp, type Db } from "./harness";
let db: Db, owner: string, outsider: string;
beforeAll(async () => { db = await createDb(); owner = await signUp(db,"template-owner@example.test",{username:"template_owner"}); outsider = await signUp(db,"template-other@example.test",{username:"template_other"}); });
describe("community templates and settings export", () => {
  it.each(["study","creator","friends","team","gaming"])("creates a functioning %s community with its existing permission model", async (template) => {
    await asUser(db, owner);
    const server = (await one<{ id: string }>(db,"select public.create_server_from_template($1,'',$2) id", [`${template} community`,template])).id;
    expect(await one(db,"select role from public.members where server_id=$1 and user_id=$2",[server,owner])).toEqual({role:"admin"});
    expect(await rows(db,"select id from public.channels where server_id=$1 and name='general'",[server])).toHaveLength(1);
    if (["study","creator","team"].includes(template)) expect(await one(db,"select read_only from public.channels where server_id=$1 and name='resources'",[server])).toEqual({read_only:true});
    const exported = (await one<{data:{server:Record<string,unknown>;channels:unknown[]}}>(db,"select public.export_server_settings($1) data",[server])).data;
    expect(exported.server.id).toBe(server); expect(exported.server).not.toHaveProperty("invite_code"); expect(exported.channels.length).toBeGreaterThan(0);
    await asUser(db, outsider); expect(await failure(db,"select public.export_server_settings($1)",[server])).toMatch(/OWNER_REQUIRED/);
  });
  it("rejects an unknown template before creating any data", async () => {
    await asUser(db,owner); expect(await failure(db,"select public.create_server_from_template('Invalid','','unknown')")).toMatch(/INVALID_TEMPLATE/);
    expect(await rows(db,"select id from public.servers where owner_id=$1 and name='Invalid'",[owner])).toEqual([]);
  });
});
