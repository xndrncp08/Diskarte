import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DiskarteLogo, sparklePath } from "@/components/brand/DiskarteLogo";
import { DiskarteWordmark } from "@/components/brand/DiskarteWordmark";
import { WORDMARK_TEXT_PATH } from "@/components/brand/wordmark-path";

describe("DiskarteLogo", () => {
  it("renders an accessible, square SVG", () => {
    render(<DiskarteLogo size={64} />);
    const svg = screen.getByRole("img", { name: "Diskarte" });
    expect(svg).toHaveAttribute("width", "64");
    expect(svg).toHaveAttribute("height", "64");
    expect(svg).toHaveAttribute("viewBox", "0 0 512 512");
  });

  it("keeps gradient ids unique across instances", () => {
    const { container } = render(
      <>
        <DiskarteLogo />
        <DiskarteLogo variant="mascot" />
      </>,
    );
    const ids = Array.from(container.querySelectorAll("[id]")).map((el) => el.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("builds closed sparkle paths", () => {
    expect(sparklePath(10, 10, 5)).toMatch(/^M10 5 .*Z$/);
  });
});

describe("DiskarteWordmark", () => {
  it("renders the lockup with an aspect-correct width", () => {
    render(<DiskarteWordmark height={40} title="Diskarte home" />);
    const svg = screen.getByRole("img", { name: "Diskarte home" });
    expect(Number(svg.getAttribute("width"))).toBeGreaterThan(120);
    expect(svg.querySelectorAll("path").length).toBeGreaterThan(10);
  });

  it("can drop the mascot", () => {
    const { container } = render(<DiskarteWordmark showMascot={false} />);
    expect(container.querySelector("clipPath")).toBeNull();
  });

  it("ships valid path data (no NaN from the font conversion)", () => {
    expect(WORDMARK_TEXT_PATH).not.toMatch(/NaN|undefined/);
  });
});
