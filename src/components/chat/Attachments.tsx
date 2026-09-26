"use client";

import { Download, FileText } from "lucide-react";
import { useSignedUrls } from "@/hooks/useSignedUrls";
import { isImageAttachment, type Attachment } from "@/lib/messages";
import { formatBytes } from "@/lib/utils";

export function Attachments({ attachments }: { attachments: Attachment[] }) {
  const urls = useSignedUrls(attachments.map((a) => a.path));
  if (attachments.length === 0) return null;
  const images = attachments.filter(isImageAttachment);
  const files = attachments.filter((a) => !isImageAttachment(a));

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
                className="block overflow-hidden rounded-lg border border-white/10 bg-black/30"
                style={{ width, aspectRatio: ratio, maxHeight: 360 }}
              >
                {urls[a.path] ? (
                  // Signed, short-lived Storage URLs: skip next/image (no caching/optimising private files).
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={urls[a.path]} alt={a.name} loading="lazy" className="size-full object-cover" />
                ) : (
                  <span className="block size-full animate-pulse bg-white/5" aria-label={`Loading ${a.name}`} />
                )}
              </a>
            );
          })}
        </div>
      )}
      {files.map((a) => (
        <div key={a.path} className="flex max-w-sm items-center gap-3 rounded-lg border border-white/10 bg-black/30 px-3 py-2">
          <FileText className="size-8 shrink-0 text-sky-300" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-sky-200">{a.name}</p>
            <p className="text-xs text-slate-500">{formatBytes(a.size)}</p>
          </div>
          {urls[a.path] && (
            <a href={urls[a.path]} target="_blank" rel="noopener noreferrer" aria-label={`Download ${a.name}`} className="rounded-md p-1.5 text-slate-300 hover:bg-white/10 hover:text-white">
              <Download className="size-4" aria-hidden />
            </a>
          )}
        </div>
      ))}
    </div>
  );
}
