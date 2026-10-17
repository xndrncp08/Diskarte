"use client";

import { useId, useRef, useState, type KeyboardEvent } from "react";
import {
  Accessibility,
  Bell,
  Globe,
  HardDrive,
  Keyboard,
  MessageSquare,
  Monitor,
  Palette,
  Search,
  Settings,
  Shield,
  UserRound,
  Wrench,
  Headphones,
} from "lucide-react";
import { useMe } from "@/components/providers/MeProvider";
import {
  AccountSettings,
  SessionSettings,
  type AccountInfo,
} from "@/components/profile/AccountSettings";
import { DataExport } from "./DataExport";
import { ProfileBuilder } from "@/components/profile/ProfileBuilder";
import { ReportProblemForm } from "@/components/profile/ReportProblemForm";
import { SignOutButton } from "@/components/profile/SignOutButton";
import { VoiceSettings } from "@/components/profile/VoiceSettings";
import { LowDataToggle } from "@/components/profile/LowDataToggle";
import { NotificationSettings } from "@/components/profile/NotificationSettings";
import {
  AccessibilitySettings,
  ChatSettings,
} from "@/components/profile/DisplaySettings";
import { PrivacySettings } from "@/components/profile/PrivacySettings";
import { SoundSettings } from "@/components/profile/SoundSettings";
import { ThemePicker } from "@/components/profile/ThemePicker";
import { PwaSettings } from "@/components/profile/PwaSettings";
import { ConnectionDiagnostics } from "@/components/profile/ConnectionDiagnostics";
import { AccountSyncStatus } from "@/components/profile/AccountPreferencesSync";
import { LanguageRegionSettings } from "./LanguageRegionSettings";
import { useLocale } from "@/lib/locale";
import { cn } from "@/lib/utils";
import type { SettingsTab } from "./SettingsDialog";

const TABS: { id: SettingsTab; label: string }[] = [
  { id: "profile", label: "My Profile" },
  { id: "account", label: "My Account" },
  { id: "devices", label: "Devices & Sessions" },
  { id: "privacy", label: "Privacy & Safety" },
  { id: "appearance", label: "Appearance" },
  { id: "accessibility", label: "Accessibility" },
  { id: "voice", label: "Voice & Video" },
  { id: "chat", label: "Chat" },
  { id: "notifications", label: "Notifications" },
  { id: "advanced", label: "Advanced" },
  { id: "language", label: "Language & Region" },
  { id: "storage", label: "Storage & Data" },
  { id: "keybinds", label: "Keybinds" },
  { id: "report", label: "Report a problem" },
];

const ICONS = {
  profile: UserRound,
  account: Shield,
  devices: Monitor,
  privacy: Shield,
  appearance: Palette,
  accessibility: Accessibility,
  voice: Headphones,
  chat: MessageSquare,
  notifications: Bell,
  advanced: Settings,
  language: Globe,
  storage: HardDrive,
  keybinds: Keyboard,
  report: Wrench,
};

/** The Settings window's body; loaded on first open so the profile builder and account forms stay out of the initial bundle. */
export function SettingsPanels({
  account,
  tab,
  onTab,
}: {
  account: AccountInfo;
  tab: SettingsTab;
  onTab: (tab: SettingsTab) => void;
}) {
  const { me } = useMe();
  const { t: translate } = useLocale();
  const id = useId();
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const [query, setQuery] = useState("");
  const visibleTabs = TABS.filter((item) =>
    translate(item.label).toLowerCase().includes(query.trim().toLowerCase()),
  );

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const step = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[
      event.key
    ];
    if (!visibleTabs.length) return;
    const index = visibleTabs.findIndex((t) => t.id === tab);
    const nextIndex = step
      ? (index + step + visibleTabs.length) % visibleTabs.length
      : event.key === "Home"
        ? 0
        : event.key === "End"
          ? visibleTabs.length - 1
          : null;
    if (nextIndex === null) return;
    event.preventDefault();
    onTab(visibleTabs[nextIndex].id);
    tabs.current[
      TABS.findIndex((item) => item.id === visibleTabs[nextIndex].id)
    ]?.focus();
  }

  return (
    <div className="settings-layout flex min-h-full flex-col md:h-full md:flex-row">
      <div className="settings-navigation flex shrink-0 flex-col border-b border-white/5 px-4 pb-3 pt-5 md:w-56 md:overflow-y-auto md:border-b-0 md:border-r md:px-3 md:py-5">
        <p className="section-kicker mb-3 hidden px-3 md:block">
          MAKE DISKARTE YOURS
        </p>
        <label className="relative mb-3 block">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-slate-400"
            aria-hidden
          />
          <span className="sr-only">Find a settings section</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="settings-search pl-9!"
            placeholder="Find a section…"
          />
        </label>
        <div
          role="tablist"
          aria-label="User settings"
          onKeyDown={onKeyDown}
          className="scrollbar-none flex gap-2 overflow-x-auto pr-10 md:flex-col md:gap-1 md:overflow-visible md:pr-0"
        >
          {visibleTabs.map((t) => {
            const Icon = ICONS[t.id];
            const i = TABS.indexOf(t);
            return (
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
                tabIndex={
                  tab === t.id ||
                  (!visibleTabs.some((item) => item.id === tab) &&
                    t === visibleTabs[0])
                    ? 0
                    : -1
                }
                data-autofocus={tab === t.id ? "" : undefined}
                onClick={() => onTab(t.id)}
                className={cn(
                  "flex shrink-0 items-center gap-2.5 whitespace-nowrap rounded-md px-3 py-1.5 text-left text-sm font-medium transition-colors pointer-coarse:min-h-11",
                  tab === t.id
                    ? "bg-white/10 text-white"
                    : "text-slate-400 hover:bg-white/5 hover:text-slate-200",
                )}
              >
                <Icon className="size-4 shrink-0" aria-hidden />
                {translate(t.label)}
              </button>
            );
          })}
        </div>
        {!visibleTabs.length && (
          <p role="status" className="px-3 text-sm text-slate-400">
            No sections match.
          </p>
        )}
        <div className="mt-3 md:mt-auto md:pt-6">
          <SignOutButton className="w-full" />
        </div>
      </div>
      <div
        role="tabpanel"
        id={`${id}-${tab}-panel`}
        aria-label={translate(
          TABS.find((item) => item.id === tab)?.label ?? "Settings",
        )}
        aria-labelledby={
          visibleTabs.some((item) => item.id === tab)
            ? `${id}-${tab}-tab`
            : undefined
        }
        className="settings-content scrollbar-thin min-w-0 flex-1 px-4 py-6 sm:px-8 md:overflow-y-auto md:py-8"
      >
        {["appearance", "accessibility", "chat", "language"].includes(tab) && (
          <AccountSyncStatus kind="display" />
        )}
        {tab === "notifications" && <AccountSyncStatus kind="notifications" />}
        {tab === "profile" ? (
          <>
            <h2 className="mb-6 text-2xl font-extrabold text-white">
              {translate("My Profile")}
            </h2>
            <ProfileBuilder profile={me} mode="settings" />
          </>
        ) : tab === "appearance" ? (
          <>
            <h2 className="mb-6 text-2xl font-extrabold text-white">
              {translate("Appearance")}
            </h2>
            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-white">Theme</h3>
              <ThemePicker className="max-w-md" />
            </section>
          </>
        ) : tab === "chat" ? (
          <>
            <h2 className="mb-6 text-2xl font-extrabold text-white">
              {translate("Chat")}
            </h2>
            <ChatSettings />
          </>
        ) : tab === "accessibility" ? (
          <>
            <h2 className="mb-6 text-2xl font-extrabold text-white">
              {translate("Accessibility")}
            </h2>
            <AccessibilitySettings />
          </>
        ) : tab === "privacy" ? (
          <>
            <h2 className="mb-6 text-2xl font-extrabold text-white">
              {translate("Privacy & Safety")}
            </h2>
            <PrivacySettings />
          </>
        ) : tab === "notifications" ? (
          <>
            <h2 className="mb-6 text-2xl font-extrabold text-white">
              {translate("Notifications")}
            </h2>
            <section className="mb-8 space-y-3">
              <h3 className="text-sm font-semibold text-white">Alerts</h3>
              <NotificationSettings />
            </section>
            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-white">Sounds</h3>
              <SoundSettings className="max-w-md" />
            </section>
          </>
        ) : tab === "devices" ? (
          <>
            <h2 className="mb-6 text-2xl font-extrabold text-white">
              Devices & Sessions
            </h2>
            <SessionSettings />
          </>
        ) : tab === "storage" ? (
          <>
            <h2 className="mb-6 text-2xl font-extrabold text-white">
              Storage & Data
            </h2>
            <section className="surface-card mb-6 space-y-4 p-5">
              <h3 className="font-semibold text-white">Use less data</h3>
              <LowDataToggle />
              <p className="text-sm text-slate-400">
                Keep media lighter on a limited connection. Attachments stay
                protected by your channel permissions.
              </p>
            </section>
            <section className="surface-card space-y-4 p-5">
              <h3 className="font-semibold text-white">
                Your data, in your hands
              </h3>
              <DataExport username={me.username} />
            </section>
            <PwaSettings />
          </>
        ) : tab === "keybinds" ? (
          <>
            <h2 className="mb-3 text-2xl font-extrabold text-white">
              Keybinds
            </h2>
            <p className="mb-6 text-sm text-slate-400">
              Built-in shortcuts for getting around. Use Cmd on Mac or Ctrl on
              other keyboards.
            </p>
            <dl className="shortcut-list">
              {[
                ["Go anywhere", "Ctrl / Cmd + K"],
                ["Go home", "Ctrl / Cmd + Shift + H"],
                ["Open messages", "Ctrl / Cmd + Shift + M"],
                ["Send a message", "Enter"],
                ["New line in a message", "Shift + Enter"],
                ["Close the current menu or dialog", "Escape"],
              ].map(([label, keys]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>
                    <kbd>{keys}</kbd>
                  </dd>
                </div>
              ))}
            </dl>
          </>
        ) : tab === "advanced" ? (
          <>
            <h2 className="mb-6 text-2xl font-extrabold text-white">
              {translate("Advanced")}
            </h2>
            <ConnectionDiagnostics />
          </>
        ) : tab === "voice" ? (
          <>
            <h2 className="mb-6 text-2xl font-extrabold text-white">
              {translate("Voice & Video")}
            </h2>
            <VoiceSettings />
          </>
        ) : tab === "language" ? (
          <>
            <h2 className="mb-6 text-2xl font-extrabold text-white">
              {translate("Language & Region")}
            </h2>
            <LanguageRegionSettings />
          </>
        ) : tab === "report" ? (
          <>
            <h2 className="mb-2 text-2xl font-extrabold text-white">
              {translate("Report a problem")}
            </h2>
            <p className="mb-6 text-sm text-slate-400">
              Something broken, slow or confusing? Tell us and we&apos;ll fix
              it.
            </p>
            <ReportProblemForm />
          </>
        ) : (
          <>
            <h2 className="mb-6 text-2xl font-extrabold text-white">
              {translate("My Account")}
            </h2>
            <AccountSettings
              account={account}
              username={me.username}
              createdAt={me.created_at}
              includeSessions={false}
              includeData={false}
            />
          </>
        )}
      </div>
    </div>
  );
}
