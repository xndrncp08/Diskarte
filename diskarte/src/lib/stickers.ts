import type { GlyphCode } from "@/lib/glyphs";

/** Built-in Pinoy sticker packs. Art lives in components/chat/Sticker.tsx; the DB stores only the id. */
export interface StickerDef {
  id: string;
  label: string;
  pack: StickerPackId;
}

export type StickerPackId = "salitang-kanto" | "tambayan";

export const STICKER_PACKS: { id: StickerPackId; name: string; glyph: GlyphCode }[] = [
  { id: "salitang-kanto", name: "Salitang Kanto", glyph: ":chat:" },
  { id: "tambayan", name: "Tambayan Classics", glyph: ":jeep:" },
];

export const STICKERS: StickerDef[] = [
  { id: "sana-all", label: "Sana All", pack: "salitang-kanto" },
  { id: "charot", label: "Charot!", pack: "salitang-kanto" },
  { id: "petmalu", label: "Petmalu", pack: "salitang-kanto" },
  { id: "lodi", label: "Lodi", pack: "salitang-kanto" },
  { id: "awit", label: "Awit", pack: "salitang-kanto" },
  { id: "g-na-g", label: "G na G!", pack: "salitang-kanto" },
  { id: "salamat-po", label: "Salamat po", pack: "salitang-kanto" },
  { id: "ingat", label: "Ingat!", pack: "salitang-kanto" },
  { id: "jeepney", label: "Jeepney", pack: "tambayan" },
  { id: "halo-halo", label: "Halo-halo", pack: "tambayan" },
  { id: "kape", label: "Kape muna", pack: "tambayan" },
  { id: "tsinelas", label: "Tsinelas", pack: "tambayan" },
];

const BY_ID = new Map(STICKERS.map((s) => [s.id, s]));

export function getSticker(id: string | null | undefined): StickerDef | undefined {
  return id ? BY_ID.get(id) : undefined;
}

export function isStickerId(id: unknown): id is string {
  return typeof id === "string" && BY_ID.has(id);
}
