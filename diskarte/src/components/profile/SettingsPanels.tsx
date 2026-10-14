"use client";

import { useId, useRef, type KeyboardEvent } from "react";
import { useMe } from "@/components/providers/MeProvider";
import { AccountSettings, type AccountInfo } from "@/components/profile/AccountSettings";
import { ProfileBuilder } from "@/components/profile/ProfileBuilder";
import { ReportProblemForm } from "@/components/profile/ReportProblemForm";
import { SignOutButton } from "@/components/profile/SignOutButton";
import { VoiceSettings } from "@/components/profile/VoiceSettings";
import { LowDataToggle } from "@/components/profile/LowDataToggle";
import { NotificationSettings } from "@/components/profile/NotificationSettings";
import { AccessibilitySettings, ChatSettings } from "@/components/profile/DisplaySettings";
import { PrivacySettings } from "@/components/profile/PrivacySettings";
import { SoundSettings } from "@/components/profile/SoundSettings";
import { ThemePicker } from "@/components/profile/ThemePicker";
import { PwaSettings } from "@/components/profile/PwaSettings";
import { cn } from "@/lib/utils";
import type { SettingsTab } from "./SettingsDialog";

const TABS: { id: SettingsTab; label: string }[] = [
  { id: "profile", label: "My Profile" },
  { id: "account", label: "Account & Sessions" },
  { id: "privacy", label: "Privacy & Safety" },
  { id: "appearance", label: "Appearance" },
  { id: "accessibility", label: "Accessibility" },
  { id: "voice", label: "Voice & Video" },
  { id: "chat", label: "Chat" },
  { id: "notifications", label: "Notifications" },
  { id: "advanced", label: "Advanced" },
  { id: "report", label: "Report a problem" },
];

/** The Settings window's body; loaded on first open so the profile builder and account forms stay out of the initial bundle. */
export function SettingsPanels({ account, tab, onTab }: { account: AccountInfo; tab: SettingsTab; onTab: (tab: SettingsTab) => void }) {
  const { me } = useMe();
  const id = useId();
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const step = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[event.key];
    const index = TABS.findIndex((t) => t.id === tab);
    const nextIndex = step ? (index + step + TABS.length) % TABS.length : event.key === "Home" ? 0 : event.key === "End" ? TABS.length - 1 : null;
    if (nextIndex === null) return;
    event.preventDefault();
    onTab(TABS[nextIndex].id);
    tabs.current[nextIndex]?.focus();
  }

  return (
    <div className="flex min-h-full flex-col md:h-full md:flex-row">
      <div className="flex shrink-0 flex-col border-b border-white/5 px-4 pb-3 pt-5 md:w-48 md:border-b-0 md:border-r md:bg-black/20 md:px-3 md:py-8">
        <div role="tablist" aria-label="User settings" onKeyDown={onKeyDown} className="scrollbar-none flex gap-2 overflow-x-auto pr-10 md:flex-col md:gap-1 md:overflow-visible md:pr-0">
          {TABS.map((t, i) => (
            <button
              key={t.id}
              ref={(el) => {
                tabs.current[i] = el;
              }}
              type="button"
              role="tab"
              id={`${id}-${t.id}-tab`}
              aria-selected={tab === t.id}
              aria-controls={`${id}-${t.id}-panel`}
              tabIndex={tab === t.id ? 0 : -1}
              data-autofocus={tab === t.id ? "" : undefined}
              onClick={() => onTab(t.id)}
              className={cn(
                "block shrink-0 whitespace-nowrap rounded-md px-3 py-1.5 text-left text-sm font-medium transition-colors pointer-coarse:min-h-11",
                tab === t.id ? "bg-white/10 text-white" : "text-slate-400 hover:bg-white/5 hover:text-slate-200",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="mt-3 md:mt-auto md:pt-6">
          <SignOutButton className="w-full" />
        </div>
      </div>
      <div role="tabpanel" id={`${id}-${tab}-panel`} aria-labelledby={`${id}-${tab}-tab`} className="scrollbar-thin min-w-0 flex-1 px-4 py-6 sm:px-8 md:overflow-y-auto md:py-8">
        {tab === "profile" ? (
          <>
            <h2 className="mb-6 text-2xl font-extrabold text-white">My Profile</h2>
            <ProfileBuilder profile={me} mode="settings" />
          </>
        ) : tab === "appearance" ? (
          <>
            <h2 className="mb-6 text-2xl font-extrabold text-white">Appearance</h2>
            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-white">Theme</h3>
              <ThemePicker className="max-w-md" />
            </section>
          </>
        ) : tab === "chat" ? (
          <>
            <h2 className="mb-6 text-2xl font-extrabold text-white">Chat</h2>
            <ChatSettings />
          </>
        ) : tab === "accessibility" ? (
          <>
            <h2 className="mb-6 text-2xl font-extrabold text-white">Accessibility</h2>
            <AccessibilitySettings />
          </>
        ) : tab === "privacy" ? (
          <>
            <h2 className="mb-6 text-2xl font-extrabold text-white">Privacy &amp; Safety</h2>
            <PrivacySettings />
          </>
        ) : tab === "notifications" ? (
          <>
            <h2 className="mb-6 text-2xl font-extrabold text-white">Notifications</h2>
            <section className="mb-8 space-y-3">
              <h3 className="text-sm font-semibold text-white">Alerts</h3>
              <NotificationSettings />
            </section>
            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-white">Sounds</h3>
              <SoundSettings className="max-w-md" />
            </section>
          </>
        ) : tab === "advanced" ? (
          <>
            <h2 className="mb-6 text-2xl font-extrabold text-white">Advanced</h2>
            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-white">Data saver</h3>
              <LowDataToggle className="max-w-md" />
            </section>
            <PwaSettings />
          </>
        ) : tab === "voice" ? (
          <>
            <h2 className="mb-6 text-2xl font-extrabold text-white">Voice &amp; Video</h2>
            <VoiceSettings />
          </>
        ) : tab === "report" ? (
          <>
            <h2 className="mb-2 text-2xl font-extrabold text-white">Report a problem</h2>
            <p className="mb-6 text-sm text-slate-400">Something broken, slow or confusing? Tell us and we&apos;ll fix it.</p>
            <ReportProblemForm />
          </>
        ) : (
          <>
            <h2 className="mb-10 text-2xl font-extrabold text-white">Account &amp; Sessions</h2>
            <AccountSettings account={account} username={me.username} createdAt={me.created_at} />
          </>
        )}
      </div>
    </div>
  );
}
