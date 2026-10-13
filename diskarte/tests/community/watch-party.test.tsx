import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { formatClock } from "@/lib/youtube";

const { WatchParty } = await import("@/components/voice/live/activities/WatchParty");

const state = { videoId: "dQw4w9WgXcQ", playing: true, position: 0, at: Date.now() };

function deliver(info: Record<string, number>) {
  const frame = document.querySelector("iframe")!;
  act(() => {
    window.dispatchEvent(new MessageEvent("message", { origin: "https://www.youtube-nocookie.com", source: frame.contentWindow, data: JSON.stringify({ event: "infoDelivery", info }) }));
  });
}

describe("watch party player", () => {
  it("shows time and length, and seeking moves the video for everyone", () => {
    const onChange = vi.fn();
    render(<WatchParty state={state} onChange={onChange} />);
    const seek = screen.getByRole("slider", { name: "Seek (for everyone)" });
    expect(seek).toBeDisabled();
    deliver({ duration: 213, currentTime: 42 });
    expect(seek).toBeEnabled();
    expect(screen.getByText("0:42")).toBeInTheDocument();
    expect(screen.getByText("3:33")).toBeInTheDocument();
    fireEvent.change(seek, { target: { value: "120" } });
    expect(onChange).not.toHaveBeenCalled(); // not while dragging
    fireEvent.pointerUp(seek);
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ position: 120, playing: true }));
  });

  it("sets this viewer's volume without touching shared state", () => {
    const onChange = vi.fn();
    render(<WatchParty state={state} onChange={onChange} />);
    const post = vi.spyOn(document.querySelector("iframe")!.contentWindow!, "postMessage");
    fireEvent.change(screen.getByRole("slider", { name: "Video volume (just you)" }), { target: { value: "30" } });
    expect(post).toHaveBeenCalledWith(JSON.stringify({ event: "command", func: "setVolume", args: [30] }), "https://www.youtube-nocookie.com");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("formats clock times", () => {
    expect(formatClock(75)).toBe("1:15");
    expect(formatClock(3725)).toBe("1:02:05");
    expect(formatClock(-3)).toBe("0:00");
  });
});
