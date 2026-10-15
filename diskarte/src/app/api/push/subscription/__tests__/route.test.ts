// @vitest-environment node
import { createECDH,randomBytes,randomUUID } from "node:crypto";
import { beforeEach,expect,it,vi } from "vitest";
const state=vi.hoisted(()=>({signedIn:true,mfa:false,ready:true,rpc:vi.fn()}));
vi.mock("@/lib/auth",()=>({needsSecondFactor:async()=>state.mfa}));
vi.mock("@/lib/push-server",()=>({pushConfig:()=>({publicKey:"public-key-only"})}));
vi.mock("@/lib/supabase/server",()=>({createClient:async()=>({auth:{getUser:async()=>({data:{user:state.signedIn?{id:"me"}:null}})},rpc:state.rpc})}));
const{GET,POST}=await import("../route");const device=randomUUID(),key=createECDH("prime256v1");key.generateKeys();
const registration={action:"register",device,label:"Safari on iOS",subscription:{endpoint:"https://web.push.apple.com/Q/valid-subscription",keys:{p256dh:key.getPublicKey().toString("base64url"),auth:randomBytes(16).toString("base64url")}}};
const request=(body:unknown)=>new Request("https://diskarte.test/api/push/subscription",{method:"POST",body:JSON.stringify(body)});
beforeEach(()=>{state.signedIn=true;state.mfa=false;state.rpc.mockReset().mockImplementation(async(name)=>({data:name==="push_ready"?true:name==="list_push_devices"?[]:null,error:null}));});
it("authenticates subscription ownership, enforces MFA and validates HTTPS vendors and encryption keys",async()=>{
 state.signedIn=false;expect((await POST(request(registration))).status).toBe(401);expect(state.rpc).not.toHaveBeenCalled();state.signedIn=true;
 state.mfa=true;expect((await POST(request(registration))).status).toBe(403);state.mfa=false;
 expect((await POST(request({...registration,subscription:{...registration.subscription,endpoint:"https://localhost/private"}}))).status).toBe(400);
 expect((await POST(request(registration))).status).toBe(200);expect(state.rpc).toHaveBeenCalledWith("register_push",expect.objectContaining({p_device:device,p_endpoint:registration.subscription.endpoint}));
 expect(state.rpc.mock.calls[0][1]).not.toHaveProperty("user_id");
});
it("lists safe device metadata and only public VAPID material, and permits revocation during MFA challenges",async()=>{
 const result=await GET();expect(result.headers.get("cache-control")).toBe("private, no-store");expect(await result.json()).toEqual({configured:true,publicKey:"public-key-only",devices:[]});
 state.mfa=true;expect((await POST(request({action:"remove",device}))).status).toBe(200);expect(state.rpc).toHaveBeenCalledWith("remove_push_device",{p_device:device});
});
it("rates test notifications on the durable database boundary and accepts no arbitrary recipients",async()=>{
 state.rpc.mockResolvedValue({data:null,error:{message:"PUSH_RATE_LIMIT"}});expect((await POST(request({action:"test",device}))).status).toBe(429);
 expect((await POST(request({action:"send",userId:randomUUID(),body:"arbitrary"}))).status).toBe(400);
});
