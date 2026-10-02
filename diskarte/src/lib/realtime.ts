import type { RealtimeChannel } from "@supabase/supabase-js";
import type { BrowserSupabase } from "@/lib/supabase/browser";

/**
 * Joins the Postgres Changes topic `db:<topic>` as a private channel and returns the cleanup.
 *
 * Two things have to hold for rows to arrive live:
 *  - the channel is private: with Realtime's "Allow public access" off (see DEPLOYMENT.md), public
 *    joins are refused. `public.can_access_realtime_topic` authorises each `db:*` topic.
 *  - the socket has my JWT before the join: realtime-js copies the token into the join payload when
 *    `subscribe()` runs, and a join without it is evaluated as anon, so RLS filters every row out.
 *
 * `bind` registers the `postgres_changes` listeners on the fresh channel; `onStatus` sees join status.
 */
export function subscribeDbChanges(
  supabase: BrowserSupabase,
  topic: string,
  bind: (channel: RealtimeChannel) => RealtimeChannel,
  onStatus?: Parameters<RealtimeChannel["subscribe"]>[0],
): () => void {
  let channel: RealtimeChannel | null = null;
  let cancelled = false;
  void supabase.realtime
    .setAuth()
    .catch(() => undefined)
    .then(() => {
      if (cancelled) return;
      channel = bind(supabase.channel(`db:${topic}`, { config: { private: true } }));
      channel.subscribe(onStatus);
    });
  return () => {
    cancelled = true;
    if (channel) void supabase.removeChannel(channel);
  };
}
