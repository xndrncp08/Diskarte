"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useMe } from "@/components/providers/MeProvider";
import { useSupabase } from "@/components/providers/RuntimeConfig";
import { cn } from "@/lib/utils";

type From = "everyone" | "server_members" | "nobody";
const OPTIONS: { value: From; label: string; hint: string }[] = [
  { value: "everyone", label: "Everyone", hint: "Anyone who knows your username." },
  { value: "server_members", label: "Server members", hint: "Only people who share a server with you (Diskarte HQ doesn't count)." },
  { value: "nobody", label: "Nobody", hint: "You can still send requests yourself." },
];

/** Who can send you friend requests (enforced by the database). DMs are already friends-only. */
export function PrivacySettings() {
  const supabase = useSupabase();
  const { me } = useMe();
  const [from, setFrom] = useState<From | null>(null);

  useEffect(() => {
    void supabase
      .from("privacy_settings")
      .select("friend_requests_from")
      .maybeSingle()
      .then(({ data, error }) => setFrom(error ? null : ((data?.friend_requests_from as From | undefined) ?? "everyone")));
  }, [supabase]);

  async function choose(next: From) {
    const before = from;
    setFrom(next);
    const { error } = await supabase.from("privacy_settings").upsert({ user_id: me.id, friend_requests_from: next, updated_at: new Date().toISOString() });
    if (error) {
      setFrom(before);
      toast.error("Couldn't save that.");
    }
  }

  return (
    <div className="max-w-md space-y-5" data-testid="privacy-settings">
      <fieldset disabled={from === null}>
        <legend className="mb-2 text-sm font-semibold text-white">Who can send you a friend request</legend>
        <div className="space-y-2" role="radiogroup" aria-label="Who can send you a friend request">
          {OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={from === o.value}
              onClick={() => void choose(o.value)}
              className={cn(
                "block w-full rounded-lg border px-3 py-2 text-left transition-colors disabled:opacity-50",
                from === o.value ? "border-sun/70 bg-sun/10" : "border-white/10 hover:border-white/25",
              )}
            >
              <span className="block text-sm font-semibold text-white">{o.label}</span>
              <span className="block text-xs text-slate-400">{o.hint}</span>
            </button>
          ))}
        </div>
      </fieldset>
      <p className="text-xs text-slate-400">Direct messages: only friends can start one with you. Block someone from their profile menu to stop them entirely.</p>
    </div>
  );
}
