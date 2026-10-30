"use client";

import { MotionConfig } from "framer-motion";
import { useEffect, type ReactNode } from "react";
import { MediaViewerProvider } from "@/components/chat/MediaViewer";
import type { AccountInfo } from "@/components/profile/AccountSettings";
import { SettingsDialogProvider } from "@/components/profile/SettingsDialog";
import { AccountPreferencesSync } from "@/components/profile/AccountPreferencesSync";
import { MeProvider } from "@/components/providers/MeProvider";
import { ClientDiagnostics } from "@/components/providers/ClientDiagnostics";
import { PushSession } from "@/components/notifications/PushSession";
import { PresenceProvider } from "@/components/providers/PresenceProvider";
import { SocialProvider } from "@/components/providers/SocialProvider";
import { AudioMixerProvider } from "@/components/voice/AudioMixer";
import { CallProvider } from "@/components/voice/CallProvider";
import { IncomingCallsProvider } from "@/components/voice/IncomingCalls";
import { SessionGuard } from "@/components/session/SessionGuard";
import { StatusExpiry } from "@/components/session/StatusExpiry";
import { readDisplayPrefs, useDisplayPrefs } from "@/lib/display-prefs";
import type { Tables } from "@/lib/supabase/database.types";

/**
 * Everything that must outlive a page: who I am, presence, friends/DMs, the LiveKit call, the
 * floating windows, incoming-call rings and the session guard. Mounted once by the signed-in root layout
 * (app/(app)/layout.tsx), which Next keeps mounted across every navigation inside the app — between
 * channels, servers, DMs and the full-page /settings — so none of them can drop an active call.
 */
export function SessionProviders({
  profile,
  account,
  verified = true,
  children,
}: {
  profile: Tables<"profiles">;
  account: AccountInfo;
  verified?: boolean;
  children: ReactNode;
}) {
  const display = useDisplayPrefs();
  // Settings → Chat / Accessibility, applied to the whole page (see globals.css).
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--chat-font-size", `${display.fontSize}px`);
    root.toggleAttribute("data-reduce-motion", display.reducedMotion === "on");
    root.toggleAttribute("data-underline-links", display.underlineLinks);
    root.toggleAttribute("data-reduce-transparency", display.reducedTransparency);
    root.toggleAttribute("data-high-contrast", display.highContrast);
  }, [display]);
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: light)");
    const apply = () => {
      const prefs = readDisplayPrefs();
      const mode = prefs.colorMode === "system" ? (media.matches ? "light" : "dark") : prefs.colorMode;
      document.documentElement.dataset.colorMode = mode;
      // The status bar / browser chrome follows a mode change without a reload (layout sets the first one).
      document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((meta) => {
        meta.removeAttribute("media");
        meta.content = mode === "light" ? "#f8fafc" : "#0F172A";
      });
      document.documentElement.lang = prefs.language;
    };
    apply(); media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [display.colorMode, display.language]);
  return (
    <MeProvider profile={profile} verified={verified}>
      <AccountPreferencesSync key={profile.id} userId={profile.id}>
      {/* Honour the OS "reduce motion" setting for every framer-motion animation in the app. */}
      <MotionConfig reducedMotion={display.reducedMotion === "on" ? "always" : "user"}>
        <PresenceProvider>
          <SocialProvider>
            <CallProvider>
              <SettingsDialogProvider account={account}>
                <AudioMixerProvider>
                  <MediaViewerProvider>
                    <IncomingCallsProvider>
                      {children}
                      {/* Device heartbeat + live enforcement of bans, revoked sessions and status overrides. */}
                      <SessionGuard />
                      <StatusExpiry />
                      <ClientDiagnostics />
                      <PushSession />
                    </IncomingCallsProvider>
                  </MediaViewerProvider>
                </AudioMixerProvider>
              </SettingsDialogProvider>
            </CallProvider>
          </SocialProvider>
        </PresenceProvider>
      </MotionConfig>
      </AccountPreferencesSync>
    </MeProvider>
  );
}
