/**
 * Hosts whose images go through the Next.js image optimiser (AVIF/WebP, resized per device).
 * Shared by next.config.ts (build-time remotePatterns) and <SmartImage> (runtime check) so the
 * component never asks the optimiser for a host it would reject.
 */
export const OAUTH_IMAGE_HOSTS = ["avatars.githubusercontent.com", "lh3.googleusercontent.com", "cdn.discordapp.com"] as const;
export const SUPABASE_HOST_SUFFIX = ".supabase.co";

export interface ImageHost {
  protocol: "http" | "https";
  hostname: string;
  port: string;
  pathname: string;
}

/** Remote patterns: hosted Supabase (any project), the build's own Supabase URL, OAuth avatar CDNs. */
export function imageHosts(supabaseUrl: string | undefined): ImageHost[] {
  const hosts: ImageHost[] = [{ protocol: "https", hostname: `**${SUPABASE_HOST_SUFFIX}`, port: "", pathname: "/storage/v1/object/**" }];
  if (supabaseUrl) {
    try {
      const url = new URL(supabaseUrl);
      if (!url.hostname.endsWith(SUPABASE_HOST_SUFFIX)) {
        hosts.push({ protocol: url.protocol.replace(":", "") as "http" | "https", hostname: url.hostname, port: url.port, pathname: "/storage/v1/object/**" });
      }
    } catch {
      // Ignore malformed values; the app validates env at runtime.
    }
  }
  for (const hostname of OAUTH_IMAGE_HOSTS) hosts.push({ protocol: "https", hostname, port: "", pathname: "/**" });
  return hosts;
}

/** Serialised list for the client (inlined via next.config `env`). */
export function serializeImageHosts(hosts: ImageHost[]) {
  return hosts.map((h) => `${h.protocol}://${h.hostname}${h.port ? `:${h.port}` : ""}${h.pathname}`).join(",");
}

/** True when `src` matches one of the serialised optimiser hosts. */
export function isOptimizable(src: string, serialized: string | undefined): boolean {
  if (!serialized) return false;
  let url: URL;
  try {
    url = new URL(src);
  } catch {
    return false;
  }
  return serialized.split(",").some((entry) => {
    const m = /^(https?):\/\/([^/]+?)(?::(\d+))?(\/.*)$/.exec(entry);
    if (!m) return false;
    const [, protocol, hostname, port = "", pathname] = m;
    if (url.protocol !== `${protocol}:` || url.port !== port) return false;
    const hostOk = hostname.startsWith("**.") ? url.hostname.endsWith(hostname.slice(2)) : url.hostname === hostname;
    const prefix = pathname.replace(/\*\*$/, "");
    return hostOk && url.pathname.startsWith(prefix);
  });
}
