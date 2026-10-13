"use client";

import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Popover } from "@/components/ui/Popover";
import type { Gif } from "@/lib/gifs";
import { cn } from "@/lib/utils";

async function searchGifs(q: string, offset: number): Promise<{ gifs: Gif[]; next: number | null } | "unavailable"> {
  const res = await fetch(`/api/gifs?${new URLSearchParams({ q, offset: String(offset) })}`, { credentials: "same-origin" }).catch(() => null);
  if (!res || res.status === 503) return "unavailable";
  if (!res.ok) return { gifs: [], next: null };
  return res.json();
}

function GifResults({ onPick }: { onPick: (gif: Gif) => void }) {
  const [query, setQuery] = useState("");
  const [gifs, setGifs] = useState<Gif[]>([]);
  const [next, setNext] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);

  // Trending first; searching waits for a pause in typing.
  useEffect(() => {
    let live = true;
    const t = setTimeout(
      () =>
        void searchGifs(query.trim(), 0).then((r) => {
          if (!live) return;
          setLoading(false);
          if (r === "unavailable") return setUnavailable(true);
          setGifs(r.gifs);
          setNext(r.next);
        }),
      query ? 350 : 0,
    );
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [query]);

  async function more() {
    if (next === null) return;
    setLoading(true);
    const r = await searchGifs(query.trim(), next);
    setLoading(false);
    if (r === "unavailable") return;
    setGifs((g) => [...g, ...r.gifs.filter((x) => !g.some((y) => y.id === x.id))]);
    setNext(r.next);
  }

  if (unavailable) return <p className="py-8 text-center text-sm text-slate-400">GIF search isn&apos;t set up on this server yet.</p>;
  return (
    <>
      <input
        type="search"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setLoading(true);
        }}
        placeholder="Search GIPHY"
        aria-label="Search GIFs"
        autoFocus
        className="mb-2 h-9 w-full rounded-md border border-white/10 bg-black/40 px-2 text-sm text-white outline-none focus:border-sun/60 pointer-coarse:h-11 pointer-coarse:text-base"
      />
      <div className="scrollbar-thin grid max-h-80 grid-cols-2 gap-1.5 overflow-y-auto overscroll-contain" data-testid="gif-results">
        {gifs.map((g) => (
          <button key={g.id} type="button" onClick={() => onPick(g)} aria-label={g.title || "GIF"} title={g.title} className="overflow-hidden rounded-md bg-white/5 transition-transform hover:scale-[1.02] focus-visible:ring-2 focus-visible:ring-sun">
            {/* eslint-disable-next-line @next/next/no-img-element -- GIPHY's CDN serves the animated preview */}
            <img src={g.preview} alt="" loading="lazy" width={g.width} height={g.height} className="h-auto w-full" />
          </button>
        ))}
        {!loading && gifs.length === 0 && <p className="col-span-2 py-6 text-center text-sm text-slate-400">No GIFs found.</p>}
        {loading && <Loader2 className="col-span-2 mx-auto my-4 size-5 animate-spin text-slate-500" aria-label="Loading GIFs" />}
        {!loading && next !== null && (
          <button type="button" onClick={() => void more()} className="col-span-2 rounded-md py-2 text-sm font-semibold text-sun hover:bg-white/5">
            More GIFs
          </button>
        )}
      </div>
      <p className="mt-1.5 text-right text-[10px] uppercase tracking-wide text-slate-500">Powered by GIPHY</p>
    </>
  );
}

/** Composer button → GIPHY search. Picking a GIF sends it right away. */
export function GifPicker({ onPick, disabled = false }: { onPick: (url: string) => void; disabled?: boolean }) {
  return (
    <Popover
      label="GIFs"
      testId="gif-picker"
      className="w-80"
      trigger={({ toggle, ref, open, ...aria }) => (
        <button
          ref={ref}
          type="button"
          aria-label="Send a GIF"
          disabled={disabled}
          onClick={toggle}
          {...aria}
          className={cn(
            "touch-target relative rounded-md px-1.5 py-1 text-[11px] font-black tracking-tight transition-colors hover:bg-white/10 hover:text-white disabled:opacity-30 pointer-coarse:p-3",
            open ? "text-sun" : "text-slate-400",
          )}
        >
          <span className="rounded border-2 border-current px-0.5 leading-none">GIF</span>
        </button>
      )}
    >
      {(close) => (
        <GifResults
          onPick={(gif) => {
            onPick(gif.url);
            close();
          }}
        />
      )}
    </Popover>
  );
}
