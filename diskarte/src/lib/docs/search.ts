/** Help Center search over the build-time index (public/docs-assets/search-index.json): no service, no network after one fetch. */
export interface SearchEntry {
  /** page slug */ s: string;
  /** heading anchor ("" = page intro) */ a: string;
  /** page title */ p: string;
  /** section title */ c: string;
  /** heading text */ h: string;
  /** section text */ t: string;
}

export interface SearchHit { entry: SearchEntry; href: string; score: number; excerpt: { before: string; match: string; after: string } }

const normalize = (text: string) => text.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "");
export const searchTerms = (query: string) => normalize(query).split(/[^\p{L}\p{N}_@/.-]+/u).filter((t) => t.length > 1).slice(0, 8);

/**
 * Every term must appear (as a word prefix) in the heading, page title or text. Headings weigh most,
 * then titles, then text; ties keep index order (which follows the sidebar).
 */
export function searchDocs(index: SearchEntry[], query: string, category: string | null = null, limit = 20): SearchHit[] {
  const terms = searchTerms(query);
  if (!terms.length) return [];
  const hits: SearchHit[] = [];
  for (const entry of index) {
    if (category && entry.c !== category) continue;
    const heading = normalize(entry.h), title = normalize(entry.p), text = normalize(entry.t);
    let score = 0;
    let ok = true;
    for (const term of terms) {
      const word = new RegExp(`(^|[^\\p{L}\\p{N}])${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "u");
      const inHeading = word.test(heading), inTitle = word.test(title), inText = word.test(text);
      if (!inHeading && !inTitle && !inText) { ok = false; break; }
      score += (inHeading ? 8 : 0) + (inTitle ? 3 : 0) + (inText ? 1 : 0);
    }
    if (!ok) continue;
    if (heading === normalize(query.trim())) score += 10;
    hits.push({ entry, href: `/docs/${entry.s}${entry.a ? `#${entry.a}` : ""}`, score, excerpt: excerpt(entry.t, terms) });
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, limit);
}

/** ~160 characters of text around the first matching term, split so the match can be highlighted. */
export function excerpt(text: string, terms: string[], width = 160) {
  const lower = normalize(text);
  let at = -1, length = 0;
  for (const term of terms) {
    const i = lower.indexOf(term);
    if (i >= 0 && (at < 0 || i < at)) { at = i; length = term.length; }
  }
  if (at < 0) return { before: text.slice(0, width), match: "", after: "" };
  const start = Math.max(0, at - Math.floor((width - length) / 2));
  const end = Math.min(text.length, start + width);
  return { before: `${start > 0 ? "…" : ""}${text.slice(start, at)}`, match: text.slice(at, at + length), after: `${text.slice(at + length, end)}${end < text.length ? "…" : ""}` };
}
