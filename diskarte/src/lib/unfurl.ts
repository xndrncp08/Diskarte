/** Link previews: pick links out of a message, and read a page's Open Graph / Twitter / <title> tags. */

export interface LinkPreview {
  url: string;
  siteName: string | null;
  title: string | null;
  description: string | null;
  /** Our signed image-proxy URL (the CSP keeps third-party images out of the page). */
  image: string | null;
  color: string | null;
}

export const MAX_EMBEDS = 3;

/**
 * Up to three distinct http(s) links, outside code, like Discord. Wrapping a link in <angle
 * brackets> suppresses its preview.
 */
export function extractLinks(content: string): string[] {
  const text = content.replace(/```[\s\S]*?(```|$)/g, " ").replace(/`[^`]*`/g, " ");
  const out: string[] = [];
  for (const match of text.matchAll(/<?https?:\/\/[^\s<>]+>?/g)) {
    if (match[0].startsWith("<") && match[0].endsWith(">")) continue;
    let link = match[0].replace(/^</, "").replace(/[\].,!?;:'">]+$/, "");
    // Keep a closing paren that belongs to the link (wiki/Foo_(bar)), drop one that closes the sentence.
    while (link.endsWith(")") && link.split("(").length < link.split(")").length) link = link.slice(0, -1).replace(/[\].,!?;:'">]+$/, "");
    try {
      new URL(link);
    } catch {
      continue;
    }
    if (!out.includes(link)) out.push(link);
    if (out.length === MAX_EMBEDS) break;
  }
  return out;
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
function decode(value: string) {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, ent: string) => {
    if (ent[0] === "#") {
      const code = ent[1].toLowerCase() === "x" ? parseInt(ent.slice(2), 16) : parseInt(ent.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : whole;
    }
    return ENTITIES[ent.toLowerCase()] ?? whole;
  });
}

function clean(value: string | undefined, max: number) {
  if (!value) return null;
  const text = decode(value).replace(/\s+/g, " ").trim();
  if (!text) return null;
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** Title, description, site name, image URL (absolute, http(s)) and theme colour from a page's HTML. */
export function parseMeta(html: string, pageUrl: string) {
  const head = html.slice(0, 512 * 1024);
  const meta = new Map<string, string>();
  for (const tag of head.matchAll(/<meta\b[^>]*>/gi)) {
    const attrs = new Map<string, string>();
    for (const a of tag[0].matchAll(/([a-zA-Z:-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/g)) attrs.set(a[1].toLowerCase(), a[3] ?? a[4] ?? a[5] ?? "");
    const key = (attrs.get("property") ?? attrs.get("name") ?? "").toLowerCase();
    const content = attrs.get("content");
    if (key && content !== undefined && !meta.has(key)) meta.set(key, content);
  }
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(head)?.[1];
  const pick = (...keys: string[]) => keys.map((k) => meta.get(k)).find((v) => v && v.trim());
  let image: string | null = null;
  const rawImage = pick("og:image:secure_url", "og:image", "og:image:url", "twitter:image", "twitter:image:src");
  if (rawImage) {
    try {
      const abs = new URL(decode(rawImage.trim()), pageUrl);
      if (abs.protocol === "https:" || abs.protocol === "http:") image = abs.toString();
    } catch {
      image = null;
    }
  }
  const color = pick("theme-color");
  return {
    siteName: clean(pick("og:site_name", "application-name"), 80) ?? new URL(pageUrl).hostname.replace(/^www\./, ""),
    title: clean(pick("og:title", "twitter:title") ?? title, 200),
    description: clean(pick("og:description", "twitter:description", "description"), 350),
    image,
    color: color && /^#[0-9a-f]{3,8}$/i.test(color.trim()) ? color.trim() : null,
  };
}
