import type { SupabaseClient } from "@supabase/supabase-js";

export const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const;
export const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

const EXT: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif" };

export function validateImage(file: File): string | null {
  if (!(IMAGE_TYPES as readonly string[]).includes(file.type)) return "PNG, JPG, WEBP o GIF lang ang pwede.";
  if (file.size > MAX_AVATAR_BYTES) return "Hanggang 5 MB lang ang image.";
  return null;
}

/** Upload an avatar/banner/server icon to the public `avatars` bucket and return its public URL. */
export async function uploadPublicImage(supabase: SupabaseClient, folder: string, kind: "avatar" | "banner" | "icon", file: File): Promise<string> {
  const problem = validateImage(file);
  if (problem) throw new Error(problem);
  const path = `${folder}/${kind}-${crypto.randomUUID()}.${EXT[file.type]}`;
  const { error } = await supabase.storage.from("avatars").upload(path, file, { contentType: file.type, cacheControl: "31536000", upsert: false });
  if (error) throw new Error("Hindi na-upload ang image. Subukan ulit.");
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

export const BLOCKED_ATTACHMENT_TYPES = ["text/html", "image/svg+xml", "application/xhtml+xml", "application/javascript", "text/javascript"];

export function validateAttachment(file: File): string | null {
  if (file.size === 0) return `${file.name}: walang laman ang file.`;
  if (file.size > MAX_ATTACHMENT_BYTES) return `${file.name}: hanggang 25 MB lang bawat file.`;
  if (BLOCKED_ATTACHMENT_TYPES.includes(file.type)) return `${file.name}: hindi pwedeng i-upload ang ganitong file.`;
  return null;
}

/** Upload a chat attachment into `<server>/<channel>/<user>/<uuid>-<name>` in the private bucket. */
export async function uploadAttachment(
  supabase: SupabaseClient,
  opts: { serverId: string; channelId: string; userId: string; file: File },
): Promise<{ path: string; name: string; size: number; type: string; width?: number; height?: number }> {
  const problem = validateAttachment(opts.file);
  if (problem) throw new Error(problem);
  const name = safeFileName(opts.file.name);
  const path = `${opts.serverId}/${opts.channelId}/${opts.userId}/${crypto.randomUUID()}-${name}`;
  const type = opts.file.type || "application/octet-stream";
  const { error } = await supabase.storage.from("attachments").upload(path, opts.file, { contentType: type, upsert: false });
  if (error) throw new Error(`${opts.file.name}: hindi na-upload.`);
  const size = await imageSize(opts.file);
  return { path, name: opts.file.name.slice(0, 120), size: opts.file.size, type, ...(size ?? {}) };
}
