// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
const state=vi.hoisted(()=>({user:{id:"00000000-0000-4000-8000-000000000001"} as {id:string}|null,member:true,banned:false,mfa:false}));
const snapshot=vi.hoisted(()=>vi.fn(async()=>({channels:[],limited:false})));
vi.mock("@/lib/auth",()=>({needsSecondFactor:async()=>state.mfa,isVerified:()=>true}));
vi.mock("@/lib/voice-preview-server",()=>({getVoicePreview:snapshot}));
vi.mock("@/lib/supabase/server",()=>({createClient:async()=>({auth:{getUser:async()=>({data:{user:state.user}})},rpc:async()=>({data:state.banned,error:null}),from:()=>{const api={select:()=>api,eq:()=>api,maybeSingle:async()=>({data:state.member?{user_id:state.user?.id}:null,error:null})};return api;}})}));
const {GET}=await import("../route");
const req=()=>new Request("https://diskarte.test/api/voice-preview?serverId=10000000-0000-4000-8000-000000000001");
beforeEach(()=>{state.user={id:"00000000-0000-4000-8000-000000000001"};state.member=true;state.banned=false;state.mfa=false;snapshot.mockClear();});
it("refuses signed-out, MFA-incomplete, banned and removed members before querying LiveKit",async()=>{
 state.user=null;expect((await GET(req())).status).toBe(401);state.user={id:"00000000-0000-4000-8000-000000000001"};
 state.mfa=true;expect((await GET(req())).status).toBe(403);state.mfa=false;
 state.banned=true;expect((await GET(req())).status).toBe(403);state.banned=false;
 state.member=false;expect((await GET(req())).status).toBe(403);expect(snapshot).not.toHaveBeenCalled();
});
it("returns only a private no-store snapshot for an authorized member",async()=>{const result=await GET(req());expect(result.status).toBe(200);expect(result.headers.get("cache-control")).toBe("private, no-store");expect(await result.json()).toEqual({channels:[],limited:false});});
