"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { callHref, useCall } from "./CallProvider";

const CallHud = dynamic(() => import("./live/CallHud").then((m) => m.CallHud), { ssr: false });

/** Draggable picture-in-picture of the call while you're on another page (loads LiveKit UI on demand). */
export function FloatingCallHUD() {
  const call = useCall();
  const pathname = usePathname();
  if (call.status !== "connected" || !call.target || !call.room) return null;
  if (pathname === callHref(call.target)) return null;
  return <CallHud />;
}
