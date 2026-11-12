import { act, fireEvent, render, renderHook, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { ShellKindContext } from "@/components/shell/ShellKind";
import type { ChatMessage } from "@/hooks/useChannelChat";
import { logIndex, useMessageRoving } from "@/hooks/useMessageRoving";
import { firstUnreadIndex, sharesMargin } from "@/lib/chat-format";
import { createFakeSupabase } from "../fixtures/fake-supabase";
import { MEMBER_ID, MOD_ID, OWNER_ID, ServerFixture, makeMember } from "../fixtures/server";

const fake = createFakeSupabase();
vi.mock("@/components/providers/RuntimeConfig", () => ({ useSupabase: () => fake.client, useOptionalSupabase: () => fake.client }));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }) }));

const { MessageItem } = await import("@/components/chat/MessageItem");
const { Composer } = await import("@/components/chat/Composer");
const { useReadPosition } = await import("@/components/chat/Transcript");

const members = [makeMember(OWNER_ID, "Kapitan", "admin"), makeMember(MOD_ID, "Maria", "moderator"), makeMember(MEMBER_ID, "Juan", "member")];

function msg(id: string, author: string, at: string, extra: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id,
    channel_id: "c",
    server_id: "s",
    author_id: author,
    content: `Message ${id}`,
    attachments: [],
    reply_to_id: null,
    pinned: false,
    pinned_at: null,
    pinned_by: null,
    edited_at: null,
    thread_id: null,
    sticker: null,
    thread_reply_count: 0,
    thread_last_reply_at: null,
    created_at: at,
    author: members.find((m) => m.user_id === author)!.profile,
    ...extra,
  };
}

function actions() {
  return { onReply: vi.fn(), onEdit: vi.fn(async () => true), onDelete: vi.fn(), onPin: vi.fn(), onReact: vi.fn(), onOpenThread: vi.fn(), onRetry: vi.fn(), onDiscard: vi.fn(), onJump: vi.fn(), nameOf: () => "Juan" };
}

const Pulse = ({ children }: { children: ReactNode }) => (
  <ShellKindContext.Provider value="pulse">
    <ServerFixture members={members}>{children}</ServerFixture>
  </ShellKindContext.Provider>
);

describe("transcript grouping and the New line", () => {
  const log = [
    msg("a", MEMBER_ID, "2026-10-16T10:00:00Z"),
    msg("b", MEMBER_ID, "2026-10-16T10:02:00Z"),
    msg("c", OWNER_ID, "2026-10-16T10:03:00Z"),
    msg("d", MEMBER_ID, "2026-10-16T10:04:00Z"),
    msg("e", MEMBER_ID, "2026-10-16T10:05:00Z"),
  ];

  it("starts the New line at the first message someone else sent after your read position", () => {
    expect(firstUnreadIndex(log, "2026-10-16T10:01:00Z", OWNER_ID)).toBe(1);
    // Your own message never starts it.
    expect(firstUnreadIndex(log, "2026-10-16T10:02:30Z", OWNER_ID)).toBe(3);
    expect(firstUnreadIndex(log, "2026-10-16T10:05:00Z", OWNER_ID)).toBe(-1);
    expect(firstUnreadIndex(log, null, OWNER_ID)).toBe(-1);
    expect(firstUnreadIndex([{ ...log[4], pending: true }], "2026-10-16T09:00:00Z", OWNER_ID)).toBe(-1);
  });

  it("shares the margin within the author's window, but not across the New line", () => {
    expect(sharesMargin(log, 1, -1)).toBe(true);
    expect(sharesMargin(log, 2, -1)).toBe(false); // another author
    expect(sharesMargin(log, 4, -1)).toBe(true);
    expect(sharesMargin(log, 4, 4)).toBe(false); // the New line sits above it: name and time again
    expect(sharesMargin(log, 0, -1)).toBe(false);
  });

  it("keeps the read position from when the conversation opened, moving it only back", () => {
    const { result, rerender } = renderHook(({ scope, readAt, newest }) => useReadPosition(scope, readAt, newest), {
      initialProps: { scope: "c1", readAt: undefined as string | undefined, newest: "2026-10-16T10:05:00Z" },
    });
    expect(result.current).toBeNull();
    rerender({ scope: "c1", readAt: "2026-10-16T10:01:00Z", newest: "2026-10-16T10:05:00Z" });
    expect(result.current).toBe("2026-10-16T10:01:00Z");
    // Reading marks it read: the line stays where it was.
    rerender({ scope: "c1", readAt: "2026-10-16T10:05:00Z", newest: "2026-10-16T10:06:00Z" });
    expect(result.current).toBe("2026-10-16T10:01:00Z");
    // Mark Unread moves it back.
    rerender({ scope: "c1", readAt: "2026-10-16T09:00:00Z", newest: "2026-10-16T10:06:00Z" });
    expect(result.current).toBe("2026-10-16T09:00:00Z");
    // Another channel where everything was read on open: no line, even when a message arrives later.
    rerender({ scope: "c2", readAt: "2026-10-16T10:06:00Z", newest: "2026-10-16T10:06:00Z" });
    expect(result.current).toBeNull();
    rerender({ scope: "c2", readAt: "2026-10-16T10:06:00Z", newest: "2026-10-16T10:07:00Z" });
    expect(result.current).toBeNull();
  });
});

describe("roving keyboard model", () => {
  it("moves one message at a time without wrapping, and jumps with Home/End", () => {
    expect(logIndex("ArrowUp", 2, 5)).toBe(1);
    expect(logIndex("ArrowUp", 0, 5)).toBe(0);
    expect(logIndex("ArrowDown", 4, 5)).toBe(4);
    expect(logIndex("ArrowDown", 1, 5)).toBe(2);
    expect(logIndex("Home", 3, 5)).toBe(0);
    expect(logIndex("End", 0, 5)).toBe(4);
    expect(logIndex("Enter", 0, 5)).toBe(-1);
    expect(logIndex("ArrowUp", 0, 0)).toBe(-1);
  });

  function Log({ messages, a }: { messages: ChatMessage[]; a: ReturnType<typeof actions> }) {
    const roving = useMessageRoving(messages.map((m) => m.id));
    return (
      <>
        <button type="button">Before</button>
        <div role="log" aria-label="Messages" aria-live={roving.focusInLog ? "off" : "polite"} onKeyDown={roving.onKeyDown} onFocus={roving.onFocus} onBlur={roving.onBlur}>
          {messages.map((m, i) => (
            <MessageItem key={m.id} message={m} grouped={sharesMargin(messages, i, -1)} replyTo={undefined} reactions={[]} meId={OWNER_ID} canModerate={false} mentioned={false} editing={false} setEditing={() => undefined} actions={a} tabStop={roving.tabStop === m.id} />
          ))}
        </div>
        <button type="button">After</button>
      </>
    );
  }

  it("is one Tab stop: arrows move between messages, Enter goes into the actions, Escape comes back, Tab leaves", () => {
    const a = actions();
    const log = [msg("a", MEMBER_ID, "2026-10-16T10:00:00Z"), msg("b", MOD_ID, "2026-10-16T10:10:00Z"), msg("c", MEMBER_ID, "2026-10-16T10:20:00Z")];
    render(
      <Pulse>
        <Log messages={log} a={a} />
      </Pulse>,
    );
    const rows = screen.getAllByTestId("message");
    // Only the newest message is in the tab order.
    expect(rows.map((r) => r.tabIndex)).toEqual([-1, -1, 0]);
    const region = screen.getByRole("log");
    expect(region).toHaveAttribute("aria-live", "polite");

    act(() => rows[2].focus());
    // Moving through the log: new messages aren't announced over what you're reading.
    expect(region).toHaveAttribute("aria-live", "off");
    fireEvent.keyDown(rows[2], { key: "ArrowUp" });
    expect(rows[1]).toHaveFocus();
    expect(rows.map((r) => r.tabIndex)).toEqual([-1, 0, -1]);
    fireEvent.keyDown(rows[1], { key: "Home" });
    expect(rows[0]).toHaveFocus();
    fireEvent.keyDown(rows[0], { key: "ArrowUp" });
    expect(rows[0]).toHaveFocus();
    fireEvent.keyDown(rows[0], { key: "End" });
    expect(rows[2]).toHaveFocus();

    // Enter (or →) goes into the action row; Escape returns to the message.
    fireEvent.keyDown(rows[2], { key: "Enter" });
    const reply = within(rows[2]).getByRole("button", { name: "Reply" });
    expect(reply).toHaveFocus();
    fireEvent.keyDown(reply, { key: "Escape" });
    expect(rows[2]).toHaveFocus();
    fireEvent.keyDown(rows[2], { key: "ArrowRight" });
    expect(reply).toHaveFocus();
    fireEvent.click(reply);
    expect(a.onReply).toHaveBeenCalledWith(log[2]);

    // Tab and Shift+Tab on a message leave the log in one step.
    act(() => rows[2].focus());
    fireEvent.keyDown(rows[2], { key: "Tab" });
    expect(screen.getByRole("button", { name: "After" })).toHaveFocus();
    act(() => rows[2].focus());
    fireEvent.keyDown(rows[2], { key: "Tab", shiftKey: true });
    expect(screen.getByRole("button", { name: "Before" })).toHaveFocus();
    expect(region).toHaveAttribute("aria-live", "polite");
  });
});

describe("Pulse message row", () => {
  it("preserves an unsaved inline edit across shell switches", () => {
    const a = actions();
    const message = msg("m1", OWNER_ID, "2026-10-16T10:00:00Z");
    const tree = (shell: "classic" | "pulse") => <ShellKindContext.Provider value={shell}><ServerFixture members={members}><MessageItem message={message} grouped={false} replyTo={undefined} reactions={[]} meId={OWNER_ID} canModerate mentioned={false} editing setEditing={vi.fn()} actions={a} /></ServerFixture></ShellKindContext.Provider>;
    const { rerender } = render(tree("classic"));
    fireEvent.change(screen.getByRole("textbox", { name: "Edit message" }), { target: { value: "Unsent edit" } });
    rerender(tree("pulse"));
    expect(screen.getByRole("textbox", { name: "Edit message" })).toHaveValue("Unsent edit");
    rerender(tree("classic"));
    expect(screen.getByRole("textbox", { name: "Edit message" })).toHaveValue("Unsent edit");
  });

  function renderRow(props: Partial<Parameters<typeof MessageItem>[0]> = {}) {
    const a = actions();
    render(
      <Pulse>
        <MessageItem message={msg("m1", MEMBER_ID, "2026-10-16T10:00:00Z", { content: "Tara **ranked**", edited_at: "2026-10-16T10:01:00Z", pinned: true })} grouped={false} replyTo={undefined} reactions={[]} meId={OWNER_ID} canModerate mentioned={false} editing={false} setEditing={vi.fn()} actions={a} {...props} />
      </Pulse>,
    );
    return a;
  }

  it("puts the author and time in the margin and labels edited and pinned in words", () => {
    renderRow();
    const row = screen.getByTestId("message");
    const margin = row.querySelector("[data-message-margin]") as HTMLElement;
    expect(within(margin).getByText("Juan")).toBeInTheDocument();
    expect(margin.querySelector("time")).not.toBeNull();
    expect(within(row).getByText("ranked").tagName).toBe("STRONG");
    // The row's name is plain text: who, when, what (no raw markdown).
    expect(row).toHaveAccessibleName(/^Juan, \d{1,2}:\d{2}\s?[AP]M: Tara ranked$/);
    expect(within(row).getByText("Edited")).toBeInTheDocument();
    expect(within(row).getByText("Pinned")).toBeInTheDocument();
    // No Classic floating toolbar.
    expect(row.querySelector(".message-toolbar")).toBeNull();
  });

  it("shares the margin when grouped: no repeated name", () => {
    renderRow({ grouped: true });
    const margin = screen.getByTestId("message").querySelector("[data-message-margin]") as HTMLElement;
    expect(within(margin).queryByText("Juan")).toBeNull();
    expect(margin.querySelector("time")).not.toBeNull();
  });

  it("opens the action row from the margin's quiet button (never by hover alone) and focuses Reply", () => {
    renderRow();
    const row = screen.getByTestId("message");
    const open = within(row.querySelector("[data-message-margin]") as HTMLElement).getByRole("button", { name: "Message actions" });
    expect(open).toHaveAttribute("tabindex", "-1");
    expect(row).not.toHaveAttribute("data-actions");
    fireEvent.click(open);
    expect(row).toHaveAttribute("data-actions", "open");
    expect(within(screen.getByRole("toolbar", { name: "Message actions" })).getByRole("button", { name: "Reply" })).toHaveFocus();
  });

  it("has an inline, labelled action row: Reply, React, Thread and More…", () => {
    const a = renderRow();
    const bar = screen.getByRole("toolbar", { name: "Message actions" });
    expect(within(bar).getAllByRole("button").map((b) => b.textContent?.trim() || b.getAttribute("aria-label"))).toEqual(["Reply", "React", "Thread", "More…"]);
    // One Tab stop inside the row.
    expect(within(bar).getAllByRole("button").filter((b) => b.tabIndex === 0)).toHaveLength(1);
    fireEvent.click(within(bar).getByRole("button", { name: "Thread" }));
    expect(a.onOpenThread).toHaveBeenCalled();

    // More… opens the same menu as right-click, with the moderator's actions.
    const more = within(bar).getByRole("button", { name: "More…" });
    expect(more).toHaveAttribute("aria-haspopup", "menu");
    fireEvent.click(more);
    const menu = screen.getByRole("menu", { name: "Message options" });
    expect(more).toHaveAttribute("aria-expanded", "true");
    expect(within(menu).getByRole("menuitem", { name: "Unpin message" })).toBeInTheDocument();
    fireEvent.click(within(menu).getByRole("menuitem", { name: "Unpin message" }));
    expect(a.onPin).toHaveBeenCalledWith("m1", false);
  });

  it("names mentions and replies in words, the reply as a ticket stub", () => {
    const original = msg("m0", MOD_ID, "2026-10-16T09:00:00Z", { content: "Sino sasama?" });
    renderRow({ mentioned: true, message: msg("m1", MEMBER_ID, "2026-10-16T10:00:00Z", { content: "@kapitan ako!", reply_to_id: "m0" }), replyTo: original });
    const row = screen.getByTestId("message");
    expect(row).toHaveAccessibleName(/^Juan \(mentions you\), \d{1,2}:\d{2}\s?[AP]M: @kapitan ako!$/);
    const stub = row.querySelector("[data-reply-stub]") as HTMLElement;
    expect(stub).toHaveTextContent("MariaSino sasama?");
    expect(stub.className).toContain("border-dashed");
  });

  it("keeps Classic exactly as it was outside Pulse", () => {
    render(
      <ServerFixture members={members}>
        <MessageItem message={msg("m1", MEMBER_ID, "2026-10-16T10:00:00Z")} grouped={false} replyTo={undefined} reactions={[]} meId={OWNER_ID} canModerate={false} mentioned={false} editing={false} setEditing={vi.fn()} actions={actions()} />
      </ServerFixture>,
    );
    const row = screen.getByTestId("message");
    expect(row.querySelector(".message-toolbar")).not.toBeNull();
    expect(row).not.toHaveAttribute("tabindex");
    expect(row.className).toContain("message-row");
  });
});

describe("Pulse compose dock", () => {
  URL.createObjectURL = vi.fn(() => "blob:preview");
  URL.revokeObjectURL = vi.fn();
  function renderDock(overrides: Record<string, unknown> = {}) {
    const props = { channelName: "general", serverId: "s", channelId: "c", replyTo: null, onCancelReply: vi.fn(), onSend: vi.fn(async () => "sent" as const), onEditLast: vi.fn(), typingNames: [] as string[], onTyping: vi.fn(), onStopTyping: vi.fn(), ...overrides };
    render(
      <Pulse>
        <Composer {...props} />
      </Pulse>,
    );
    return props;
  }

  it("keeps the keyboard: Enter sends, Shift+Enter is a newline, ↑ edits the last, Escape cancels the reply", async () => {
    const props = renderDock({ replyTo: msg("m0", MOD_ID, "2026-10-16T09:00:00Z", { content: "Sino sasama?" }) });
    const box = screen.getByTestId("composer");
    fireEvent.keyDown(box, { key: "ArrowUp" });
    expect(props.onEditLast).toHaveBeenCalled();
    fireEvent.keyDown(box, { key: "Escape" });
    expect(props.onCancelReply).toHaveBeenCalled();
    fireEvent.change(box, { target: { value: "Ako" } });
    expect(props.onTyping).toHaveBeenCalled();
    fireEvent.keyDown(box, { key: "Enter", shiftKey: true });
    expect(props.onSend).not.toHaveBeenCalled();
    fireEvent.keyDown(box, { key: "Enter" });
    await vi.waitFor(() => expect(props.onSend).toHaveBeenCalledWith("Ako", [], "m0"));
  });

  it("shows the reply stub, the typing line, the tools in order and a Send pill with its key", () => {
    renderDock({ replyTo: msg("m0", MOD_ID, "2026-10-16T09:00:00Z", { content: "Sino sasama?" }), typingNames: ["Juan"], onSticker: vi.fn(), schedulable: true });
    expect(document.querySelector("[data-reply-stub]")).toHaveTextContent("Replying to Maria · Sino sasama?");
    expect(screen.getByTestId("typing-line")).toHaveTextContent("Juan is typing…");
    const tools = within(screen.getByTestId("composer-tools")).getAllByRole("button").map((b) => b.getAttribute("aria-label"));
    // (Voice notes hide where the browser can't record, as in jsdom.)
    expect(tools).toEqual(["Attach files", "Send a GIF", "Insert icon", "Send a sticker", "Schedule message", "Send message"]);
    const send = screen.getByRole("button", { name: "Send message" });
    expect(send).toBeDisabled();
    expect(send).toHaveTextContent("Send");
    expect(send.querySelector("kbd")).not.toBeNull();
    // 16 px on phones so iOS doesn't zoom.
    expect(screen.getByTestId("composer").className).toContain("text-base");
  });

  it("keeps the gates: no files in a temporary hangout, slow mode, and the locked notice", () => {
    renderDock({ uploads: false, slowmodeSeconds: 30, cooldownUntil: Date.now() + 10_000 });
    expect(screen.queryByRole("button", { name: "Attach files" })).toBeNull();
    expect(screen.getByTestId("slowmode-indicator")).toHaveTextContent(/Slow mode: \d+s/);
    expect(screen.getByRole("button", { name: "Send a GIF" })).toBeDisabled();
  });

  it("replaces the dock with the lock notice", () => {
    renderDock({ locked: "Only admins can post here.", lockKind: "read-only" });
    expect(screen.queryByTestId("composer")).toBeNull();
    expect(screen.getByTestId("composer-locked")).toHaveTextContent("Only admins can post here.");
  });
});
