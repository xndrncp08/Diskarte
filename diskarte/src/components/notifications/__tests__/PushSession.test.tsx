import { act,render,waitFor } from "@testing-library/react";
import { afterEach,beforeEach,expect,it,vi } from "vitest";
import { MeProvider } from "@/components/providers/MeProvider";
import { getDeviceId } from "@/lib/device";
import { makeProfile,OWNER_ID } from "../../../../tests/fixtures/server";
const auth=vi.hoisted(()=>({callback:(_:string)=>{void _;},unsubscribe:vi.fn()}));
const refresh=vi.hoisted(()=>vi.fn());
vi.mock("@/components/providers/RuntimeConfig",()=>({useSupabase:()=>client}));
vi.mock("@/components/providers/SocialProvider",()=>({useSocial:()=>({reloadConversations:refresh})}));
const client={auth:{onAuthStateChange:(callback:(event:string)=>void)=>{auth.callback=callback;return{data:{subscription:{unsubscribe:auth.unsubscribe}}};}}};
const {PushSession}=await import("../PushSession");
const post=vi.fn(),unsubscribe=vi.fn(async()=>true),request=vi.fn(async()=>"granted");
const reg={active:{postMessage:post},pushManager:{getSubscription:async()=>({unsubscribe})}};
function view(){return render(<MeProvider profile={makeProfile(OWNER_ID,"Me")}><PushSession/></MeProvider>);}
beforeEach(()=>{
 localStorage.clear();localStorage.setItem("diskarte:push-owner",OWNER_ID);localStorage.setItem("diskarte:push-active","true");
 post.mockReset().mockImplementation((_data,ports)=>ports[0].postMessage({ok:true}));unsubscribe.mockClear();auth.unsubscribe.mockClear();request.mockClear();
 vi.stubGlobal("isSecureContext",true);vi.stubGlobal("PushManager",class{});vi.stubGlobal("Notification",{permission:"granted",requestPermission:request});
 vi.stubGlobal("navigator",{userAgent:"Chrome Android",platform:"Linux",serviceWorker:{getRegistration:async()=>reg,addEventListener:vi.fn(),removeEventListener:vi.fn()}});
 vi.stubGlobal("fetch",vi.fn(async()=>Response.json({configured:true,publicKey:"public",devices:[{device_id:getDeviceId(),label:"Test"}]})));
});
afterEach(()=>vi.unstubAllGlobals());
it("revokes a permission-denied device without requesting permission again",async()=>{
 vi.stubGlobal("Notification",{permission:"denied",requestPermission:request});const instance=view();
 await waitFor(()=>expect(unsubscribe).toHaveBeenCalled());
 await waitFor(()=>expect(fetch).toHaveBeenCalled());expect(JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string)).toMatchObject({action:"remove",device:getDeviceId()});
 expect(request).not.toHaveBeenCalled();expect(localStorage.getItem("diskarte:push-owner")).toBeNull();instance.unmount();
});
it("does not rebind an account when an authenticated setup response arrives after sign-out",async()=>{
 let resolve!:(response:Response)=>void;vi.mocked(fetch).mockImplementationOnce(()=>new Promise<Response>((done)=>{resolve=done;}));const instance=view();
 await waitFor(()=>expect(fetch).toHaveBeenCalled());act(()=>auth.callback("SIGNED_OUT"));
 await waitFor(()=>expect(unsubscribe).toHaveBeenCalled());
 await act(async()=>{resolve(Response.json({configured:true,publicKey:"public",devices:[{device_id:getDeviceId(),label:"Test"}]}));});
 expect(post.mock.calls.some(([data])=>data.userId===OWNER_ID)).toBe(false);expect(localStorage.getItem("diskarte:push-active")).toBeNull();
 instance.unmount();expect(auth.unsubscribe).toHaveBeenCalledOnce();expect(navigator.serviceWorker.removeEventListener).toHaveBeenCalled();
});
