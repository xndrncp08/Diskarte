"use client";

import { useOptionalServer } from "@/components/providers/ServerProvider";
import { Glyph } from "@/components/ui/Glyph";
import { isGlyphCode } from "@/lib/glyphs";
import { cn } from "@/lib/utils";

/**
 * A `:code:` anywhere: a built-in glyph, else this server's custom emoji (an image), else
 * `fallback` — the literal text in messages, or the glyph's legacy fallback for reactions.
 */
export function Emote({ code, className, fallback = "glyph" }: { code: string; className?: string; fallback?: "glyph" | "text" }) {
  const url = useOptionalServer()?.emojis.get(code.slice(1, -1));
  if (isGlyphCode(code)) return <Glyph code={code} label className={className} />;
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element -- tiny public emoji, sized by the text around it
    return <img src={url} alt={code} title={code} loading="lazy" draggable={false} className={cn("inline-block size-[1.1em] shrink-0 object-contain align-[-0.2em]", className)} data-emoji={code} />;
  }
  return fallback === "text" ? <>{code}</> : <Glyph code={code} label className={className} />;
}
