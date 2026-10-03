"use client";

import { Signal } from "lucide-react";
import { Switch } from "@/components/ui/Switch";
import { useLowData } from "@/hooks/useLowData";
import { setLowDataMode } from "@/lib/low-data";

/** Low-data mode switch (saved per browser). */
export function LowDataToggle({ className }: { className?: string }) {
  const lowData = useLowData();
  return (
    <Switch
      className={className}
      checked={lowData}
      onChange={setLowDataMode}
      label={
        <span className="inline-flex items-center gap-1.5">
          <Signal className="size-4 text-cyan-300" aria-hidden /> Low-data mode
        </span>
      }
      hint="For prepaid data and weak signal: smaller images, GIFs play on tap, and lower video quality in calls."
    />
  );
}
