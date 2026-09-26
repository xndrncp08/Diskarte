import { PixelStatus } from "@/components/retro/PixelStatus";
import type { PresenceStatus } from "@/lib/supabase/database.types";
import { cn } from "@/lib/utils";
import { SalakotAvatar } from "./SalakotAvatar";

export interface AvatarProfile {
  display_name: string;
  avatar_url: string | null;
  avatar_preset: string;
}

export function UserAvatar({
  profile,
  size = 40,
  status,
  speaking = false,
  className,
  ring = "#020617",
}: {
  profile: AvatarProfile;
  size?: number;
  status?: PresenceStatus | "offline";
  speaking?: boolean;
  className?: string;
  ring?: string;
}) {
  const dot = Math.max(10, Math.round(size * 0.34));
  return (
    <span
      className={cn("relative inline-flex shrink-0 rounded-full", speaking && "ring-2 ring-signal-green ring-offset-2 ring-offset-abyss", className)}
      style={{ width: size, height: size }}
      data-speaking={speaking || undefined}
    >
      {profile.avatar_url ? (
        // Plain <img>: avatar hosts vary (Supabase Storage, OAuth providers) and are already sized.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={profile.avatar_url}
          alt=""
          width={size}
          height={size}
          loading="lazy"
          referrerPolicy="no-referrer"
          className="size-full rounded-full object-cover"
        />
      ) : (
        <SalakotAvatar preset={profile.avatar_preset} size={size} />
      )}
      <span className="sr-only">{profile.display_name}</span>
      {status && (
        <span className="absolute -bottom-0.5 -right-0.5">
          <PixelStatus status={status} size={dot} ring={ring} />
        </span>
      )}
    </span>
  );
}
