import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Button, MIN_LOADING_MS } from "@/components/ui/Button";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("Button loading state", () => {
  it("keeps a spinner up for at least ~300 ms so fast responses don't flicker", () => {
    const { rerender } = render(<Button loading>Save</Button>);
    const button = screen.getByRole("button", { name: "Save" });
    expect(button).toHaveAttribute("aria-busy", "true");
    act(() => vi.advanceTimersByTime(50));
    rerender(<Button>Save</Button>); // the request finished after 50 ms…
    expect(button).toHaveAttribute("aria-busy", "true"); // …but the spinner stays a little longer
    act(() => vi.advanceTimersByTime(MIN_LOADING_MS));
    expect(button).not.toHaveAttribute("aria-busy");
    expect(button).toBeEnabled();
  });

  it("doesn't extend loading that already lasted long enough", () => {
    const { rerender } = render(<Button loading>Save</Button>);
    act(() => vi.advanceTimersByTime(MIN_LOADING_MS + 100));
    rerender(<Button>Save</Button>);
    expect(screen.getByRole("button", { name: "Save" })).not.toHaveAttribute("aria-busy");
  });
});
