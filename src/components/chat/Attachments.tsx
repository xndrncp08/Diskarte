"use client";

import { Music } from "lucide-react";
import { SmartImage } from "@/components/ui/SmartImage";
import { useSignedUrls } from "@/hooks/useSignedUrls";
import { isAudioAttachment, isImageAttachment, isVideoAttachment, type Attachment } from "@/lib/messages";
import { formatBytes } from "@/lib/utils";

/** Renders allow-listed attachments from short-lived signed URLs (private bucket). */
export function Attachments({ attachments }: { attachments: Attachment[] }) {
  const urls = useSignedUrls(attachments.map((a) => a.path));
  if (attachments.length === 0) return null;
  const images = attachments.filter(isImageAttachment);
  const videos = attachments.filter(isVideoAttachment);
  const audio = attachments.filter(isAudioAttachment);

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
                className="relative block overflow-hidden rounded-lg border border-white/10 bg-black/30"
                style={{ width, aspectRatio: ratio, maxHeight: 360 }}
              >
                {urls[a.path] ? (
                  <SmartImage src={urls[a.path]} alt={a.name} fill sizes="(max-width: 640px) 90vw, 360px" className="object-cover" />
                ) : (
                  <span className="block size-full animate-pulse bg-white/5" aria-label={`Loading ${a.name}`} />
                )}
              </a>
            );
          })}
        </div>
      )}
      {videos.map((a) => (
        <div key={a.path} className="max-w-xl overflow-hidden rounded-lg border border-white/10 bg-black">
          {urls[a.path] ? (
            <video src={urls[a.path]} controls preload="metadata" playsInline className="max-h-96 w-full" aria-label={a.name} />
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
