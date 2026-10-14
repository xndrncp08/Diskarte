import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { navigation } from "../mocks/navigation";
import { MOD_ID, MEMBER_ID, OWNER_ID, ServerFixture } from "../fixtures/server";
import { RuntimeConfigProvider } from "@/components/providers/RuntimeConfig";
import { CallProvider } from "@/components/voice/CallProvider";
import { PresenceProvider } from "@/components/providers/PresenceProvider";

vi.mock("@/actions/messages", async () => (await import("../mocks/actions")).messageActions);
vi.mock("@/actions/servers", async () => (await import("../mocks/actions")).serverActions);
vi.mock("@/actions/profile", async () => (await import("../mocks/actions")).profileActions);
vi.mock("sonner", async () => (await import("../mocks/actions")).toastMock);
vi.mock("@/components/providers/SocialProvider", () => ({ useOptionalSocial: () => null, useSocial: () => ({ conversations: [], friends: [], profiles: new Map(), nicknames: new Map(), markRead: () => undefined, reloadConversations: async () => undefined }) }));

const { DiskarteLayout, GENERAL, MEMBERS, RUNTIME, channelUrl, messageFixture } = await import("../fixtures/layout");
const { DmView } = await import("@/components/social/DmView");

function history(count: number) {
  return {
    [GENERAL.id]: Array.from({ length: count }, (_, i) => messageFixture(`m${String(i).padStart(5, "0")}`, GENERAL.id, i % 2 ? MOD_ID : MEMBER_ID, `Message #${i}`, (count - i) * 3)),
  };
}

describe("message list virtualization", () => {
  it("mounts only a window of rows for thousands of messages", () => {
    navigation.set(channelUrl(GENERAL.id));
    const started = performance.now();
    render(<DiskarteLayout history={history(5000)} />);
    const elapsed = performance.now() - started;
    const rendered = screen.getAllByTestId("message");
    expect(rendered.length).toBeGreaterThan(5);
    expect(rendered.length).toBeLessThan(60);
    const rows = screen.getByTestId("message-rows");
    // The spacer reserves height for every message so the scrollbar reflects the whole history.
    expect(parseFloat(rows.style.height)).toBeGreaterThan(5000 * 40);
    expect(Number(rows.dataset.rendered)).toBe(rendered.length);
    // Generous bound: rendering 5,000 un-virtualised messages takes several seconds in jsdom.
    expect(elapsed).toBeLessThan(3000);
    console.info(JSON.stringify({ benchmark: "channel-5000", mountedRows: rendered.length, renderMs: Math.round(elapsed) }));
  });

  it("renders every message when the history is short", () => {
    navigation.set(channelUrl(GENERAL.id));
    render(<DiskarteLayout history={history(8)} />);
    expect(screen.getAllByTestId("message")).toHaveLength(8);
  });

  it("keeps DM history windowed for 5,000 messages", () => {
    navigation.set("/tambayan/dm/conversation");
    const messages = Array.from({ length: 5000 }, (_, index) => ({ id: `dm${index}`, conversation_id: "conversation", author_id: index % 2 ? OWNER_ID : MEMBER_ID, content: `DM ${index}`, sticker: null, reply_to_id: null, edited_at: null, created_at: new Date(Date.UTC(2026, 9, 14, 0, 0, index)).toISOString() }));
    const started = performance.now();
    render(<RuntimeConfigProvider value={RUNTIME}><ServerFixture members={MEMBERS}><PresenceProvider><CallProvider><DmView servers={[]} conversation={{ id: "conversation", kind: "direct", name: null, owner_id: null, direct_key: null, created_at: "2026-10-14T00:00:00Z", last_message_at: "2026-10-14T00:00:00Z" }} participants={MEMBERS.map((m) => m.profile)} initial={{ messages, hasMore: false }} canSend /></CallProvider></PresenceProvider></ServerFixture></RuntimeConfigProvider>);
    const elapsed = performance.now() - started;
    const rendered = screen.getAllByTestId("message");
    expect(rendered.length).toBeGreaterThan(5); expect(rendered.length).toBeLessThan(60);
    expect(elapsed).toBeLessThan(3000);
    console.info(JSON.stringify({ benchmark: "dm-5000", mountedRows: rendered.length, renderMs: Math.round(elapsed) }));
  });
});
