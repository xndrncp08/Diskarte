/**
 * Discord-style search syntax: `from:username` and `in:channel` filters, the rest is words.
 * Unknown filters stay in the text so nothing typed silently disappears.
 */
export interface ParsedSearch {
  text: string;
  from: string | null;
  in: string | null;
}

export function parseSearch(input: string): ParsedSearch {
  let from: string | null = null;
  let channel: string | null = null;
  const words: string[] = [];
  for (const token of input.trim().split(/\s+/)) {
    const m = /^(from|in):#?@?(.+)$/i.exec(token);
    if (m && m[1].toLowerCase() === "from") from = m[2].toLowerCase();
    else if (m && m[1].toLowerCase() === "in") channel = m[2].toLowerCase();
    else if (token) words.push(token);
  }
  return { text: words.join(" "), from, in: channel };
}
