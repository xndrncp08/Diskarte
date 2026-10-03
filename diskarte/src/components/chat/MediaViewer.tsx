"use client";

import { ExternalLink, Images } from "lucide-react";
import dynamic from "next/dynamic";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { FloatingWindow } from "@/components/ui/FloatingWindow";
import { WindowSkeleton } from "@/components/ui/WindowSkeleton";

const Gallery = dynamic(() => import("./MediaGallery").then((m) => m.Gallery), { ssr: false, loading: () => <WindowSkeleton label="Loading media" /> });

export interface MediaItem {
  url: string;
  name: string;
  /** MIME type: image/* or video/*. */
  type: string;
}

interface MediaViewerValue {
  openMedia: (items: MediaItem[], index: number) => void;
}

const MediaViewerContext = createContext<MediaViewerValue | null>(null);

/**
 * Hosts the media gallery window for the whole app shell. It sits above the chat's virtualised list,
 * so scrolling away from the message (which unmounts it) doesn't close the preview.
 */
export function MediaViewerProvider({ children }: { children: ReactNode }) {
  const [gallery, setGallery] = useState<{ items: MediaItem[]; index: number } | null>(null);
  const openMedia = useCallback((items: MediaItem[], index: number) => {
    if (items.length) setGallery({ items, index: Math.min(Math.max(index, 0), items.length - 1) });
  }, []);
  const value = useMemo(() => ({ openMedia }), [openMedia]);
  const current = gallery?.items[gallery.index];

  return (
    <MediaViewerContext.Provider value={value}>
      {children}
      <FloatingWindow
        id="media-viewer"
        open={gallery !== null}
        onClose={() => setGallery(null)}
        title={current ? current.name : "Media"}
        icon={<Images aria-hidden />}
        className="w-[min(60rem,calc(100vw-2rem))]"
        bodyClassName="flex flex-col"
        actions={
          current && (
            <a
              href={current.url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Open original in a new tab"
              title="Open original"
              className="flex size-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-white/10 hover:text-white pointer-coarse:size-11"
            >
              <ExternalLink className="size-4" aria-hidden />
            </a>
          )
        }
      >
        {gallery && <Gallery items={gallery.items} index={gallery.index} onIndex={(index) => setGallery({ ...gallery, index })} />}
      </FloatingWindow>
    </MediaViewerContext.Provider>
  );
}

/** Opens the media gallery; null outside the app shell (attachments then open in a new tab). */
export function useMediaViewer(): MediaViewerValue | null {
  return useContext(MediaViewerContext);
}
