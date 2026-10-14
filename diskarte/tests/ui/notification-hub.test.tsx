import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

const markAllRead = vi.fn();
const markRead = vi.fn();
const conversation = { id: "c1", kind: "direct", name: null, others: [], lastMessageAt: "2026-10-12T00:00:00Z", lastReadAt: "2026-10-01T00:00:00Z" };
vi.mock("@/components/providers/SocialProvider", () => ({
  useOptionalSocial: () => ({ attention: 1, friends: [], conversations: [conversation], profiles: new Map(), markRead }),
}));
vi.mock("@/components/providers/UnreadsProvider", async (orig) => ({
  ...(await orig<typeof import("@/components/providers/UnreadsProvider")>()),
  useOptionalUnreads: () => ({ channels: new Map([["ch", { serverId: "s", lastMessageAt: "2026-10-12T00:00:00Z", readAt: "2026-10-01T00:00:00Z", mentions: 1 }]]), markAllRead }),
}));
vi.mock("@/components/workspace/SavedMessages", () => ({ SavedMessages: () => null }));

const { NotificationHub } = await import("@/components/workspace/NotificationHub");

describe("notification hub", () => {
  it("clears every old notification at once", async () => {
    const user = userEvent.setup();
    render(<NotificationHub />);
    await user.click(screen.getByRole("button", { name: /Notifications/ }));
    await user.click(await screen.findByRole("button", { name: "Mark all as read" }));
    expect(markAllRead).toHaveBeenCalledWith();
    expect(markRead).toHaveBeenCalledWith("c1");
  });
});
