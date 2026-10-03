import type { RealtimeChannel } from "@supabase/supabase-js";
import type { BrowserSupabase } from "@/lib/supabase/browser";

// ---- topic teardown registry -----------------------------------------------------------------
// realtime-js hands back the *existing* channel for a topic until its removal has completed (an
// unsubscribe round trip). Subscribing to the same topic in that window — switching away from a chat
// and straight back, leaving and rejoining voice, React Strict Mode's double effects — would reuse
// the dying channel: it never joins again, so its presence and messages silently stop. Every
// subscriber therefore waits for a pending teardown of its topic before creating a channel.
const teardowns = new Map<string, Promise<unknown>>();

/** Resolves once no removal of `topic` is in flight. */
export function whenTopicFree(topic: string): Promise<void> {
  return (teardowns.get(topic) ?? Promise.resolve()).then(
    () => undefined,
    () => undefined,
  );
}

/** Remove a channel and register the teardown so a re-subscribe to its topic waits for it. */
export function removeChannelSafely(supabase: BrowserSupabase, topic: string, channel: RealtimeChannel) {
  const removal = supabase.removeChannel(channel).catch(() => undefined);
  teardowns.set(topic, removal);
  void removal.then(() => {
    if (teardowns.get(topic) === removal) teardowns.delete(topic);
  });
  return removal;
}

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
    .then(() => whenTopicFree(`db:${topic}`))
    .then(() => {
      if (cancelled) return;
      channel = bind(supabase.channel(`db:${topic}`, { config: { private: true } }));
      channel.subscribe(onStatus);
    });
  return () => {
    cancelled = true;
    if (channel) void removeChannelSafely(supabase, `db:${topic}`, channel);
  };
}
