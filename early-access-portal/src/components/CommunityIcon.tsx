import { Briefcase, Gamepad2, GraduationCap, Sparkles, Tv, Users, type LucideIcon } from "lucide-react";
import type { CommunityType } from "@/lib/schema";
import { cn } from "@/lib/utils";

/** Vector icon for each community type (the portal uses no emoji). */
const ICONS: Record<CommunityType, LucideIcon> = {
  gaming: Gamepad2,
  school: GraduationCap,
  streaming: Tv,
  barkada: Users,
  work: Briefcase,
  other: Sparkles,
};

export function CommunityIcon({ type, className }: { type: string | null | undefined; className?: string }) {
  const Icon = type && type in ICONS ? ICONS[type as CommunityType] : null;
  return Icon ? <Icon className={cn("inline-block size-4 shrink-0 text-sun", className)} aria-hidden /> : null;
}
