"use client";

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
      label="📶 Low-data mode"
      hint="For prepaid data and weak signal: smaller images, GIFs play on tap, and lower video quality in calls."
    />
  );
}
