"use client";

import { createContext, useCallback, useContext, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { useMe } from "@/components/providers/MeProvider";
import { AccountSettings, type AccountInfo } from "@/components/profile/AccountSettings";
import { ProfileBuilder } from "@/components/profile/ProfileBuilder";
import { Modal } from "@/components/ui/Modal";
import { cn } from "@/lib/utils";

export type SettingsTab = "profile" | "account";

const TABS: { id: SettingsTab; label: string }[] = [
  { id: "profile", label: "My Profile" },
  { id: "account", label: "Account & Sessions" },
];

interface SettingsDialogValue {
  openSettings: (tab?: SettingsTab) => void;
}

const SettingsDialogContext = createContext<SettingsDialogValue | null>(null);

/**
 * User settings as a floating dialog over the app shell. It lives inside <CallProvider>, so opening
 * it (unlike navigating to the /settings pages, which leave the shell) never unmounts the LiveKit
 * room: an active voice/video call stays connected with audio playing while settings change.
 */
export function SettingsDialogProvider({ account, children }: { account: AccountInfo; children: ReactNode }) {
  const [tab, setTab] = useState<SettingsTab | null>(null);
  const openSettings = useCallback((next: SettingsTab = "profile") => setTab(next), []);
  const value = useMemo(() => ({ openSettings }), [openSettings]);
  return (
    <SettingsDialogContext.Provider value={value}>
      {children}
      <Modal
        open={tab !== null}
        onClose={() => setTab(null)}
        title="User settings"
        hideTitle
        className="max-h-[calc(100dvh-2rem)] max-w-4xl overflow-y-auto overscroll-contain p-0"
      >
        {tab && <SettingsPanels account={account} tab={tab} onTab={setTab} />}
      </Modal>
    </SettingsDialogContext.Provider>
  );
}

/** Opens the Settings dialog; null outside the app shell (fall back to the /settings pages). */
export function useSettingsDialog(): SettingsDialogValue | null {
  return useContext(SettingsDialogContext);
}

function SettingsPanels({ account, tab, onTab }: { account: AccountInfo; tab: SettingsTab; onTab: (tab: SettingsTab) => void }) {
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
    <div className="flex flex-col md:min-h-[32rem] md:flex-row">
      <div className="shrink-0 border-b border-white/5 px-4 pb-3 pt-5 md:w-56 md:border-b-0 md:border-r md:bg-black/20 md:px-3 md:py-8">
        <p className="mb-2 px-3 font-silk text-[10px] uppercase tracking-widest text-slate-500">User settings</p>
        <div role="tablist" aria-label="User settings" onKeyDown={onKeyDown} className="flex gap-2 pr-10 md:flex-col md:gap-1 md:pr-0">
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
                "block rounded-md px-3 py-1.5 text-left text-sm font-medium transition-colors pointer-coarse:min-h-11",
                tab === t.id ? "bg-white/10 text-white" : "text-slate-400 hover:bg-white/5 hover:text-slate-200",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <div role="tabpanel" id={`${id}-${tab}-panel`} aria-labelledby={`${id}-${tab}-tab`} className="min-w-0 flex-1 px-4 py-6 sm:px-8 md:py-8">
        {tab === "profile" ? (
          <>
            <h2 className="mb-6 text-2xl font-extrabold text-white">My Profile</h2>
            <ProfileBuilder profile={me} mode="settings" />
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
