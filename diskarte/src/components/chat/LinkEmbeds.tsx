"use client";

import { memo, useEffect, useState } from "react";
import { useLowData } from "@/hooks/useLowData";
import { useDisplayPrefs } from "@/lib/display-prefs";
import { isGiphyMedia } from "@/lib/gifs";
import { extractLinks, type LinkPreview } from "@/lib/unfurl";

// One request per link per page load, shared by every message that shows it.
const previews = new Map<string, Promise<LinkPreview | null>>();
function loadPreview(url: string) {
  let p = previews.get(url);
  if (!p) {
    p = fetch(`/api/unfurl?${new URLSearchParams({ url })}`, { credentials: "same-origin" })
      .then((r) => (r.ok ? (r.json() as Promise<{ preview: LinkPreview | null }>) : { preview: null }))
      .then((r) => r.preview)
      .catch(() => null);
    previews.set(url, p);
  }
  return p;
}

function Embed({ url }: { url: string }) {
  const lowData = useLowData();
  const [preview, setPreview] = useState<LinkPreview | null>(null);
  useEffect(() => {
    let live = true;
    void loadPreview(url).then((p) => live && setPreview(p));
    return () => {
      live = false;
    };
  }, [url]);
  if (!preview) return null;
  const imageOnly = !preview.title && !preview.description;
  return (
    <article className="mt-1.5 max-w-md overflow-hidden rounded-lg border-l-4 border-white/20 bg-black/30 p-3" style={preview.color ? { borderLeftColor: preview.color } : undefined} data-testid="link-embed">
      {!imageOnly && (
        <>
          {preview.siteName && <p className="mb-0.5 truncate text-xs text-slate-400">{preview.siteName}</p>}
          {preview.title && (
            <a href={preview.url} target="_blank" rel="noopener noreferrer nofollow ugc" className="line-clamp-2 text-sm font-semibold text-sky-300 hover:underline">
              {preview.title}
            </a>
          )}
          {preview.description && <p className="mt-1 line-clamp-3 text-sm text-slate-300">{preview.description}</p>}
        </>
      )}
      {preview.image && !lowData && (
        <a href={preview.url} target="_blank" rel="noopener noreferrer nofollow ugc" className="mt-2 block" tabIndex={imageOnly ? 0 : -1} aria-label={imageOnly ? "Open image" : undefined}>
          {/* eslint-disable-next-line @next/next/no-img-element -- same-origin proxied preview image of unknown size */}
          <img src={preview.image} alt="" loading="lazy" className="max-h-72 w-auto max-w-full rounded-md object-contain" />
        </a>
      )}
    </article>
  );
}

/** Discord-style previews for the first few links in a message (Settings → Chat can turn them off). */
export const LinkEmbeds = memo(function LinkEmbeds({ content }: { content: string }) {
  const { embeds } = useDisplayPrefs();
  if (!embeds || !content.includes("http")) return null;
  return extractLinks(content).map((url) =>
    isGiphyMedia(url) ? (
      // GIPHY files show straight from GIPHY's CDN (allowed by the CSP), no preview fetch.
      // eslint-disable-next-line @next/next/no-img-element -- animated GIF of unknown size
      <img key={url} src={url} alt="GIF" loading="lazy" className="mt-1.5 block max-h-72 max-w-xs rounded-lg" data-testid="gif-embed" />
    ) : (
      <Embed key={url} url={url} />
    ),
  );
});
