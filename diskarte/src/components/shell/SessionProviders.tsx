"use client";

import { MotionConfig } from "framer-motion";
import type { ReactNode } from "react";
import { MediaViewerProvider } from "@/components/chat/MediaViewer";
import type { AccountInfo } from "@/components/profile/AccountSettings";
import { SettingsDialogProvider } from "@/components/profile/SettingsDialog";
import { MeProvider } from "@/components/providers/MeProvider";
import { PresenceProvider } from "@/components/providers/PresenceProvider";
import { SocialProvider } from "@/components/providers/SocialProvider";
import { AudioMixerProvider } from "@/components/voice/AudioMixer";
import { CallProvider } from "@/components/voice/CallProvider";
import { FloatingCallHUD } from "@/components/voice/FloatingCallHUD";
import { IncomingCallsProvider } from "@/components/voice/IncomingCalls";
import type { Tables } from "@/lib/supabase/database.types";

/**
 * Everything that must outlive a page: who I am, presence, friends/DMs, the LiveKit call, the
 * floating windows and incoming-call rings. Mounted once by the signed-in root layout
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
  return (
    <MeProvider profile={profile} verified={verified}>
      {/* Honour the OS "reduce motion" setting for every framer-motion animation in the app. */}
      <MotionConfig reducedMotion="user">
        <PresenceProvider>
          <SocialProvider>
            <CallProvider>
              <SettingsDialogProvider account={account}>
                <AudioMixerProvider>
                  <MediaViewerProvider>
                    <IncomingCallsProvider>
                      {children}
                      {/* Picture-in-picture of the call on any page other than the call's own. */}
                      <FloatingCallHUD />
                    </IncomingCallsProvider>
                  </MediaViewerProvider>
                </AudioMixerProvider>
              </SettingsDialogProvider>
            </CallProvider>
          </SocialProvider>
        </PresenceProvider>
      </MotionConfig>
    </MeProvider>
  );
}
