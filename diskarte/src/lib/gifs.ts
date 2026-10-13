/** GIF search (GIPHY): what /api/gifs returns, and recognising a GIPHY media link in a message. */
export interface Gif {
  id: string;
  title: string;
  /** Small animated preview for the picker grid. */
  preview: string;
  width: number;
  height: number;
  /** What gets sent: GIPHY's "downsized" rendition (under 2 MB). */
  url: string;
}

const GIPHY_MEDIA_HOST = /^(media\d?|i)\.giphy\.com$/;

/** A direct GIPHY media file (shown inline from GIPHY's CDN, no preview fetch). */
export function isGiphyMedia(link: string) {
  try {
    const url = new URL(link);
    return url.protocol === "https:" && GIPHY_MEDIA_HOST.test(url.hostname) && /\.(gif|webp)$/.test(url.pathname);
  } catch {
    return false;
  }
}

/** The message is only a GIF link: show the GIF, not the URL (like Discord). */
export function isGifOnlyMessage(content: string) {
  const text = content.trim();
  return !/\s/.test(text) && isGiphyMedia(text);
}
