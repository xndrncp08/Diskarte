"use client";

import { Settings } from "lucide-react";
import dynamic from "next/dynamic";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { AccountInfo } from "@/components/profile/AccountSettings";
import { FloatingWindow } from "@/components/ui/FloatingWindow";
import { WindowSkeleton } from "@/components/ui/WindowSkeleton";

export type SettingsTab = "profile" | "account";

// The window frame is tiny; its body (profile builder, account forms) downloads on first open.
const SettingsPanels = dynamic(() => import("./SettingsPanels").then((m) => m.SettingsPanels), {
  ssr: false,
  loading: () => <WindowSkeleton label="Loading settings" />,
});

interface SettingsDialogValue {
  openSettings: (tab?: SettingsTab) => void;
}

const SettingsDialogContext = createContext<SettingsDialogValue | null>(null);

/**
 * User settings as a draggable floating window over the app shell. It lives inside <CallProvider>,
 * so opening it (unlike navigating to the /settings pages, which leave the shell) never unmounts the
 * LiveKit room: an active voice/video call stays connected with audio playing while settings change,
 * and the window is non-modal, so chat stays usable beside it.
 */
export function SettingsDialogProvider({ account, children }: { account: AccountInfo; children: ReactNode }) {
  const [tab, setTab] = useState<SettingsTab | null>(null);
  const openSettings = useCallback((next: SettingsTab = "profile") => setTab(next), []);
  const value = useMemo(() => ({ openSettings }), [openSettings]);
  return (
    <SettingsDialogContext.Provider value={value}>
      {children}
      <FloatingWindow
        id="user-settings"
        open={tab !== null}
        onClose={() => setTab(null)}
        title="User settings"
        icon={<Settings aria-hidden />}
        className="h-[min(48rem,calc(100dvh-2rem))] w-[min(72rem,calc(100vw-2rem))]"
        bodyClassName="md:overflow-hidden"
      >
        {tab && <SettingsPanels account={account} tab={tab} onTab={setTab} />}
      </FloatingWindow>
    </SettingsDialogContext.Provider>
  );
}

/** Opens the Settings dialog; null outside the app shell (fall back to the /settings pages). */
export function useSettingsDialog(): SettingsDialogValue | null {
  return useContext(SettingsDialogContext);
}
