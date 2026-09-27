import { vi } from "vitest";

type Handler = (payload: Record<string, unknown>) => void;

interface Binding {
  type: string;
  filter: Record<string, string>;
  handler: Handler;
}

/**
 * Minimal in-memory stand-in for the Supabase browser client: records realtime bindings so tests
 * can `emit` postgres_changes / broadcast events, and answers queries from a per-table fixture.
 */
export function createFakeSupabase(tables: Record<string, unknown[]> = {}) {
  const channels: { name: string; bindings: Binding[]; sent: unknown[] }[] = [];
  const uploads: { bucket: string; path: string }[] = [];
  const removed: string[] = [];

  function builder(table: string) {
    let rows = [...((tables[table] as Record<string, unknown>[]) ?? [])];
    const api = {
      select: () => api,
      eq: (col: string, val: unknown) => ((rows = rows.filter((r) => r[col] === val)), api),
      neq: (col: string, val: unknown) => ((rows = rows.filter((r) => r[col] !== val)), api),
      is: (col: string, val: unknown) => ((rows = rows.filter((r) => (r[col] ?? null) === val)), api),
      like: (col: string, pattern: string) => ((rows = rows.filter((r) => String(r[col]).startsWith(pattern.replace(/%$/, "")))), api),
      lt: (col: string, val: string) => ((rows = rows.filter((r) => String(r[col]) < val)), api),
      gt: (col: string, val: string) => ((rows = rows.filter((r) => String(r[col]) > val)), api),
      in: (col: string, vals: unknown[]) => ((rows = rows.filter((r) => vals.includes(r[col]))), api),
      order: () => api,
      limit: (n: number) => ((rows = rows.slice(0, n)), api),
      maybeSingle: () => Promise.resolve({ data: rows[0] ?? null, error: null }),
      single: () => Promise.resolve({ data: rows[0] ?? null, error: null }),
      then: (resolve: (v: { data: unknown[]; error: null }) => unknown) => Promise.resolve({ data: rows, error: null }).then(resolve),
    };
    return api;
  }

  const client = {
    channel: vi.fn((name: string) => {
      const entry = { name, bindings: [] as Binding[], sent: [] as unknown[] };
      channels.push(entry);
      const ch = {
        on: (type: string, filter: Record<string, string>, handler: Handler) => {
          entry.bindings.push({ type, filter, handler });
          return ch;
        },
        subscribe: (cb?: (status: string) => void) => {
          cb?.("SUBSCRIBED");
          return ch;
        },
        send: vi.fn(async (msg: unknown) => {
          entry.sent.push(msg);
          return "ok";
        }),
        track: vi.fn(async () => "ok"),
        presenceState: () => ({}),
      };
      return ch;
    }),
    removeChannel: vi.fn(async () => "ok"),
    realtime: { setAuth: vi.fn(async () => undefined) },
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

  /** Fire a postgres_changes event at every matching binding. */
  function emitDb(table: string, event: "INSERT" | "UPDATE" | "DELETE", row: Record<string, unknown>) {
    for (const ch of channels) {
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
    for (const ch of channels.filter((c) => c.name === channelName)) {
      for (const b of ch.bindings) if (b.type === "broadcast" && b.filter.event === event) b.handler({ payload });
    }
  }

  return { client, channels, uploads, removed, emitDb, emitBroadcast };
}
