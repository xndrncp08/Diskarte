import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MEMBER_ID, ServerFixture, makeMember } from "../fixtures/server";

vi.mock("@/components/providers/RuntimeConfig", () => ({ useSupabase: () => ({}), useOptionalSupabase: () => null }));

const { MessageMarkdown } = await import("@/components/chat/MessageMarkdown");
const { ReactionBar } = await import("@/components/chat/ReactionBar");
const { EmojiPickerPanel } = await import("@/components/chat/EmojiPickerPanel");
const { emojiNameFrom, emojiProblem } = await import("@/components/server/settings/EmojiSettings");

const members = [makeMember(MEMBER_ID, "Juan", "member")];
const emojis = new Map([["pogi", "https://cdn.example/emoji/pogi.png"]]);
const inServer = (ui: React.ReactNode) => render(<ServerFixture members={members} meId={MEMBER_ID} myRole="member" overrides={{ emojis }}>{ui}</ServerFixture>);

describe("custom server emoji", () => {
  it("renders this server's :name: as an image, built-ins as icons, and unknown names as text", () => {
    const { container } = inServer(<MessageMarkdown content="ang :pogi: mo :sparkle: pero :wala_to: `:pogi:`" />);
    const img = screen.getByRole("img", { name: ":pogi:" });
    expect(img).toHaveAttribute("src", "https://cdn.example/emoji/pogi.png");
    expect(container.querySelector("[data-glyph=':sparkle:']")).not.toBeNull();
    expect(container).toHaveTextContent(":wala_to:");
    // Code spans stay literal.
    expect(container.querySelector("code")).toHaveTextContent(":pogi:");
  });

  it("shows custom emoji in reactions and in the picker's Server tab", () => {
    inServer(<ReactionBar reactions={[{ message_id: "m", user_id: MEMBER_ID, emoji: ":pogi:" } as never]} meId={MEMBER_ID} onToggle={() => undefined} names={() => "Juan"} />);
    expect(screen.getAllByRole("img", { name: ":pogi:" }).length).toBeGreaterThan(0);
    const onPick = vi.fn();
    inServer(<EmojiPickerPanel onPick={onPick} />);
    const pick = screen.getByRole("button", { name: "pogi" });
    pick.click();
    expect(onPick).toHaveBeenCalledWith(":pogi:");
    expect(screen.getByRole("button", { name: /Server/ })).toHaveAttribute("aria-pressed", "true");
  });

  it("validates names and files before upload", async () => {
    expect(emojiNameFrom("Party Parrot!.gif")).toBe("party_parrot");
    const png = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], "a.png", { type: "image/png" });
    expect(await emojiProblem("pogi", png, [])).toBeNull();
    expect(await emojiProblem("a", png, [])).toMatch(/2–32/);
    expect(await emojiProblem("sparkle", png, [])).toMatch(/built-in/);
    expect(await emojiProblem("pogi", png, ["pogi"])).toMatch(/already/);
    expect(await emojiProblem("pogi", new File(["<svg/>"], "a.svg", { type: "image/svg+xml" }), [])).toMatch(/PNG, GIF or WEBP/);
    expect(await emojiProblem("pogi", new File(["<html>"], "a.png", { type: "image/png" }), [])).toMatch(/real image/);
  });
});
