"use client";

import { Sticker as StickerIcon } from "lucide-react";
import { useState } from "react";
import { Popover } from "@/components/ui/Popover";
import { STICKER_PACKS, STICKERS, type StickerPackId } from "@/lib/stickers";
import { cn } from "@/lib/utils";
import { Sticker } from "./Sticker";
import { Glyph } from "@/components/ui/Glyph";

/** Composer button → Pinoy sticker packs. Picking one sends it immediately. */
export function StickerPicker({ onPick, disabled = false }: { onPick: (id: string) => void; disabled?: boolean }) {
  const [pack, setPack] = useState<StickerPackId>(STICKER_PACKS[0].id);
  return (
    <Popover
      label="Stickers"
      testId="sticker-picker"
      className="w-80"
      trigger={({ toggle, ref, open, ...aria }) => (
        <button
          ref={ref}
          type="button"
          aria-label="Send a sticker"
          disabled={disabled}
          onClick={toggle}
          {...aria}
          className={cn(
            "touch-target relative rounded-md p-1.5 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-30 pointer-coarse:p-3",
            open ? "text-sun" : "text-slate-400",
          )}
        >
          <StickerIcon className="size-5" aria-hidden />
        </button>
      )}
    >
      {(close) => (
        <>
          <div role="tablist" aria-label="Sticker packs" className="mb-2 flex gap-1">
            {STICKER_PACKS.map((p) => (
              <button
                key={p.id}
                type="button"
                role="tab"
                aria-selected={pack === p.id}
                onClick={() => setPack(p.id)}
                className={cn(
                  "flex-1 rounded-lg px-2 py-1.5 text-xs font-semibold transition-colors pointer-coarse:py-2.5",
                  pack === p.id ? "bg-sun text-abyss" : "bg-white/5 text-slate-300 hover:bg-white/10",
                )}
              >
                <Glyph code={p.glyph} className="size-3.5" tinted={false} /> {p.name}
              </button>
            ))}
          </div>
          <div role="tabpanel" aria-label={STICKER_PACKS.find((p) => p.id === pack)?.name} className="grid grid-cols-3 gap-1.5">
            {STICKERS.filter((s) => s.pack === pack).map((s) => (
              <button
                key={s.id}
                type="button"
                aria-label={s.label}
                title={s.label}
                onClick={() => {
                  onPick(s.id);
                  close();
                }}
                className="flex items-center justify-center rounded-xl p-1 transition-[background-color,transform] hover:scale-105 hover:bg-white/10 active:scale-95"
              >
                <Sticker id={s.id} size={80} />
              </button>
            ))}
          </div>
        </>
      )}
    </Popover>
  );
}
