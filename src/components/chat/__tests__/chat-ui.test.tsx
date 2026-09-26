import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ChatMessage } from "@/hooks/useChannelChat";
import { createFakeSupabase } from "../../../../tests/fixtures/fake-supabase";
import { MEMBER_ID, OWNER_ID, ServerFixture, makeMember } from "../../../../tests/fixtures/server";

const fake = createFakeSupabase();
vi.mock("@/components/providers/RuntimeConfig", () => ({ useSupabase: () => fake.client }));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }) }));

const { MessageItem } = await import("@/components/chat/MessageItem");
const { Composer } = await import("@/components/chat/Composer");
const { summarizeReactions } = await import("@/components/chat/ReactionBar");

const members = [makeMember(OWNER_ID, "Kapitan", "admin"), makeMember(MEMBER_ID, "Juan", "member")];

const message: ChatMessage = {
  id: "m1",
  channel_id: "c",
  server_id: "s",
  author_id: MEMBER_ID,
  content: "Tara **ranked**",
  attachments: [{ path: "11111111-2222-4333-8444-555555555555/11111111-2222-4333-8444-555555555555/11111111-2222-4333-8444-555555555555/11111111-2222-4333-8444-555555555555.mp3", name: "kanta.mp3", size: 2048, type: "audio/mpeg" }],
  reply_to_id: null,
  pinned: false,
  pinned_at: null,
  pinned_by: null,
  edited_at: "2026-09-26T01:05:00Z",
  created_at: "2026-09-26T01:00:00Z",
  author: members[1].profile,
};

function actions() {
  return {
    onReply: vi.fn(),
    onEdit: vi.fn(async () => true),
    onDelete: vi.fn(),
    onPin: vi.fn(),
    onReact: vi.fn(),
    onRetry: vi.fn(),
    onDiscard: vi.fn(),
    onJump: vi.fn(),
    nameOf: (id: string) => (id === OWNER_ID ? "Kapitan" : "Juan"),
  };
}

function renderItem(props: Partial<Parameters<typeof MessageItem>[0]> = {}) {
  const a = actions();
  const setEditing = vi.fn();
  render(
    <ServerFixture members={members}>
      <MessageItem message={message} grouped={false} replyTo={undefined} reactions={[]} meId={OWNER_ID} canModerate={false} mentioned={false} editing={false} setEditing={setEditing} actions={a} {...props} />
    </ServerFixture>,
  );
  return { a, setEditing };
}

describe("MessageItem", () => {
  it("renders markdown, edited marker and audio attachments from signed URLs", async () => {
    renderItem();
    const article = screen.getByTestId("message");
    expect(within(article).getByText("ranked").tagName).toBe("STRONG");
    expect(within(article).getByText("(edited)")).toBeInTheDocument();
    expect(within(article).getByText("kanta.mp3")).toBeInTheDocument();
    await vi.waitFor(() => expect(article.querySelector("audio")).toHaveAttribute("src", "https://signed.test/11111111-2222-4333-8444-555555555555/11111111-2222-4333-8444-555555555555/11111111-2222-4333-8444-555555555555/11111111-2222-4333-8444-555555555555.mp3"));
  });

  it("only offers edit to the author and pin/delete to moderators", () => {
    renderItem();
    const toolbar = screen.getByRole("toolbar", { name: "Message actions" });
    expect(within(toolbar).queryByRole("button", { name: "Edit" })).toBeNull();
    expect(within(toolbar).queryByRole("button", { name: "Pin" })).toBeNull();
    expect(within(toolbar).queryByRole("button", { name: "Delete" })).toBeNull();
  });

  it("gives moderators pin and delete with shift-to-skip confirmation", () => {
    const { a } = renderItem({ canModerate: true });
    const toolbar = screen.getByRole("toolbar", { name: "Message actions" });
    fireEvent.click(within(toolbar).getByRole("button", { name: "Pin" }));
    expect(a.onPin).toHaveBeenCalledWith("m1", true);
    fireEvent.click(within(toolbar).getByRole("button", { name: "Delete" }), { shiftKey: true });
    expect(a.onDelete).toHaveBeenCalledWith(message, true);
  });

  it("edits inline with Enter and cancels with Escape", async () => {
    const { a, setEditing } = renderItem({ meId: MEMBER_ID, editing: true });
    const box = screen.getByRole("textbox", { name: "Edit message" });
    fireEvent.change(box, { target: { value: "Tara ranked mamaya" } });
    fireEvent.keyDown(box, { key: "Enter" });
    await vi.waitFor(() => expect(a.onEdit).toHaveBeenCalledWith("m1", "Tara ranked mamaya"));
    expect(setEditing).toHaveBeenCalledWith(null);
    fireEvent.keyDown(box, { key: "Escape" });
  });

  it("highlights mentions and shows retry for failed sends", () => {
    const { a } = renderItem({ mentioned: true, message: { ...message, failed: true } });
    expect(screen.getByTestId("message").className).toContain("border-sun");
    fireEvent.click(screen.getByRole("button", { name: /Retry/ }));
    expect(a.onRetry).toHaveBeenCalled();
  });

  it("aggregates reactions", () => {
    const rows = [
      { message_id: "m1", user_id: OWNER_ID, emoji: ":g:", channel_id: "c", server_id: "s", created_at: "1" },
      { message_id: "m1", user_id: MEMBER_ID, emoji: ":g:", channel_id: "c", server_id: "s", created_at: "2" },
      { message_id: "m1", user_id: MEMBER_ID, emoji: "😂", channel_id: "c", server_id: "s", created_at: "3" },
    ];
    expect(summarizeReactions(rows, OWNER_ID)).toEqual([
      { emoji: ":g:", count: 2, mine: true, first: "1" },
      { emoji: "😂", count: 1, mine: false, first: "3" },
    ]);
  });
});

describe("Composer", () => {
  // jsdom has no object-URL support for image previews.
  URL.createObjectURL = vi.fn(() => "blob:preview");
  URL.revokeObjectURL = vi.fn();
  function renderComposer(overrides: Record<string, unknown> = {}) {
    const props = {
      channelName: "general",
      serverId: "s",
      channelId: "c",
      replyTo: null,
      onCancelReply: vi.fn(),
      onSend: vi.fn(async () => true),
      onEditLast: vi.fn(),
      typingNames: [] as string[],
      onTyping: vi.fn(),
      onStopTyping: vi.fn(),
      ...overrides,
    };
    render(
      <ServerFixture members={members}>
        <Composer {...props} />
      </ServerFixture>,
    );
    return props;
  }

  it("sends on Enter, keeps newlines on Shift+Enter and notifies typing", async () => {
    const props = renderComposer();
    const box = screen.getByTestId("composer");
    fireEvent.change(box, { target: { value: "Kain" } });
    expect(props.onTyping).toHaveBeenCalled();
    fireEvent.keyDown(box, { key: "Enter", shiftKey: true });
    expect(props.onSend).not.toHaveBeenCalled();
    fireEvent.keyDown(box, { key: "Enter" });
    await vi.waitFor(() => expect(props.onSend).toHaveBeenCalledWith("Kain", [], null));
    expect((box as HTMLTextAreaElement).value).toBe("");
  });

  it("edits the last message with ArrowUp on an empty box", () => {
    const props = renderComposer();
    fireEvent.keyDown(screen.getByTestId("composer"), { key: "ArrowUp" });
    expect(props.onEditLast).toHaveBeenCalled();
  });

  it("shows reply context and typing indicators", () => {
    const props = renderComposer({ replyTo: message, typingNames: ["Juan", "Maria"] });
    expect(screen.getByText(/Replying to/)).toHaveTextContent("Replying to Juan");
    expect(screen.getByText("Juan at Maria are typing…")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel reply" }));
    expect(props.onCancelReply).toHaveBeenCalled();
  });

  it("uploads attachments under a random UUID name in the user's channel folder", async () => {
    const props = renderComposer();
    const png = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])], "../../My Meme.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText("Attach files", { selector: "input" }), { target: { files: [png] } });
    await vi.waitFor(() => expect(fake.uploads.at(-1)?.path).toMatch(new RegExp(`^s/c/${OWNER_ID}/[0-9a-f-]{36}\\.png$`)));
    await vi.waitFor(() => expect(screen.getByRole("button", { name: "Send message" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    await vi.waitFor(() => expect(props.onSend).toHaveBeenCalledWith("", [expect.objectContaining({ name: "My-Meme.png", type: "image/png", size: 12 })], null));
  });

  it("refuses disallowed types and files whose bytes don't match their type", async () => {
    renderComposer();
    const before = fake.uploads.length;
    const html = new File(["<script>alert(1)</script>"], "x.html", { type: "text/html" });
    const fakePng = new File(["<svg onload=alert(1)>"], "x.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText("Attach files", { selector: "input" }), { target: { files: [html, fakePng] } });
    await new Promise((r) => setTimeout(r, 50));
    expect(fake.uploads.length).toBe(before);
  });
});
