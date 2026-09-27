import type { Metadata } from "next";
import { LfgBoard } from "@/components/community/LfgBoard";

export const metadata: Metadata = { title: "LFG Board" };

/** Membership is enforced by the [serverId] layout (and RLS on lfg_beacons). */
export default function LfgPage() {
  return <LfgBoard />;
}
