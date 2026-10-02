"use client";

import { Maximize2, Music, Play } from "lucide-react";
import { useState, type MouseEvent } from "react";
import { useMediaViewer, type MediaItem } from "@/components/chat/MediaViewer";
import { SmartImage } from "@/components/ui/SmartImage";
import { useLowData } from "@/hooks/useLowData";
import { useSignedUrls } from "@/hooks/useSignedUrls";
import { imageQuality } from "@/lib/low-data";
import { isAudioAttachment, isImageAttachment, isVideoAttachment, type Attachment } from "@/lib/messages";
import { formatBytes } from "@/lib/utils";

/** Renders allow-listed attachments from short-lived signed URLs (private bucket). */
export function Attachments({ attachments }: { attachments: Attachment[] }) {
  const lowData = useLowData();
  // Low-data mode: GIFs (often several MB) only download once tapped.
  const [revealed, setRevealed] = useState<Set<string>>(() => new Set());
  const urls = useSignedUrls(attachments.map((a) => a.path));
  const viewer = useMediaViewer();
  if (attachments.length === 0) return null;
  const images = attachments.filter(isImageAttachment);
  const videos = attachments.filter(isVideoAttachment);
  const audio = attachments.filter(isAudioAttachment);
  // Images and videos of this message form one gallery in the media viewer window.
  const gallery: (MediaItem & { path: string })[] = [...images, ...videos]
    .filter((a) => urls[a.path])
    .map((a) => ({ path: a.path, url: urls[a.path], name: a.name, type: a.type }));
  const open = (path: string, e?: MouseEvent) => {
    // New-tab clicks, and contexts without the app shell, keep the plain link behaviour.
    if (!viewer || (e && (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0))) return;
    const index = gallery.findIndex((g) => g.path === path);
    if (index < 0) return;
    e?.preventDefault();
    viewer.openMedia(gallery, index);
  };

  return (
    <div className="mt-1 space-y-1.5" data-testid="attachments">
      {images.length > 0 && (
        <div className="flex max-w-xl flex-wrap gap-1.5">
          {images.map((a) => {
            const ratio = a.width && a.height ? a.width / a.height : 4 / 3;
            const width = Math.min(360, a.width ?? 360);
            return (
              <a
                key={a.path}
                href={urls[a.path]}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => open(a.path, e)}
                aria-label={`Open ${a.name}`}
                className="relative block overflow-hidden rounded-lg border border-white/10 bg-black/30"
                style={{ width, aspectRatio: ratio, maxHeight: 360 }}
              >
                {lowData && a.type === "image/gif" && !revealed.has(a.path) ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      setRevealed((prev) => new Set(prev).add(a.path));
                    }}
                    className="scanlines flex size-full flex-col items-center justify-center gap-1 text-slate-300 hover:text-white"
                    aria-label={`Play GIF ${a.name} (${formatBytes(a.size)})`}
                    data-testid="gif-placeholder"
                  >
                    <Play className="size-8" aria-hidden />
                    <span className="font-pixel text-[9px]">GIF · {formatBytes(a.size)}</span>
                  </button>
                ) : urls[a.path] ? (
                  <SmartImage src={urls[a.path]} alt={a.name} fill sizes={lowData ? "240px" : "(max-width: 640px) 90vw, 360px"} quality={imageQuality(lowData)} className="object-cover" />
                ) : (
                  <span className="block size-full animate-pulse bg-white/5" aria-label={`Loading ${a.name}`} />
                )}
              </a>
            );
          })}
        </div>
      )}
      {videos.map((a) => (
        <div key={a.path} className="relative max-w-xl overflow-hidden rounded-lg border border-white/10 bg-black">
          {urls[a.path] && viewer && (
            <button
              type="button"
              onClick={() => open(a.path)}
              aria-label={`Expand ${a.name}`}
              className="absolute right-2 top-2 z-10 flex size-8 items-center justify-center rounded-md bg-black/60 text-white backdrop-blur hover:bg-black/80 pointer-coarse:size-11"
            >
              <Maximize2 className="size-4" aria-hidden />
            </button>
          )}
          {urls[a.path] ? (
            <video src={urls[a.path]} controls preload={lowData ? "none" : "metadata"} playsInline className="max-h-96 w-full" aria-label={a.name} />
          ) : (
            <span className="block aspect-video w-full animate-pulse bg-white/5" aria-label={`Loading ${a.name}`} />
          )}
        </div>
      ))}
      {audio.map((a) => (
        <div key={a.path} className="flex max-w-sm flex-col gap-2 rounded-lg border border-white/10 bg-black/30 px-3 py-2">
          <div className="flex items-center gap-2">
            <Music className="size-5 shrink-0 text-sun" aria-hidden />
            <p className="min-w-0 flex-1 truncate text-sm font-medium text-slate-200">{a.name}</p>
            <span className="text-xs text-slate-500">{formatBytes(a.size)}</span>
          </div>
          {urls[a.path] && <audio src={urls[a.path]} controls preload="none" className="w-full" aria-label={a.name} />}
        </div>
      ))}
    </div>
  );
}
