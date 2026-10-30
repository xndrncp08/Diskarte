"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useOptionalSupabase } from "@/components/providers/RuntimeConfig";
import { ServerIcon } from "@/components/shell/ServerIcon";
import { UserAvatar, type AvatarProfile } from "./UserAvatar";

type Connections = {
  mutual_friends: (AvatarProfile & { id: string; username: string })[];
  shared_servers: { id: string; name: string; icon_url: string | null }[];
};

/** Mutual friends and shared Tambayans on someone else's profile. Renders nothing until loaded or when empty. */
export function ProfileConnections({ userId }: { userId: string }) {
  const supabase = useOptionalSupabase();
  const [data, setData] = useState<Connections | null>(null);
  useEffect(() => {
    if (!supabase) return;
    let live = true;
    // A missing function (migration not applied yet) just hides the section.
    void supabase.rpc("profile_connections", { p_user: userId }).then(({ data }) => {
      if (live && data) setData(data as unknown as Connections);
    });
    return () => {
      live = false;
    };
  }, [supabase, userId]);
  if (!data || (!data.mutual_friends.length && !data.shared_servers.length)) return null;
  return (
    <div className="mt-3 space-y-2 border-t border-white/10 pt-3" data-testid="profile-connections">
      {data.mutual_friends.length > 0 && (
        <section aria-label="Mutual friends">
          <p className="mb-1 font-silk text-[10px] uppercase tracking-wider text-slate-400">Mutual friends — {data.mutual_friends.length}</p>
          <ul className="flex flex-wrap gap-1">
            {data.mutual_friends.slice(0, 8).map((f) => (
              <li key={f.id} title={f.display_name}>
                <UserAvatar profile={f} size={24} />
                <span className="sr-only">{f.display_name}</span>
              </li>
            ))}
            {data.mutual_friends.length > 8 && <li className="self-center text-xs text-slate-400">+{data.mutual_friends.length - 8}</li>}
          </ul>
        </section>
      )}
      {data.shared_servers.length > 0 && (
        <section aria-label="Shared Tambayans">
          <p className="mb-1 font-silk text-[10px] uppercase tracking-wider text-slate-400">Shared Tambayans — {data.shared_servers.length}</p>
          <ul className="flex flex-wrap gap-1">
            {data.shared_servers.slice(0, 8).map((s) => (
              <li key={s.id}>
                <Link href={`/tambayan/${s.id}`} title={s.name} aria-label={s.name} className="block rounded-lg focus-visible:outline-2 focus-visible:outline-sun">
                  <ServerIcon server={s} size={24} />
                </Link>
              </li>
            ))}
            {data.shared_servers.length > 8 && <li className="self-center text-xs text-slate-400">+{data.shared_servers.length - 8}</li>}
          </ul>
        </section>
      )}
    </div>
  );
}
