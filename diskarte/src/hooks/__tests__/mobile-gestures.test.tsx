import { fireEvent, render, renderHook, screen } from "@testing-library/react";
import { useRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { bottomLayout, standaloneFill, useAppViewport } from "../useAppViewport";
import { useSwipeReply } from "../useSwipeReply";

function Swipeable({ onReply, disabled = false }: { onReply: () => void; disabled?: boolean }) {
  const swipe = useSwipeReply(onReply, disabled);
  return (
    <div data-testid="msg" {...swipe}>
      hello <button type="button">react</button>
    </div>
  );
}

const touch = (el: Element, type: "pointerDown" | "pointerMove" | "pointerUp", x: number, y = 100) =>
  fireEvent[type](el, { pointerType: "touch", pointerId: 1, isPrimary: true, clientX: x, clientY: y, button: 0 });

describe("swipe to reply", () => {
  it("replies after a long enough rightward swipe, and springs back", () => {
    const onReply = vi.fn();
    render(<Swipeable onReply={onReply} />);
    const msg = screen.getByTestId("msg");
    touch(msg, "pointerDown", 60);
    touch(msg, "pointerMove", 150);
    expect(msg.style.transform).toMatch(/translateX/);
    touch(msg, "pointerUp", 150);
    expect(onReply).toHaveBeenCalledTimes(1);
    expect(msg.style.transform).toBe("");
  });

  it("ignores short swipes, vertical scrolls, the back-gesture edge, controls and mouse drags", () => {
    const onReply = vi.fn();
    render(<Swipeable onReply={onReply} />);
    const msg = screen.getByTestId("msg");
    touch(msg, "pointerDown", 60);
    touch(msg, "pointerMove", 100);
    touch(msg, "pointerUp", 100);
    touch(msg, "pointerDown", 60, 100);
    touch(msg, "pointerMove", 90, 200);
    touch(msg, "pointerUp", 160, 200);
    touch(msg, "pointerDown", 10);
    touch(msg, "pointerMove", 120);
    touch(msg, "pointerUp", 120);
    touch(screen.getByRole("button"), "pointerDown", 60);
    touch(msg, "pointerMove", 160);
    touch(msg, "pointerUp", 160);
    fireEvent.pointerDown(msg, { pointerType: "mouse", pointerId: 2, isPrimary: true, clientX: 60, clientY: 100 });
    fireEvent.pointerMove(msg, { pointerType: "mouse", pointerId: 2, clientX: 200, clientY: 100 });
    fireEvent.pointerUp(msg, { pointerType: "mouse", pointerId: 2, clientX: 200, clientY: 100 });
    expect(onReply).not.toHaveBeenCalled();
  });

  it("does nothing while disabled (sending, editing)", () => {
    const onReply = vi.fn();
    render(<Swipeable onReply={onReply} disabled />);
    const msg = screen.getByTestId("msg");
    touch(msg, "pointerDown", 60);
    touch(msg, "pointerMove", 200);
    touch(msg, "pointerUp", 200);
    expect(onReply).not.toHaveBeenCalled();
  });
});

describe("app viewport", () => {
  it("tracks the visible height and flags an open keyboard", () => {
    const listeners = new Map<string, () => void>();
    const vv = { height: 800, offsetTop: 0, scale: 1, addEventListener: (t: string, f: () => void) => listeners.set(t, f), removeEventListener: vi.fn() };
    vi.stubGlobal("visualViewport", vv);
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 800 });
    const el = document.createElement("div");
    const hook = renderHook(() => {
      const ref = useRef<HTMLElement>(el);
      useAppViewport(ref);
    });
    expect(el.style.getPropertyValue("--app-height")).toBe("800px");
    expect(el.dataset.keyboard).toBe("false");
    vv.height = 450;
    listeners.get("resize")?.();
    expect(el.style.getPropertyValue("--app-height")).toBe("450px");
    expect(document.documentElement.style.getPropertyValue("--app-height")).toBe("450px");
    expect(el.dataset.keyboard).toBe("true");
    expect(document.documentElement.dataset.keyboard).toBe("true");
    hook.unmount();
    expect(document.documentElement.style.getPropertyValue("--app-height")).toBe("");
    vi.unstubAllGlobals();
  });
});

describe("installed iPhone app fill", () => {
  const phone = { width: 430, height: 932 };
  it("uses the real screen height when the app's viewport comes up short", () => {
    expect(standaloneFill({ standalone: true }, { innerWidth: 430, innerHeight: 873 }, phone, true)).toBe(932);
    expect(standaloneFill({ standalone: true }, { innerWidth: 932, innerHeight: 400 }, phone, false)).toBe(430);
  });
  it("leaves browsers, Android, full viewports and iPad split view alone", () => {
    expect(standaloneFill({}, { innerWidth: 430, innerHeight: 873 }, phone, true)).toBeNull();
    expect(standaloneFill({ standalone: true }, { innerWidth: 430, innerHeight: 932 }, phone, true)).toBeNull();
    expect(standaloneFill({ standalone: true }, { innerWidth: 320, innerHeight: 873 }, { width: 1024, height: 1366 }, true)).toBeNull();
    expect(standaloneFill({ standalone: true }, { innerWidth: 430, innerHeight: 500 }, phone, true)).toBeNull();
  });
});

describe("bottom layout", () => {
  it("spans the full height and lifts content above whatever covers the bottom", () => {
    // Safari toolbar shown: the visible area ends 80 px above the large viewport's bottom.
    expect(bottomLayout({ fill: null, large: 932, innerHeight: 852, visibleBottom: 852 })).toEqual({ full: 932, obscured: 80 });
    // Toolbar collapsed: nothing covered.
    expect(bottomLayout({ fill: null, large: 932, innerHeight: 932, visibleBottom: 932 })).toEqual({ full: 932, obscured: 0 });
    // Installed app with the iOS short-viewport bug: the screen height, nothing to lift.
    expect(bottomLayout({ fill: 932, large: 873, innerHeight: 873, visibleBottom: 873 })).toEqual({ full: 932, obscured: 0 });
    // No large-viewport support (probe reads 0): falls back to the window.
    expect(bottomLayout({ fill: null, large: 0, innerHeight: 800, visibleBottom: 800 })).toEqual({ full: 800, obscured: 0 });
  });
});
