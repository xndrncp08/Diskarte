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
      hint="Para sa prepaid data at mahinang signal: mas maliit na images, GIFs sa tap lang, at mababang video quality sa calls."
    />
  );
}
