import { vi } from "vitest";

type Handler = (payload: Record<string, unknown>) => void;

interface Binding {
  type: string;
  filter: Record<string, string>;
  handler: Handler;
}

interface FakeChannelHandle {
  on: (type: string, filter: Record<string, string>, handler: Handler) => FakeChannelHandle;
  subscribe: (cb?: (status: string) => void) => FakeChannelHandle;
  send: (msg: unknown) => Promise<string>;
  track: (payload?: unknown) => Promise<string>;
  presenceState: () => Record<string, unknown[]>;
}

interface FakeChannel {
  name: string;
  config: Record<string, unknown>;
  bindings: Binding[];
  sent: unknown[];
  subscribed: boolean;
  authedFirst: boolean;
  removing: boolean;
  removed: boolean;
  presence: Record<string, unknown[]>;
  handle: FakeChannelHandle;
}

/**
 * Minimal in-memory stand-in for the Supabase browser client: records realtime bindings so tests
 * can `emit` postgres_changes / broadcast events, and answers queries from a per-table fixture.
 */
export function createFakeSupabase(tables: Record<string, unknown[]> = {}) {
  const channels: FakeChannel[] = [];
  /** How many times realtime.setAuth() has resolved (a join must follow one to carry the user's JWT). */
  let authed = 0;
  const uploads: { bucket: string; path: string }[] = [];
  const removed: string[] = [];

  function builder(table: string) {
    let rows = [...((tables[table] as Record<string, unknown>[]) ?? [])];
    const orders: { col: string; asc: boolean }[] = [];
    const api = {
      select: () => api,
      eq: (col: string, val: unknown) => ((rows = rows.filter((r) => r[col] === val)), api),
      neq: (col: string, val: unknown) => ((rows = rows.filter((r) => r[col] !== val)), api),
      is: (col: string, val: unknown) => ((rows = rows.filter((r) => (r[col] ?? null) === val)), api),
      like: (col: string, pattern: string) => ((rows = rows.filter((r) => String(r[col]).startsWith(pattern.replace(/%$/, "")))), api),
      lt: (col: string, val: string) => ((rows = rows.filter((r) => String(r[col]) < val)), api),
      gt: (col: string, val: string) => ((rows = rows.filter((r) => String(r[col]) > val)), api),
      in: (col: string, vals: unknown[]) => ((rows = rows.filter((r) => vals.includes(r[col]))), api),
      // Only the keyset form the chat hooks use: `col.lt."v",and(col.eq."v",id.lt."w")`.
      or: (filter: string) => {
        const m = /^(\w+)\.lt\."([^"]+)",and\(\1\.eq\."\2",(\w+)\.lt\."([^"]+)"\)$/.exec(filter);
        if (!m) throw new Error(`fake supabase: unsupported or() filter ${filter}`);
        const [, col, value, tie, tieValue] = m;
        rows = rows.filter((r) => String(r[col]) < value || (String(r[col]) === value && String(r[tie]) < tieValue));
        return api;
      },
      order: (col: string, opts: { ascending?: boolean } = {}) => {
        // Stable multi-key sort: apply keys in call order by sorting with the latest key last.
        orders.push({ col, asc: opts.ascending !== false });
        rows = [...rows].sort((a, b) => {
          for (const o of orders) {
            const cmp = String(a[o.col]).localeCompare(String(b[o.col]));
            if (cmp) return o.asc ? cmp : -cmp;
          }
          return 0;
        });
        return api;
      },
      limit: (n: number) => ((rows = rows.slice(0, n)), api),
      maybeSingle: () => Promise.resolve({ data: rows[0] ?? null, error: null }),
      single: () => Promise.resolve({ data: rows[0] ?? null, error: null }),
      then: (resolve: (v: { data: unknown[]; error: null }) => unknown) => Promise.resolve({ data: rows, error: null }).then(resolve),
    };
    return api;
  }

  const client = {
    // Like realtime-js: a topic that still has a channel (even one mid-removal) hands that channel back.
    channel: vi.fn((name: string, opts: { config?: Record<string, unknown> } = {}) => {
      const existing = channels.find((c) => c.name === name && !c.removed);
      if (existing) return existing.handle;
      const entry: FakeChannel = {
        name,
        config: opts.config ?? {},
        bindings: [] as Binding[],
        sent: [] as unknown[],
        subscribed: false,
        authedFirst: false,
        removing: false,
        removed: false,
        presence: {},
        handle: null as unknown as FakeChannelHandle,
      };
      channels.push(entry);
      const ch: FakeChannelHandle = {
        on: (type: string, filter: Record<string, string>, handler: Handler) => {
          entry.bindings.push({ type, filter, handler });
          return ch;
        },
        subscribe: (cb?: (status: string) => void) => {
          // A channel that is being torn down never (re)joins.
          if (entry.removing) return ch;
          entry.subscribed = true;
          entry.authedFirst = authed > 0;
          cb?.("SUBSCRIBED");
          return ch;
        },
        send: vi.fn(async (msg: unknown) => {
          if (entry.removing) return "error";
          entry.sent.push(msg);
          return "ok";
        }),
        track: vi.fn(async () => (entry.removing ? "error" : "ok")),
        presenceState: () => entry.presence,
      };
      entry.handle = ch;
      return ch;
    }),
    // Like realtime-js: unsubscribing takes a round trip; the channel only leaves the list afterwards.
    removeChannel: vi.fn(async (ch: FakeChannelHandle) => {
      const entry = channels.find((c) => c.handle === ch);
      if (!entry) return "ok";
      entry.removing = true;
      entry.subscribed = false;
      await new Promise((r) => setTimeout(r, 30));
      entry.removed = true;
      return "ok";
    }),
    realtime: {
      setAuth: vi.fn(async () => {
        authed += 1;
      }),
    },
    from: vi.fn((table: string) => builder(table)),
    rpc: vi.fn(async () => ({ data: null, error: null })),
    storage: {
      from: (bucket: string) => ({
        upload: vi.fn(async (path: string) => {
          uploads.push({ bucket, path });
          return { data: { path }, error: null };
        }),
        remove: vi.fn(async (paths: string[]) => {
          removed.push(...paths);
          return { data: [], error: null };
        }),
        createSignedUrl: vi.fn(async (path: string) => ({ data: { signedUrl: `https://signed.test/${path}` }, error: null })),
        createSignedUrls: vi.fn(async (paths: string[]) => ({ data: paths.map((p) => ({ path: p, signedUrl: `https://signed.test/${p}` })), error: null })),
        getPublicUrl: (path: string) => ({ data: { publicUrl: `https://abc.supabase.co/storage/v1/object/public/${bucket}/${path}` } }),
      }),
    },
  };

  /** Fire a postgres_changes event at every matching binding of a subscribed channel. */
  function emitDb(table: string, event: "INSERT" | "UPDATE" | "DELETE", row: Record<string, unknown>) {
    for (const ch of channels.filter((c) => c.subscribed && !c.removing)) {
      for (const b of ch.bindings) {
        if (b.type !== "postgres_changes" || b.filter.table !== table || (b.filter.event !== event && b.filter.event !== "*")) continue;
        if (b.filter.filter) {
          const [col, rest] = b.filter.filter.split("=");
          if (String(row[col]) !== rest.replace(/^eq\./, "")) continue;
        }
        b.handler(event === "DELETE" ? { old: row, new: {} } : { new: row, old: {} });
      }
    }
  }

  function emitBroadcast(channelName: string, event: string, payload: unknown) {
    for (const ch of channels.filter((c) => c.name === channelName && !c.removing)) {
      for (const b of ch.bindings) if (b.type === "broadcast" && b.filter.event === event) b.handler({ payload });
    }
  }

  /** Replace a presence channel's state and fire its `sync` (only a live, subscribed channel hears it). */
  function syncPresence(channelName: string, state: Record<string, unknown[]>) {
    for (const ch of channels.filter((c) => c.name === channelName && c.subscribed && !c.removing)) {
      ch.presence = state;
      for (const b of ch.bindings) if (b.type === "presence" && b.filter.event === "sync") b.handler({});
    }
  }

  /** The subscribed channel with this topic, if any. */
  function joined(name: string) {
    return channels.find((c) => c.name === name && c.subscribed && !c.removing);
  }

  return { client, channels, uploads, removed, emitDb, emitBroadcast, joined, syncPresence };
}
