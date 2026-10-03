import { GLYPH_LABELS, isGlyphCode, type GlyphCode } from "./glyphs";

/**
 * Reactions are `:shortcode:` glyphs drawn as vector icons (components/ui/Glyph.tsx) — never emoji.
 * Stored in the DB as the code (see the reactions.emoji check).
 */
const reaction = (code: GlyphCode) => ({ code, label: GLYPH_LABELS[code] });

/** Filipino custom reactions. */
export const PINOY_REACTIONS = (
  [":petmalu:", ":lodi:", ":sana_all:", ":charot:", ":awit:", ":g:", ":naol:", ":kilig:", ":lutang:", ":ayos:", ":salamat:", ":tara:", ":mabuhay:", ":canton:", ":halo_halo:", ":jeep:", ":lechon:", ":bahala_na:"] as const
).map(reaction);

/** Everyday reactions, also as icons. */
export const CLASSIC_REACTIONS = (
  [":thumbs_up:", ":thumbs_down:", ":heart:", ":laugh:", ":sad:", ":angry:", ":party:", ":eyes:", ":check:", ":cross:", ":skull:", ":trophy:", ":thinking:", ":cool:", ":star:", ":hype:", ":coffee:", ":game:"] as const
).map(reaction);

const REACTION_CODES = new Set<string>([...PINOY_REACTIONS, ...CLASSIC_REACTIONS].map((r) => r.code));

/** New reactions must be one of the icon codes above. */
export function isValidReaction(value: string): boolean {
  return REACTION_CODES.has(value);
}

/** Splits text on known `:code:` glyphs (outside code spans/blocks is the caller's job). */
export function splitGlyphs(text: string): (string | { code: GlyphCode })[] {
  const out: (string | { code: GlyphCode })[] = [];
  let last = 0;
  for (const match of text.matchAll(/:[a-z0-9_]{1,32}:/g)) {
    if (!isGlyphCode(match[0])) continue;
    if (match.index > last) out.push(text.slice(last, match.index));
    out.push({ code: match[0] });
    last = match.index + match[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}
