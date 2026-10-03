import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PixelStatus } from "@/components/retro/PixelStatus";
import { SignalBars } from "@/components/retro/SignalBars";

describe("PixelStatus", () => {
  it.each([
    ["online", "Online"],
    ["idle", "Idle"],
    ["dnd", "Do Not Disturb"],
    ["offline", "Offline"],
  ] as const)("labels %s", (status, label) => {
    render(<PixelStatus status={status} />);
    expect(screen.getByRole("img", { name: label })).toHaveAttribute("data-status", status);
  });
});

describe("SignalBars", () => {
  it("lights the right number of bars", () => {
    const { container } = render(<SignalBars level={3} />);
    const lit = Array.from(container.querySelectorAll("rect")).filter((r) => r.getAttribute("fill") === "#10B981");
    expect(lit).toHaveLength(3);
  });

  it("blinks when offline and can show a label", () => {
    const { container } = render(<SignalBars level={0} showLabel />);
    expect(container.querySelector("svg")).toHaveClass("animate-blink");
    expect(screen.getByText("Offline")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Connection: Offline" })).toBeInTheDocument();
  });
});
