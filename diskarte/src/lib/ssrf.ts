import "server-only";
import dns from "node:dns";
import http from "node:http";
import https from "node:https";
import net from "node:net";

/**
 * Server-side fetching of user-supplied URLs (link previews) without SSRF: http(s) on the default
 * ports only, and every address the host resolves to — checked at connect time, so DNS rebinding
 * can't swap in an internal one — must be public. Redirects are followed by hand and re-checked.
 */

const blocked = new net.BlockList();
for (const [net4, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const)
  blocked.addSubnet(net4, prefix, "ipv4");
for (const [net6, prefix] of [
  ["::", 128],
  ["::1", 128],
  ["64:ff9b::", 96],
  ["64:ff9b:1::", 48],
  ["100::", 64],
  ["2001::", 23],
  ["2001:db8::", 32],
  ["2002::", 16],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
] as const)
  blocked.addSubnet(net6, prefix, "ipv6");

/** A routable, public unicast address? (IPv4-mapped IPv6 is judged by its IPv4 part.) */
export function isPublicAddress(ip: string): boolean {
  const family = net.isIP(ip);
  if (family === 4) return !blocked.check(ip, "ipv4");
  if (family !== 6) return false;
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
  if (mapped) return isPublicAddress(mapped[1]);
  if (/^::ffff:/i.test(ip)) return false;
  return !blocked.check(ip, "ipv6");
}

export class BlockedUrlError extends Error {}

type LookupCallback = (err: NodeJS.ErrnoException | null, address: string | dns.LookupAddress[], family?: number) => void;

/** dns.lookup that refuses to hand back anything non-public. */
function safeLookup(hostname: string, options: dns.LookupOptions, callback: LookupCallback) {
  dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err, []);
    const list = addresses as dns.LookupAddress[];
    if (list.length === 0 || list.some((a) => !isPublicAddress(a.address))) {
      return callback(Object.assign(new BlockedUrlError(`Blocked address for ${hostname}`), { code: "EBLOCKED" }), []);
    }
    if (options.all) return callback(null, list);
    callback(null, list[0].address, list[0].family);
  });
}

/** Parse and vet a user-supplied URL; null if it's not something we'll fetch. */
export function vetUrl(raw: string): URL | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (url.username || url.password) return null;
  if (url.port && url.port !== (url.protocol === "https:" ? "443" : "80")) return null;
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (net.isIP(host) && !isPublicAddress(host)) return null;
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal") || host.endsWith(".local") || !host.includes(".")) return null;
  return url;
}

export interface SafeResponse {
  status: number;
  url: string;
  contentType: string;
  body: Buffer;
}

function requestOnce(url: URL, opts: { accept: string; maxBytes: number; timeoutMs: number }): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: Buffer }> {
  return new Promise((resolve, reject) => {
    const lib = url.protocol === "https:" ? https : http;
    const req = lib.request(
      url,
      {
        method: "GET",
        lookup: safeLookup as unknown as net.LookupFunction,
        headers: { "User-Agent": "Mozilla/5.0 (compatible; DiskarteBot/1.0; +link previews)", Accept: opts.accept, "Accept-Language": "en" },
        timeout: opts.timeoutMs,
      },
      (res) => {
        const chunks: Buffer[] = [];
        let size = 0;
        res.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > opts.maxBytes) {
            // Enough for what we need (the <head>, or a too-big image we'll refuse anyway).
            chunks.push(chunk.subarray(0, Math.max(0, opts.maxBytes - (size - chunk.length))));
            res.destroy();
            resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks) });
            return;
          }
          chunks.push(chunk);
        });
        res.on("end", () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks) }));
        res.on("error", reject);
      },
    );
    req.on("timeout", () => req.destroy(new Error("Timed out")));
    req.on("error", reject);
    req.end();
  });
}

/** GET a public URL, following up to 3 redirects (each re-vetted). Throws BlockedUrlError for internal targets. */
export async function safeFetch(raw: string, opts: { accept: string; maxBytes: number; timeoutMs?: number }): Promise<SafeResponse> {
  let url = vetUrl(raw);
  if (!url) throw new BlockedUrlError("URL not allowed");
  for (let hop = 0; hop <= 3; hop++) {
    const res = await requestOnce(url, { accept: opts.accept, maxBytes: opts.maxBytes, timeoutMs: opts.timeoutMs ?? 5000 });
    const location = res.headers.location;
    if (res.status >= 300 && res.status < 400 && location) {
      const next = vetUrl(new URL(location, url).toString());
      if (!next) throw new BlockedUrlError("Redirect not allowed");
      url = next;
      continue;
    }
    return { status: res.status, url: url.toString(), contentType: String(res.headers["content-type"] ?? ""), body: res.body };
  }
  throw new Error("Too many redirects");
}
