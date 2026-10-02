"use client";

import { useActionState, useEffect, useRef, useState, type ChangeEvent } from "react";
import { ImagePlus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { updateProfileAction, type ProfileFormState } from "@/actions/profile";
import { useSupabase } from "@/components/providers/RuntimeConfig";
import { PixelStatus } from "@/components/retro/PixelStatus";
import { Button } from "@/components/ui/Button";
import { InputField, TextareaField } from "@/components/ui/Field";
import {
  AVATAR_PRESETS,
  AVATAR_PRESET_KEYS,
  BANNER_PRESETS,
  BANNER_PRESET_KEYS,
  PRESENCE_OPTIONS,
  STATUS_TRIGGERS,
  type AvatarPreset,
  type BannerPreset,
} from "@/lib/profile";
import type { PresenceStatus, Tables } from "@/lib/supabase/database.types";
import { uploadPublicImage } from "@/lib/uploads";
import { cn } from "@/lib/utils";
import { ProfileCard } from "./ProfileCard";
import { SalakotAvatar } from "./SalakotAvatar";

type Profile = Tables<"profiles">;

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-3 font-pixel text-[10px] leading-relaxed text-sun">{children}</h2>;
}

export function ProfileBuilder({ profile, mode }: { profile: Profile; mode: "onboarding" | "settings" }) {
  const supabase = useSupabase();
  const [state, action, pending] = useActionState<ProfileFormState, FormData>(updateProfileAction, {});

  const [displayName, setDisplayName] = useState(profile.display_name);
  const [username, setUsername] = useState(profile.username);
  const [bio, setBio] = useState(profile.bio);
  const [avatarPreset, setAvatarPreset] = useState<AvatarPreset>((profile.avatar_preset in AVATAR_PRESETS ? profile.avatar_preset : "araw") as AvatarPreset);
  const [bannerPreset, setBannerPreset] = useState<BannerPreset>((profile.banner_preset in BANNER_PRESETS ? profile.banner_preset : "paglubog") as BannerPreset);
  const [avatarUrl, setAvatarUrl] = useState(profile.avatar_url ?? "");
  const [bannerUrl, setBannerUrl] = useState(profile.banner_url ?? "");
  const [status, setStatus] = useState<PresenceStatus>(profile.status);
  const [customStatus, setCustomStatus] = useState(profile.custom_status ?? "");
  const [customEmoji, setCustomEmoji] = useState(profile.custom_status_emoji ?? "");
  const [uploading, setUploading] = useState<"avatar" | "banner" | null>(null);
  const avatarInput = useRef<HTMLInputElement>(null);
  const bannerInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (state.ok) toast.success("Profile saved! 🎉");
    else if (state.error) toast.error(state.error);
  }, [state]);

  async function handleUpload(kind: "avatar" | "banner", event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setUploading(kind);
    try {
      const url = await uploadPublicImage(supabase, profile.id, kind, file);
      if (kind === "avatar") setAvatarUrl(url);
      else setBannerUrl(url);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(null);
    }
  }

  const preview = {
    username: username.trim().toLowerCase() || profile.username,
    display_name: displayName.trim() || "Kabayan",
    avatar_url: avatarUrl || null,
    avatar_preset: avatarPreset,
    banner_url: bannerUrl || null,
    banner_preset: bannerPreset,
    bio,
    status,
    custom_status: customStatus || null,
    custom_status_emoji: customEmoji || null,
  };

  return (
    <form action={action} className="grid gap-8 lg:grid-cols-[1fr_18rem]" data-testid="profile-builder">
      {mode === "onboarding" && <input type="hidden" name="redirectTo" value="/tambayan" />}
      <input type="hidden" name="avatarPreset" value={avatarPreset} />
      <input type="hidden" name="bannerPreset" value={bannerPreset} />
      <input type="hidden" name="avatarUrl" value={avatarUrl} />
      <input type="hidden" name="bannerUrl" value={bannerUrl} />
      <input type="hidden" name="status" value={status} />

      <div className="space-y-8">
        <section>
          <SectionTitle>1 · IKAW &apos;TO</SectionTitle>
          <div className="grid gap-4 sm:grid-cols-2">
            <InputField
              label="Display name"
              name="displayName"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={32}
              required
              error={state.fieldErrors?.displayName}
            />
            <InputField
              label="Username"
              name="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              maxLength={32}
              required
              error={state.fieldErrors?.username}
              hint="Lowercase, numbers, _ at ."
            />
          </div>
        </section>

        <section>
          <SectionTitle>2 · SALAKOT AVATAR</SectionTitle>
          <div role="radiogroup" aria-label="Avatar preset" className="flex flex-wrap gap-3">
            {AVATAR_PRESET_KEYS.map((key) => (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={!avatarUrl && avatarPreset === key}
                aria-label={AVATAR_PRESETS[key].label}
                title={AVATAR_PRESETS[key].label}
                onClick={() => {
                  setAvatarPreset(key);
                  setAvatarUrl("");
                }}
                className={cn(
                  "rounded-full p-0.5 transition-transform hover:scale-105",
                  !avatarUrl && avatarPreset === key ? "ring-2 ring-sun ring-offset-2 ring-offset-abyss" : "opacity-80 hover:opacity-100",
                )}
              >
                <SalakotAvatar preset={key} size={52} />
              </button>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <input ref={avatarInput} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="sr-only" onChange={(e) => handleUpload("avatar", e)} aria-label="Upload avatar image" />
            <Button variant="secondary" size="sm" onClick={() => avatarInput.current?.click()} loading={uploading === "avatar"}>
              <ImagePlus className="size-4" aria-hidden /> Upload photo
            </Button>
            {avatarUrl && (
              <Button variant="ghost" size="sm" onClick={() => setAvatarUrl("")}>
                <Trash2 className="size-4" aria-hidden /> Gamitin ang salakot avatar
              </Button>
            )}
          </div>
          {state.fieldErrors?.avatarUrl && <p className="mt-2 text-xs text-red-300">{state.fieldErrors.avatarUrl}</p>}
        </section>

        <section>
          <SectionTitle>3 · BANNER</SectionTitle>
          <div role="radiogroup" aria-label="Banner preset" className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {BANNER_PRESET_KEYS.map((key) => (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={!bannerUrl && bannerPreset === key}
                onClick={() => {
                  setBannerPreset(key);
                  setBannerUrl("");
                }}
                className={cn(
                  "h-14 rounded-lg border text-left text-[11px] font-semibold text-white/90 transition-transform hover:scale-[1.02]",
                  !bannerUrl && bannerPreset === key ? "border-sun ring-2 ring-sun/40" : "border-white/10",
                )}
                style={{ background: BANNER_PRESETS[key].css }}
              >
                <span className="m-1.5 inline-block rounded bg-black/50 px-1.5 py-0.5">{BANNER_PRESETS[key].label}</span>
              </button>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <input ref={bannerInput} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="sr-only" onChange={(e) => handleUpload("banner", e)} aria-label="Upload banner image" />
            <Button variant="secondary" size="sm" onClick={() => bannerInput.current?.click()} loading={uploading === "banner"}>
              <ImagePlus className="size-4" aria-hidden /> Upload banner
            </Button>
            {bannerUrl && (
              <Button variant="ghost" size="sm" onClick={() => setBannerUrl("")}>
                <Trash2 className="size-4" aria-hidden /> Alisin ang custom banner
              </Button>
            )}
          </div>
        </section>

        <section>
          <SectionTitle>4 · STATUS</SectionTitle>
          <div role="radiogroup" aria-label="Presence" className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {PRESENCE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                role="radio"
                aria-checked={status === opt.value}
                onClick={() => setStatus(opt.value)}
                className={cn(
                  "flex items-center gap-2 rounded-lg border px-3 py-2 text-left transition-colors",
                  status === opt.value ? "border-sun/60 bg-sun/10" : "border-white/10 bg-white/5 hover:bg-white/10",
                )}
              >
                <PixelStatus status={opt.value} size={12} />
                <span>
                  <span className="block text-sm font-semibold text-white">{opt.label}</span>
                  <span className="block text-[11px] text-slate-400">{opt.hint}</span>
                </span>
              </button>
            ))}
          </div>
          <p className="mb-2 font-silk text-[11px] uppercase tracking-wider text-slate-300">Pinoy status triggers</p>
          <div className="mb-4 flex flex-wrap gap-2">
            {STATUS_TRIGGERS.map((t) => {
              const active = customStatus === t.text && customEmoji === t.emoji;
              return (
                <button
                  key={t.text}
                  type="button"
                  aria-pressed={active}
                  onClick={() => {
                    if (active) {
                      setCustomStatus("");
                      setCustomEmoji("");
                    } else {
                      setCustomStatus(t.text);
                      setCustomEmoji(t.emoji);
                    }
                  }}
                  className={cn(
                    "rounded-full border px-3 py-1 text-sm transition-colors",
                    active ? "border-sun bg-sun text-abyss" : "border-white/10 bg-white/5 text-slate-200 hover:bg-white/10",
                  )}
                >
                  {t.emoji} {t.text}
                </button>
              );
            })}
          </div>
          <div className="grid gap-4 sm:grid-cols-[6rem_1fr]">
            <InputField label="Emoji" name="customStatusEmoji" value={customEmoji} onChange={(e) => setCustomEmoji(e.target.value)} maxLength={16} placeholder="🍜" />
            <InputField
              label="Custom status"
              name="customStatus"
              value={customStatus}
              onChange={(e) => setCustomStatus(e.target.value)}
              maxLength={64}
              placeholder="Anong ganap?"
              error={state.fieldErrors?.customStatus}
            />
          </div>
        </section>

        <section>
          <SectionTitle>5 · ABOUT ME</SectionTitle>
          <TextareaField
            label="Bio"
            name="bio"
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            maxLength={190}
            rows={3}
            hint={`${bio.length}/190`}
            error={state.fieldErrors?.bio}
            placeholder="Jett main. Always packing Skyflakes."
          />
        </section>

        <div className="flex items-center gap-3">
          <Button type="submit" size="lg" loading={pending} disabled={uploading !== null}>
            {mode === "onboarding" ? "Let's go!" : "Save profile"}
          </Button>
          {state.error && (
            <p role="alert" className="text-sm text-red-300">
              {state.error}
            </p>
          )}
        </div>
      </div>

      <aside className="lg:sticky lg:top-6 lg:self-start">
        <p className="mb-2 font-silk text-[11px] uppercase tracking-wider text-slate-400">Preview</p>
        <ProfileCard profile={preview} />
      </aside>
    </form>
  );
}
