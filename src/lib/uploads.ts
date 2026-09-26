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
