import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { MessageWithAuthor } from "@/lib/messages";
import { createFakeSupabase } from "../fixtures/fake-supabase";
import { MEMBER_ID, SERVER_ID, ServerFixture, makeChannel, makeMember } from "../fixtures/server";

const fake = createFakeSupabase({});
vi.mock("@/components/providers/RuntimeConfig", () => ({ useSupabase: () => fake.client, useOptionalSupabase: () => fake.client }));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }) }));
vi.mock("@/lib/sfx", async (orig) => ({ ...(await orig<typeof import("@/lib/sfx")>()), playSfx: vi.fn(), playCue: vi.fn() }));
vi.mock("@/actions/messages", () => ({
  sendMessageAction: vi.fn(async (input: { id: string; content: string; title?: string }) => ({ ok: true, data: { message: { ...post(input.id, input.title ?? "", "2026-10-13T12:00:00Z"), content: input.content } } })),
  editMessageAction: vi.fn(),
  deleteMessageAction: vi.fn(),
  setPinnedAction: vi.fn(),
  toggleReactionAction: vi.fn(),
  toggleForumVoteAction: vi.fn(async () => ({ ok: true, data: { voted: true } })),
  setForumPostAction: vi.fn(async () => ({ ok: true })),
  setForumSettingsAction: vi.fn(async () => ({ ok: true })),
}));

const messageActions = await import("@/actions/messages");
const { ForumView } = await import("@/components/chat/ForumView");

const FORUM = "20000000-0000-4000-8000-0000000000f0";
const members = [makeMember(MEMBER_ID, "Juan", "member")];
const channel = { ...makeChannel(FORUM, "tulong", "text", 5), type: "forum" as const };

function post(id: string, title: string, created: string, lastReply: string | null = null, replies = 0): MessageWithAuthor {
  return {
    id,
    channel_id: FORUM,
    server_id: SERVER_ID,
    author_id: MEMBER_ID,
    content: `Body of ${title}`,
    attachments: [],
    reply_to_id: null,
    pinned: false,
    pinned_at: null,
    pinned_by: null,
    edited_at: null,
    thread_id: null,
    sticker: null,
    title,
    thread_reply_count: replies,
    thread_last_reply_at: lastReply,
    created_at: created,
    author: members[0].profile,
  };
}

describe("forum channels", () => {
  it("lists posts by latest activity, searches titles, and posts with a title", async () => {
    const user = userEvent.setup();
    const initial = {
      messages: [post("p1", "Mic help", "2026-10-10T00:00:00Z", "2026-10-12T00:00:00Z", 3), post("p2", "Rank boosting?", "2026-10-11T00:00:00Z")],
      reactions: [],
      hasMore: false,
    };
    render(
      <ServerFixture members={members} meId={MEMBER_ID} myRole="member" overrides={{ channels: [channel] }}>
        <ForumView channel={channel} initial={initial} />
      </ServerFixture>,
    );
    const list = screen.getByTestId("forum-posts");
    // p1 has a newer reply than p2's creation, so it comes first.
    expect(within(list).getAllByRole("button").map((b) => b.querySelector("span")?.textContent)).toEqual(["Mic help", "Rank boosting?"]);

    await user.type(screen.getByRole("searchbox", { name: "Search posts" }), "rank");
    expect(within(list).getAllByRole("button")).toHaveLength(1);
    await user.clear(screen.getByRole("searchbox", { name: "Search posts" }));

    await user.click(screen.getByRole("button", { name: /New Post/ }));
    await user.type(screen.getByRole("textbox", { name: "Post title" }), "Game night ideas");
    await user.type(screen.getByRole("textbox", { name: "Post message" }), "Among Us or Valorant?");
    await user.click(screen.getByRole("button", { name: "Post" }));
    await waitFor(() => expect(messageActions.sendMessageAction).toHaveBeenCalledWith(expect.objectContaining({ channelId: FORUM, title: "Game night ideas", content: "Among Us or Valorant?" })));
    await waitFor(() => expect(within(list).getAllByRole("button")[0].querySelector("span")).toHaveTextContent("Game night ideas"));
  });

  it("runs a suggestion board: status badges, Top sorting by votes, and voting", async () => {
    const user = userEvent.setup();
    const board = { ...channel, forum_mode: "suggestions" as const, forum_tags: ["Events"] };
    let votes = 1;
    (fake.client.rpc as unknown as ReturnType<typeof vi.fn>).mockImplementation(async (fn: string) =>
      fn === "forum_overview"
        ? { data: [{ message_id: "p2", tags: ["Events"], status: "planned", votes: 5, voted: false }, { message_id: "p1", tags: [], status: null, votes, voted: votes > 1 }], error: null }
        : { data: null, error: null },
    );
    render(
      <ServerFixture members={members} meId={MEMBER_ID} myRole="member" overrides={{ channels: [board] }}>
        <ForumView channel={board} initial={{ messages: [post("p1", "Mic help", "2026-10-10T00:00:00Z", "2026-10-12T00:00:00Z"), post("p2", "Movie night", "2026-10-11T00:00:00Z")], reactions: [], hasMore: false }} />
      </ServerFixture>,
    );
    expect(await screen.findByText("Planned")).toBeInTheDocument();
    const titles = () => within(screen.getByTestId("forum-posts")).getAllByRole("button", { name: /Mic help|Movie night/ }).map((b) => (b.textContent?.includes("Mic help") ? "p1" : "p2"));
    expect(titles()).toEqual(["p1", "p2"]);
    await user.click(screen.getByRole("button", { name: "Top" }));
    expect(titles()).toEqual(["p2", "p1"]);

    votes = 2;
    await user.click(screen.getByRole("button", { name: "Upvote (1)" }));
    expect(messageActions.toggleForumVoteAction).toHaveBeenCalledWith({ messageId: "p1" });
    expect(await screen.findByRole("button", { name: "Remove your vote (2)" })).toHaveAttribute("aria-pressed", "true");

    await user.click(screen.getByRole("button", { name: "Events" }));
    expect(titles()).toEqual(["p2"]);
  });
});
