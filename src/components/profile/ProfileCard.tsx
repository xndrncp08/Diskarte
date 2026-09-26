import type { ReactNode } from "react";
import { resolveBannerCss } from "@/lib/profile";
import type { PresenceStatus } from "@/lib/supabase/database.types";
import { cn } from "@/lib/utils";
import { SmartImage } from "@/components/ui/SmartImage";
import { UserAvatar } from "./UserAvatar";

export interface ProfileCardData {
  username: string;
  display_name: string;
  avatar_url: string | null;
  avatar_preset: string;
  banner_url: string | null;
  banner_preset: string;
  bio: string;
  status: PresenceStatus;
  custom_status: string | null;
  custom_status_emoji: string | null;
}

/** Discord-style profile popout: banner, overlapping avatar, name, custom status and bio. */
export function ProfileCard({ profile, className, footer, role }: { profile: ProfileCardData; className?: string; footer?: ReactNode; role?: string | null }) {
  return (
    <div className={cn("glass-strong w-72 overflow-hidden rounded-2xl", className)} data-testid="profile-card">
      <div className="relative h-24 w-full overflow-hidden" style={profile.banner_url ? undefined : { background: resolveBannerCss(profile.banner_preset) }} data-testid="profile-banner">
        {profile.banner_url && <SmartImage src={profile.banner_url} alt="" fill sizes="288px" className="object-cover" />}
      </div>
      <div className="relative px-4 pb-4">
        <div className="-mt-10 mb-2 inline-block rounded-full border-4 border-abyss">
          <UserAvatar profile={profile} size={72} status={profile.status} />
        </div>
        <div className="rounded-xl bg-black/40 p-3">
          <p className="text-lg font-bold leading-tight text-white">{profile.display_name}</p>
          <p className="text-sm text-slate-400">@{profile.username}</p>
          {role && <p className="mt-1 inline-block rounded bg-sun/15 px-1.5 py-0.5 font-silk text-[10px] uppercase text-sun">{role}</p>}
          {(profile.custom_status || profile.custom_status_emoji) && (
            <p className="mt-2 text-sm text-slate-200">
              {profile.custom_status_emoji && <span className="mr-1">{profile.custom_status_emoji}</span>}
              {profile.custom_status}
            </p>
          )}
          {profile.bio && (
            <>
              <div className="my-2 h-px bg-white/10" />
              <p className="font-silk text-[10px] uppercase tracking-wider text-slate-400">About me</p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-slate-300">{profile.bio}</p>
            </>
          )}
          {footer}
        </div>
      </div>
    </div>
  );
}
