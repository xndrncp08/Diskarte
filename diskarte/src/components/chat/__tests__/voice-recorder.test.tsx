import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { VoiceRecorder } from "../VoiceRecorder";

vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }) }));

class FakeRecorder {
  static isTypeSupported = (mime: string) => mime === "audio/webm;codecs=opus";
  state: "inactive" | "recording" = "inactive";
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  constructor(
    public stream: MediaStream,
    public opts: MediaRecorderOptions,
  ) {}
  start() {
    this.state = "recording";
  }
  stop() {
    this.state = "inactive";
    this.ondataavailable?.({ data: new Blob([new Uint8Array([0x1a, 0x45, 0xdf, 0xa3])], { type: "audio/webm" }) });
    this.onstop?.();
  }
}

const stopTrack = vi.fn();
function setup() {
  vi.stubGlobal("MediaRecorder", FakeRecorder);
  Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia: vi.fn(async () => ({ getTracks: () => [{ stop: stopTrack }] })) } });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("VoiceRecorder", () => {
  it("records, then sends a WebM voice message and releases the mic", async () => {
    setup();
    const onRecorded = vi.fn();
    const user = userEvent.setup();
    const now = vi.spyOn(Date, "now").mockReturnValue(1_000_000);
    render(<VoiceRecorder onRecorded={onRecorded} />);
    await user.click(screen.getByRole("button", { name: "Record a voice message" }));
    expect(await screen.findByRole("status", { name: "Recording a voice message" })).toBeInTheDocument();
    now.mockReturnValue(1_004_000);
    await act(async () => screen.getByRole("button", { name: "Send voice message" }).click());
    expect(onRecorded).toHaveBeenCalledTimes(1);
    const [file, seconds] = onRecorded.mock.calls[0] as [File, number];
    expect(file.type).toBe("audio/webm");
    expect(file.name).toBe("voice-message.webm");
    expect(seconds).toBe(4);
    expect(stopTrack).toHaveBeenCalled();
    now.mockRestore();
  });

  it("discards without sending", async () => {
    setup();
    const onRecorded = vi.fn();
    const user = userEvent.setup();
    render(<VoiceRecorder onRecorded={onRecorded} />);
    await user.click(screen.getByRole("button", { name: "Record a voice message" }));
    await user.click(await screen.findByRole("button", { name: "Discard voice message" }));
    expect(onRecorded).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Record a voice message" })).toBeInTheDocument();
  });

  it("hides itself where the browser can't record", () => {
    vi.stubGlobal("MediaRecorder", undefined);
    const { container } = render(<VoiceRecorder onRecorded={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });
});
