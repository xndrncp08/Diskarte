import type { SupabaseClient } from "@supabase/supabase-js";

export const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const;
export const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

/** The only attachment types Diskarte accepts (mirrored by the DB trigger and bucket config). */
export const ATTACHMENT_TYPES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "audio/mpeg": "mp3",
  "video/mp4": "mp4",
} as const;
export type AttachmentMime = keyof typeof ATTACHMENT_TYPES;
export const ATTACHMENT_ACCEPT = Object.keys(ATTACHMENT_TYPES).join(",");

const EXT: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif" };

export function validateImage(file: File): string | null {
  if (!(IMAGE_TYPES as readonly string[]).includes(file.type)) return "Only PNG, JPG, WEBP or GIF images are allowed.";
  if (file.size > MAX_AVATAR_BYTES) return "Images can be up to 5 MB.";
  return null;
}

/** Upload an avatar/banner/server icon to the public `avatars` bucket and return its public URL. */
export async function uploadPublicImage(supabase: SupabaseClient, folder: string, kind: "avatar" | "banner" | "icon", file: File): Promise<string> {
  const problem = validateImage(file);
  if (problem) throw new Error(problem);
  const path = `${folder}/${kind}-${crypto.randomUUID()}.${EXT[file.type]}`;
  const { error } = await supabase.storage.from("avatars").upload(path, file, { contentType: file.type, cacheControl: "31536000", upsert: false });
  if (error) throw new Error("Couldn't upload the image. Try again.");
  return supabase.storage.from("avatars").getPublicUrl(path).data.publicUrl;
}

/** Sanitise a user-supplied filename for storage paths: keep it readable but path-safe. */
export function safeFileName(name: string): string {
  const cleaned = name
    .normalize("NFKD")
    .replace(/[^\w.\- ]+/g, "")
    .replace(/\s+/g, "-")
    .replace(/\.{2,}/g, ".")
    .replace(/^[.-]+/, "")
    .slice(-80);
  return cleaned || "file";
}

/** Read intrinsic image size so the chat can reserve layout space (no jump when it loads). */
export async function imageSize(file: File): Promise<{ width: number; height: number } | null> {
  if (!file.type.startsWith("image/") || typeof createImageBitmap === "undefined") return null;
  try {
    const bitmap = await createImageBitmap(file);
    const size = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return size;
  } catch {
    return null;
  }
}

export function isAllowedAttachmentType(type: string): type is AttachmentMime {
  return Object.prototype.hasOwnProperty.call(ATTACHMENT_TYPES, type);
}

export function validateAttachment(file: File): string | null {
  if (file.size === 0) return `${file.name}: the file is empty.`;
  if (file.size > MAX_ATTACHMENT_BYTES) return `${file.name}: files can be up to 10 MB.`;
  if (!isAllowedAttachmentType(file.type)) return `${file.name}: only JPG, PNG, WEBP, GIF, MP3 or MP4 files are allowed.`;
  return null;
}

/** Check the file's magic bytes match its declared MIME type (catches renamed executables/HTML). */
export function sniffMatches(type: AttachmentMime, head: Uint8Array): boolean {
  const at = (offset: number, ...bytes: number[]) => bytes.every((b, i) => head[offset + i] === b);
  const ascii = (offset: number, text: string) => at(offset, ...Array.from(text, (c) => c.charCodeAt(0)));
  switch (type) {
    case "image/jpeg":
      return at(0, 0xff, 0xd8, 0xff);
    case "image/png":
      return at(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
    case "image/gif":
      return ascii(0, "GIF87a") || ascii(0, "GIF89a");
    case "image/webp":
      return ascii(0, "RIFF") && ascii(8, "WEBP");
    case "audio/mpeg":
      return ascii(0, "ID3") || (head[0] === 0xff && (head[1] & 0xe0) === 0xe0);
    case "video/mp4":
      return ascii(4, "ftyp");
  }
}

async function readHead(file: File, bytes = 16): Promise<Uint8Array> {
  const blob = file.slice(0, bytes);
  if (typeof blob.arrayBuffer === "function") return new Uint8Array(await blob.arrayBuffer());
  return new Uint8Array(
    await new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(blob);
    }),
  );
}

/**
 * Upload a chat attachment to the private bucket as `<server>/<channel>/<user>/<uuid>.<ext>`.
 * The object name is fully random (the user's filename is only kept as display metadata), so
 * path traversal and "double extension" tricks are impossible.
 */
export async function uploadAttachment(
  supabase: SupabaseClient,
  opts: { serverId: string; channelId: string; userId: string; file: File },
): Promise<{ path: string; name: string; size: number; type: AttachmentMime; width?: number; height?: number }> {
  const problem = validateAttachment(opts.file);
  if (problem) throw new Error(problem);
  const type = opts.file.type as AttachmentMime;
  if (!sniffMatches(type, await readHead(opts.file))) throw new Error(`${opts.file.name}: the contents don't match the file type.`);
  const path = `${opts.serverId}/${opts.channelId}/${opts.userId}/${crypto.randomUUID()}.${ATTACHMENT_TYPES[type]}`;
  const { error } = await supabase.storage.from("attachments").upload(path, opts.file, { contentType: type, upsert: false, cacheControl: "3600" });
  if (error) throw new Error(`${opts.file.name}: upload failed.`);
  const size = await imageSize(opts.file);
  return { path, name: safeFileName(opts.file.name).slice(0, 120), size: opts.file.size, type, ...(size ?? {}) };
}
