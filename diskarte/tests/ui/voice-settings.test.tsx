import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { micProcessing, parseVoicePrefs, readVoicePrefs, resetVoicePrefsCache } from "@/lib/voice-prefs";

const { VoiceSettings } = await import("@/components/profile/VoiceSettings");

beforeEach(() => {
  localStorage.clear();
  resetVoicePrefsCache();
});

describe("voice preferences", () => {
  it("defaults to Voice Isolation, honours the old noise-suppression setting, and maps profiles to processing", () => {
    expect(parseVoicePrefs(null)).toMatchObject({ profile: "isolation", pushToTalk: false, pttKey: "KeyV" });
    expect(parseVoicePrefs(null, "off")).toMatchObject({ profile: "custom", noiseSuppression: false });
    expect(parseVoicePrefs("{broken")).toMatchObject({ profile: "isolation" });
    expect(micProcessing(parseVoicePrefs(JSON.stringify({ profile: "studio" })))).toEqual({ echoCancellation: false, noiseSuppression: false, autoGainControl: false });
  });
});

describe("Voice & Video settings", () => {
  it("switches input profile, shows Custom's switches, and records a push-to-talk key", async () => {
    const user = userEvent.setup();
    render(<VoiceSettings />);
    expect(screen.getByRole("combobox", { name: "Microphone" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Speaker" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Camera" })).toBeInTheDocument();
    const profiles = screen.getByRole("radiogroup", { name: "Input Profile" });
    await user.click(within(profiles).getByRole("radio", { name: /Custom/ }));
    expect(readVoicePrefs().profile).toBe("custom");
    await user.click(screen.getByRole("switch", { name: "Echo cancellation" }));
    expect(readVoicePrefs().echoCancellation).toBe(false);

    await user.click(screen.getByRole("switch", { name: /Push to Talk/ }));
    await user.click(screen.getByRole("button", { name: "V" }));
    expect(screen.getByRole("button", { name: "Press a key…" })).toBeInTheDocument();
    fireEvent.keyDown(window, { code: "KeyB", key: "b" });
    await waitFor(() => expect(readVoicePrefs().pttKey).toBe("KeyB"));
    expect(screen.getByRole("button", { name: "B" })).toBeInTheDocument();
  });

  it("explains when the mic test can't reach the microphone", async () => {
    const user = userEvent.setup();
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia: vi.fn(async () => Promise.reject(new Error("denied"))), enumerateDevices: vi.fn(async () => []) } });
    render(<VoiceSettings />);
    await user.click(screen.getByRole("button", { name: "Mic Test" }));
    expect(await screen.findByText(/Couldn't use the microphone/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mic Test" })).toBeInTheDocument();
  });
});
