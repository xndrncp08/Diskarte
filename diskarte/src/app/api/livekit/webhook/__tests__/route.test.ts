// @vitest-environment node
import { createHash } from "node:crypto";
import { AccessToken } from "livekit-server-sdk";
import { beforeEach, expect, it, vi } from "vitest";
const send=vi.hoisted(()=>vi.fn(async()=>"ok"));
const service=vi.hoisted(()=>vi.fn());
vi.mock("@/lib/supabase/service",()=>({createServiceClient:service}));
vi.mock("@/lib/env",()=>({getServerEnv:()=>({livekitApiKey:"test-key",livekitApiSecret:"test-secret-12345678901234567890"})}));
const {POST}=await import("../route");
beforeEach(()=>{service.mockClear();service.mockReturnValue({from:()=>{const api={select:()=>api,eq:()=>api,maybeSingle:async()=>({data:{server_id:"server"},error:null})};return api;},channel:()=>({send}),removeChannel:async()=>"ok"});});
async function request(body:string,signed=true){const token=new AccessToken("test-key","test-secret-12345678901234567890");token.sha256=createHash("sha256").update(body).digest("base64");return new Request("https://diskarte.test/api/livekit/webhook",{method:"POST",body,headers:{authorization:signed?await token.toJwt():"forged"}});}
it("rejects forged events and body tampering before using privileged credentials",async()=>{
 expect((await POST(await request('{"event":"participant_left"}',false))).status).toBe(401);expect(service).not.toHaveBeenCalled();
 const signed=await request('{"event":"participant_left"}');const tampered=new Request(signed.url,{method:"POST",body:'{"event":"room_finished"}',headers:signed.headers});expect((await POST(tampered)).status).toBe(401);expect(service).not.toHaveBeenCalled();
});
it("sends an empty invalidation instead of participant data after verified LiveKit changes",async()=>{
 const body=JSON.stringify({event:"participant_left",room:{name:"voice:20000000-0000-4000-8000-000000000003"}});
 expect((await POST(await request(body))).status).toBe(204);expect(send).toHaveBeenCalledWith({type:"broadcast",event:"voice_changed",payload:{}});
});
