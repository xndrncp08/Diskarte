/**
 * Diskarte's icon vocabulary. The UI never draws emoji: reactions, status icons, badges, sounds and
 * activities are `:code:` strings rendered as vector icons by <Glyph> (components/ui/Glyph.tsx).
 * This module is plain data so server actions can validate codes without pulling in React.
 */

export const GLYPH_LABELS = {
  // Pinoy reactions
  ":petmalu:": "Petmalu",
  ":lodi:": "Lodi",
  ":sana_all:": "Sana all",
  ":charot:": "Charot",
  ":awit:": "Awit",
  ":g:": "G!",
  ":naol:": "Naol",
  ":kilig:": "Kilig",
  ":lutang:": "Lutang",
  ":ayos:": "Ayos",
  ":salamat:": "Salamat",
  ":tara:": "Tara!",
  ":mabuhay:": "Mabuhay",
  ":canton:": "Pancit Canton",
  ":halo_halo:": "Halo-halo",
  ":jeep:": "Jeepney",
  ":lechon:": "Lechon",
  ":bahala_na:": "Bahala na",
  // Classic reactions
  ":thumbs_up:": "Thumbs up",
  ":thumbs_down:": "Thumbs down",
  ":heart:": "Heart",
  ":laugh:": "Laughing",
  ":sad:": "Sad",
  ":angry:": "Angry",
  ":party:": "Party",
  ":eyes:": "Watching",
  ":check:": "Check",
  ":cross:": "Cross",
  ":skull:": "Dead",
  ":trophy:": "Trophy",
  ":thinking:": "Thinking",
  ":cool:": "Cool",
  ":star:": "Star",
  ":hype:": "Hype",
  // Status icons
  ":afk:": "AFK",
  ":game:": "Gaming",
  ":study:": "Studying",
  ":kumakain:": "Eating",
  ":coffee:": "Coffee",
  ":brownout:": "Brownout",
  ":music:": "Music",
  ":busy:": "Busy",
  // App glyphs
  ":volume:": "Sound",
  ":airhorn:": "Airhorn",
  ":drum:": "Drum",
  ":coins:": "Coins",
  ":warp:": "Warp",
  ":boom:": "Boom",
  ":bruh:": "Bruh",
  ":booster:": "Server Booster",
  ":supporter:": "Supporter",
  ":donor:": "Donor",
  ":tv:": "Watch party",
  ":tictactoe:": "Tic-Tac-Toe",
  ":trivia:": "Trivia",
  ":chat:": "Chat",
  ":sparkle:": "Sparkle",
} as const;

export type GlyphCode = keyof typeof GLYPH_LABELS;

export function isGlyphCode(value: unknown): value is GlyphCode {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(GLYPH_LABELS, value);
}

/**
 * Emoji that may already be stored (old reactions, statuses, soundboard clips) → their icon, so
 * existing data still renders as an icon — never as an emoji.
 */
const LEGACY_EMOJI: Record<string, GlyphCode> = {
  "🔥": ":petmalu:", "🙌": ":lodi:", "🥺": ":sana_all:", "😜": ":charot:", "😩": ":awit:", "🟢": ":g:", "💅": ":naol:",
  "😍": ":kilig:", "😵‍💫": ":lutang:", "👌": ":ayos:", "🙏": ":salamat:", "🏃": ":tara:", "🇵🇭": ":mabuhay:", "🍜": ":canton:",
  "🍧": ":halo_halo:", "🚙": ":jeep:", "🚌": ":jeep:", "🐖": ":lechon:", "🤷": ":bahala_na:", "👍": ":thumbs_up:", "👎": ":thumbs_down:",
  "❤️": ":heart:", "❤": ":heart:", "🫶": ":heart:", "😂": ":laugh:", "🤣": ":laugh:", "😅": ":laugh:", "😭": ":sad:", "🥲": ":sad:",
  "😢": ":sad:", "😡": ":angry:", "😤": ":angry:", "🎉": ":party:", "🥳": ":party:", "👀": ":eyes:", "😮": ":eyes:", "✅": ":check:",
  "❌": ":cross:", "💀": ":skull:", "🏆": ":trophy:", "🤔": ":thinking:", "🤯": ":thinking:", "😎": ":cool:", "⭐": ":star:",
  "⚡": ":hype:", "💯": ":hype:", "😴": ":afk:", "🎮": ":game:", "📚": ":study:", "🍚": ":kumakain:", "☕": ":coffee:",
  "🌧️": ":brownout:", "🎤": ":music:", "🔊": ":volume:", "📯": ":airhorn:", "🥁": ":drum:", "🪙": ":coins:", "🌀": ":warp:",
  "💥": ":boom:", "👏": ":lodi:", "🗿": ":bruh:", "🚀": ":booster:", "💙": ":donor:", "📺": ":tv:", "💬": ":chat:",
};

/** The icon code for any stored value: a known code, a known legacy emoji, or a generic sparkle. */
export function toGlyphCode(value: string | null | undefined): GlyphCode | null {
  if (!value) return null;
  if (isGlyphCode(value)) return value;
  return LEGACY_EMOJI[value] ?? ":sparkle:";
}

export function glyphLabel(value: string | null | undefined): string {
  const code = toGlyphCode(value);
  return code ? GLYPH_LABELS[code] : "";
}

/** Icons people can pick for a custom status. */
export const STATUS_GLYPHS: GlyphCode[] = [":canton:", ":afk:", ":game:", ":study:", ":jeep:", ":kumakain:", ":coffee:", ":brownout:", ":music:", ":busy:", ":party:", ":sparkle:"];

/** Icons for custom soundboard clips. */
export const SOUND_GLYPHS: GlyphCode[] = [":volume:", ":airhorn:", ":drum:", ":boom:", ":coins:", ":warp:", ":laugh:", ":sad:", ":party:", ":bruh:", ":star:", ":hype:"];
