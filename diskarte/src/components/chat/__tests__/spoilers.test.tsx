import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DEFAULT_DISPLAY_PREFS, setDisplayPrefs } from "@/lib/display-prefs";
import { MessageMarkdown } from "../MessageMarkdown";

describe("spoilers", () => {
  it("hides ||text|| until clicked, across formatting, and leaves unpaired bars and code alone", () => {
    const { container } = render(<MessageMarkdown content={"the killer is ||**the butler**|| obviously || not this `||code||`"} />);
    const spoiler = screen.getByRole("button", { name: "Spoiler, click to show" });
    expect(spoiler).toHaveAttribute("data-spoiler", "hidden");
    expect(spoiler.querySelector("strong")).toHaveTextContent("the butler");
    fireEvent.click(spoiler);
    expect(container.querySelector("[data-spoiler]")).toHaveAttribute("data-spoiler", "shown");
    expect(container).toHaveTextContent("obviously || not this");
    expect(container.querySelector("code")).toHaveTextContent("||code||");
  });

  it("opens with the keyboard", () => {
    render(<MessageMarkdown content={"||psst||"} />);
    const spoiler = screen.getByRole("button", { name: "Spoiler, click to show" });
    fireEvent.keyDown(spoiler, { key: "Enter" });
    expect(screen.queryByRole("button", { name: "Spoiler, click to show" })).toBeNull();
  });

  it("shows spoilers straight away when Settings → Chat says Always", () => {
    render(<MessageMarkdown content={"||the butler||"} />);
    expect(screen.getByRole("button", { name: "Spoiler, click to show" })).toBeInTheDocument();
    act(() => setDisplayPrefs({ spoilers: "always" }));
    expect(screen.queryByRole("button", { name: "Spoiler, click to show" })).toBeNull();
    act(() => setDisplayPrefs(DEFAULT_DISPLAY_PREFS));
  });
});
