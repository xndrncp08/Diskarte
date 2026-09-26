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
  attachments: [{ path: "s/c/u/1-notes.txt", name: "notes.txt", size: 2048, type: "text/plain" }],
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
  it("renders markdown, edited marker and file attachments", async () => {
    renderItem();
    const article = screen.getByTestId("message");
    expect(within(article).getByText("ranked").tagName).toBe("STRONG");
    expect(within(article).getByText("(edited)")).toBeInTheDocument();
    expect(within(article).getByText("notes.txt")).toBeInTheDocument();
    expect(await within(article).findByRole("link", { name: "Download notes.txt" })).toHaveAttribute("href", "https://signed.test/s/c/u/1-notes.txt");
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

  it("uploads attachments into the user's channel folder before sending", async () => {
    const props = renderComposer();
    const file = new File(["hello"], "notes.txt", { type: "text/plain" });
    fireEvent.change(screen.getByLabelText("Attach files", { selector: "input" }), { target: { files: [file] } });
    await vi.waitFor(() => expect(fake.uploads.at(-1)?.path).toMatch(new RegExp(`^s/c/${OWNER_ID}/[0-9a-f-]+-notes\\.txt$`)));
    await vi.waitFor(() => expect(screen.getByRole("button", { name: "Send message" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    await vi.waitFor(() => expect(props.onSend).toHaveBeenCalledWith("", [expect.objectContaining({ name: "notes.txt", type: "text/plain", size: 5 })], null));
  });
});
