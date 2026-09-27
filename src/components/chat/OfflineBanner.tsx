"use client";

import { CloudOff } from "lucide-react";
import { useOnline } from "@/hooks/useOnline";

/** 8-bit strip shown while offline or while queued messages wait to be sent. */
export function OfflineBanner({ queued }: { queued: number }) {
  const online = useOnline();
  if (online && queued === 0) return null;
  return (
    <div role="status" className="mx-4 mb-2 flex items-center gap-2 rounded-lg border-2 border-sun/70 bg-sun/10 px-3 py-2 font-pixel text-[9px] leading-relaxed text-sun" data-testid="offline-banner">
      <CloudOff className="size-4 shrink-0" aria-hidden />
      {online
        ? `SYNCING ${queued} MESSAGE${queued === 1 ? "" : "S"}…`
        : queued > 0
          ? `OFFLINE — ${queued} MESSAGE${queued === 1 ? "" : "S"} NAKA-QUEUE. ISE-SEND PAGBALIK NG SIGNAL.`
          : "OFFLINE — NAKA-QUEUE ANG MGA ISESEND MO HANGGANG BUMALIK ANG SIGNAL."}
    </div>
  );
}
