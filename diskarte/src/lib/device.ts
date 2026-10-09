/**
 * This browser's identity for the presence inspector: a random device id kept in localStorage, a
 * one-way fingerprint of coarse browser traits (hashed, never the raw values) and a readable label.
 */

const DEVICE_KEY = "diskarte:device-id";
let memoryId: string | null = null;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function randomId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  const b = Array.from({ length: 16 }, () => Math.floor(Math.random() * 256));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = b.map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** Stable per browser profile; falls back to a per-tab id when storage is blocked. */
export function getDeviceId(): string {
  try {
    const stored = localStorage.getItem(DEVICE_KEY);
    if (stored && UUID.test(stored)) return stored;
    const id = randomId();
    localStorage.setItem(DEVICE_KEY, id);
    return id;
  } catch {
    memoryId ??= randomId();
    return memoryId;
  }
}

/** The id this browser already has, without creating one (sign-out uses it to forget the device). */
export function existingDeviceId(): string | null {
  try {
    const stored = localStorage.getItem(DEVICE_KEY);
    return stored && UUID.test(stored) ? stored : memoryId;
  } catch {
    return memoryId;
  }
}

/** "Chrome on macOS", "Safari on iOS"… from a user agent string. */
export function deviceLabel(ua: string): string {
  const os = /iPhone|iPad|iPod/.test(ua)
    ? "iOS"
    : /Android/.test(ua)
      ? "Android"
      : /Mac OS X|Macintosh/.test(ua)
        ? "macOS"
        : /Windows/.test(ua)
          ? "Windows"
          : /CrOS/.test(ua)
            ? "ChromeOS"
            : /Linux/.test(ua)
              ? "Linux"
              : "Unknown OS";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\/|Opera/.test(ua)
      ? "Opera"
      : /SamsungBrowser/.test(ua)
        ? "Samsung Internet"
        : /Firefox\/|FxiOS/.test(ua)
          ? "Firefox"
          : /Chrome\/|CriOS/.test(ua)
            ? "Chrome"
            : /Safari\//.test(ua)
              ? "Safari"
              : "Browser";
  return `${browser} on ${os}`;
}

async function sha256Hex(text: string): Promise<string> {
  const subtle = typeof crypto !== "undefined" ? crypto.subtle : undefined;
  if (subtle) {
    const digest = await subtle.digest("SHA-256", new TextEncoder().encode(text));
    return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
  }
  // Insecure contexts have no SubtleCrypto: a 64-bit FNV-1a, doubled to the same length.
  let h1 = 0xcbf29ce4 | 0;
  let h2 = 0x84222325 | 0;
  for (let i = 0; i < text.length; i++) {
    h1 = Math.imul(h1 ^ text.charCodeAt(i), 0x01000193);
    h2 = Math.imul(h2 ^ text.charCodeAt(i), 0x0100019d);
  }
  const part = (n: number) => (n >>> 0).toString(16).padStart(8, "0");
  return (part(h1) + part(h2)).repeat(4);
}

/** 32 hex characters derived from browser traits that don't change between visits. */
export async function deviceFingerprint(): Promise<string> {
  const nav = typeof navigator !== "undefined" ? navigator : null;
  const scr = typeof screen !== "undefined" ? screen : null;
  const traits = [
    nav?.userAgent ?? "",
    nav?.language ?? "",
    (nav as (Navigator & { userAgentData?: { platform?: string } }) | null)?.userAgentData?.platform ?? "",
    String(nav?.hardwareConcurrency ?? ""),
    scr ? `${scr.width}x${scr.height}x${scr.colorDepth}` : "",
    typeof devicePixelRatio === "number" ? String(devicePixelRatio) : "",
    Intl.DateTimeFormat().resolvedOptions().timeZone ?? "",
  ];
  return (await sha256Hex(traits.join("|"))).slice(0, 32);
}
