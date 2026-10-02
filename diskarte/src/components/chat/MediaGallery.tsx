"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import type { KeyboardEvent } from "react";
import { SmartImage } from "@/components/ui/SmartImage";
import { cn } from "@/lib/utils";
import type { MediaItem } from "./MediaViewer";

/** The media viewer's body (image/video stage, prev/next, thumbnails), loaded on first open. */
export function Gallery({ items, index, onIndex }: { items: MediaItem[]; index: number; onIndex: (index: number) => void }) {
  const item = items[index];
  const many = items.length > 1;
  const go = (step: number) => onIndex((index + step + items.length) % items.length);

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (!many || (e.target as HTMLElement).closest("video")) return;
    if (e.key === "ArrowRight") go(1);
    else if (e.key === "ArrowLeft") go(-1);
    else return;
    e.preventDefault();
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col" onKeyDown={onKeyDown} data-testid="media-viewer">
      <div className="relative flex min-h-[16rem] flex-1 items-center justify-center bg-black/60" aria-live="polite">
        {item.type.startsWith("video/") ? (
          <video key={item.url} src={item.url} controls autoPlay playsInline className="max-h-[70dvh] w-full" aria-label={item.name} />
        ) : (
          <div className="relative h-[min(70dvh,40rem)] w-full">
            <SmartImage key={item.url} src={item.url} alt={item.name} fill sizes="(max-width: 640px) 100vw, 60rem" className="object-contain" />
          </div>
        )}
        {many && (
          <>
            <button
              type="button"
              onClick={() => go(-1)}
              aria-label="Previous"
              data-autofocus
              className="absolute left-2 top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur transition-colors hover:bg-black/80 pointer-coarse:size-11"
            >
              <ChevronLeft className="size-5" aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => go(1)}
              aria-label="Next"
              className="absolute right-2 top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur transition-colors hover:bg-black/80 pointer-coarse:size-11"
            >
              <ChevronRight className="size-5" aria-hidden />
            </button>
          </>
        )}
      </div>
      {many && (
        <div className="flex items-center gap-2 border-t border-white/10 px-3 py-2">
          <p className="shrink-0 font-pixel text-[9px] text-slate-400" aria-live="polite">
            {index + 1} / {items.length}
          </p>
          <div className="scrollbar-thin flex gap-1.5 overflow-x-auto" role="group" aria-label="All media in this message">
            {items.map((m, i) => (
              <button
                key={m.url}
                type="button"
                onClick={() => onIndex(i)}
                aria-label={`Show ${m.name}`}
                aria-current={i === index ? "true" : undefined}
                className={cn("relative size-12 shrink-0 overflow-hidden rounded-md border", i === index ? "border-sun" : "border-white/10 opacity-70 hover:opacity-100")}
              >
                {m.type.startsWith("video/") ? (
                  <span className="flex size-full items-center justify-center bg-white/5 font-pixel text-[8px] text-slate-300">VID</span>
                ) : (
                  <SmartImage src={m.url} alt="" fill sizes="48px" className="object-cover" />
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
