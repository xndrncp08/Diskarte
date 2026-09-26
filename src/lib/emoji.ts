/** Filipino custom reactions. Stored in the DB as `:shortcode:` (see reactions.emoji check). */
export const PINOY_REACTIONS = [
  { code: ":petmalu:", emoji: "🔥", label: "Petmalu" },
  { code: ":lodi:", emoji: "🙌", label: "Lodi" },
  { code: ":sana_all:", emoji: "🥺", label: "Sana all" },
  { code: ":charot:", emoji: "😜", label: "Charot" },
  { code: ":awit:", emoji: "😩", label: "Awit" },
  { code: ":g:", emoji: "🟢", label: "G!" },
  { code: ":naol:", emoji: "💅", label: "Naol" },
  { code: ":kilig:", emoji: "😍", label: "Kilig" },
  { code: ":lutang:", emoji: "😵‍💫", label: "Lutang" },
  { code: ":ayos:", emoji: "👌", label: "Ayos" },
  { code: ":salamat:", emoji: "🙏", label: "Salamat" },
  { code: ":tara:", emoji: "🏃", label: "Tara!" },
  { code: ":mabuhay:", emoji: "🇵🇭", label: "Mabuhay" },
  { code: ":canton:", emoji: "🍜", label: "Pancit Canton" },
  { code: ":halo_halo:", emoji: "🍧", label: "Halo-halo" },
  { code: ":jeep:", emoji: "🚙", label: "Jeepney" },
  { code: ":lechon:", emoji: "🐖", label: "Lechon" },
  { code: ":bahala_na:", emoji: "🤷", label: "Bahala na" },
] as const;

export const CLASSIC_EMOJI = [
  "👍", "👎", "😂", "🤣", "❤️", "😭", "😮", "😡", "🎉", "👀",
  "💯", "✅", "❌", "🤔", "😎", "🥲", "😅", "🙏", "👏", "💀",
  "🤝", "🫡", "🫶", "🤯", "😴", "🥳", "😤", "🤡", "🎮", "🏆",
  "⚡", "🌧️", "☕", "🍚", "🥭", "🌴", "🌊", "🏀", "🎤", "📚",
] as const;

const BY_CODE = new Map<string, (typeof PINOY_REACTIONS)[number]>(PINOY_REACTIONS.map((r) => [r.code, r]));

export function isValidReaction(value: string): boolean {
  if (BY_CODE.has(value)) return true;
  return (CLASSIC_EMOJI as readonly string[]).includes(value);
}

export function reactionDisplay(value: string): { emoji: string; label: string; custom: boolean } {
  const custom = BY_CODE.get(value);
  if (custom) return { emoji: custom.emoji, label: custom.label, custom: true };
  return { emoji: value, label: value, custom: false };
}

/** Replace `:shortcode:` tokens in message text with their emoji (outside code spans/blocks). */
export function renderShortcodes(text: string): string {
  const parts = text.split(/(```[\s\S]*?```|`[^`\n]*`)/g);
  return parts
    .map((part, i) => (i % 2 === 1 ? part : part.replace(/:[a-z0-9_]{1,32}:/g, (code) => BY_CODE.get(code)?.emoji ?? code)))
    .join("");
}
