import { afterEach,beforeEach,expect,it,vi } from "vitest";
import { clearLocalPush,enablePush,pushCapability } from "../push-client";
import { DEFAULT_PUSH_PREFS,readNotifyPrefs,resetNotifyPrefsCache,setNotifyPrefs } from "../notify-prefs";
import { readChannelMutes,serverMutes,syncChannelMutes,toggleChannelMute } from "../channel-mute";
const me="00000000-0000-4000-8000-000000000001";
const unsub=vi.fn(async()=>true),subscribe=vi.fn(),post=vi.fn(),request=vi.fn();
let subscription:Record<string,unknown>|null;
const reg={active:{postMessage:post},pushManager:{getSubscription:vi.fn(async()=>subscription),subscribe}};
beforeEach(()=>{
 localStorage.clear();resetNotifyPrefsCache();subscription=null;unsub.mockClear();post.mockImplementation((_data,ports)=>ports[0].postMessage({ok:true}));
 subscribe.mockReset().mockImplementation(async()=>({options:{},unsubscribe:unsub,toJSON:()=>({endpoint:"https://fcm.googleapis.com/fcm/send/test",keys:{p256dh:"key",auth:"auth"}})}));
 request.mockReset().mockResolvedValue("granted");vi.stubGlobal("Notification",{permission:"default",requestPermission:request});vi.stubGlobal("PushManager",class{});vi.stubGlobal("isSecureContext",true);
 vi.stubGlobal("navigator",{userAgent:"Chrome on Android",platform:"Linux",maxTouchPoints:1,serviceWorker:{register:vi.fn(async()=>reg),getRegistration:vi.fn(async()=>reg)}});
 vi.stubGlobal("fetch",vi.fn(async()=>Response.json({ok:true})));vi.spyOn(window,"matchMedia").mockReturnValue({matches:false} as MediaQueryList);
});
afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks();});
it("detects iOS installation requirements, iPad desktop mode, unsupported and insecure browsers",()=>{
 expect(pushCapability()).toBe("supported");Object.assign(navigator,{userAgent:"iPhone",platform:"iPhone"});expect(pushCapability()).toBe("install-ios");
 vi.mocked(window.matchMedia).mockReturnValue({matches:true} as MediaQueryList);expect(pushCapability()).toBe("supported");
 Object.assign(navigator,{userAgent:"Macintosh",platform:"MacIntel",maxTouchPoints:5});vi.mocked(window.matchMedia).mockReturnValue({matches:false} as MediaQueryList);expect(pushCapability()).toBe("install-ios");
 vi.stubGlobal("isSecureContext",false);expect(pushCapability()).toBe("insecure");
});
it("requests permission only during enable, handles dismissal and never re-prompts a denial",async()=>{
 request.mockResolvedValue("default");await expect(enablePush(me,"publickey")).rejects.toThrow(/dismissed/);expect(subscribe).not.toHaveBeenCalled();
 vi.stubGlobal("Notification",{permission:"denied",requestPermission:request});request.mockClear();await expect(enablePush(me,"publickey")).rejects.toThrow(/blocked/);expect(request).not.toHaveBeenCalled();
});
it("registers a real browser subscription, binds ownership, and removes local private data on logout",async()=>{
 await enablePush(me,btoa("a".repeat(65)).replace(/=/g,""));expect(subscribe).toHaveBeenCalledWith(expect.objectContaining({userVisibleOnly:true}));
 expect(JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string)).toMatchObject({action:"register",subscription:{endpoint:"https://fcm.googleapis.com/fcm/send/test"}});
 expect(localStorage.getItem("diskarte:push-owner")).toBe(me);expect(localStorage.getItem("diskarte:push-active")).toBe("true");
 subscription={unsubscribe:unsub};await clearLocalPush();expect(unsub).toHaveBeenCalled();expect(localStorage.getItem("diskarte:push-owner")).toBeNull();expect(post).toHaveBeenLastCalledWith({type:"PUSH_BIND",userId:null},expect.any(Array));
});
it("synchronizes legacy channel mutes and honors unmute updates from another device",()=>{
 localStorage.setItem("diskarte:channel-mute",JSON.stringify({server:{muted:["channel"]}}));syncChannelMutes();expect(readNotifyPrefs().channels).toMatchObject({channel:{serverId:"server",muted:true}});
 toggleChannelMute("server","channel");expect(serverMutes(readChannelMutes(),"server").muted.has("channel")).toBe(false);
 setNotifyPrefs({push:DEFAULT_PUSH_PREFS,channels:{channel:{serverId:"server",muted:true}}});expect(serverMutes(readChannelMutes(),"server").muted.has("channel")).toBe(true);
});
