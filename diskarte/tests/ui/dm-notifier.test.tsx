import { act, render, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { makeProfile, OWNER_ID } from "../fixtures/server";
import { MeProvider } from "@/components/providers/MeProvider";
import type { ConversationSummary } from "@/lib/social";

const notify = vi.fn();
const latestMessage = vi.fn();
let conversations: ConversationSummary[] = [];
vi.mock("@/components/providers/SocialProvider", () => ({
  useOptionalSocial: () => ({ conversations }),
}));
vi.mock("@/components/providers/RuntimeConfig", () => ({
  useOptionalSupabase: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => ({ limit: () => ({ maybeSingle: latestMessage }) }),
        }),
      }),
    }),
  }),
}));
vi.mock("@/lib/notify-prefs", () => ({
  readNotifyPrefs: () => ({ dms: true }),
  desktopNotify: (...args: unknown[]) => notify(...args),
}));
const { DmNotifier } = await import("@/components/shell/DmNotifier");

const old = "2026-10-01T00:00:00Z";
const recent = "2026-10-16T12:00:00Z";
const wrap = () => (
  <MeProvider profile={makeProfile(OWNER_ID, "Me")}>
    <DmNotifier />
  </MeProvider>
);

describe("DM notification delivery", () => {
  it("rechecks read state when a message preview arrives after the conversation was read", async () => {
    conversations = [
      {
        id: "dm",
        kind: "direct",
        name: null,
        ownerId: null,
        others: [],
        lastMessageAt: old,
        lastReadAt: old,
      },
    ];
    const view = render(wrap());
    expect(notify).not.toHaveBeenCalled();
    let finish!: (value: unknown) => void;
    latestMessage.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    conversations = [{ ...conversations[0], lastMessageAt: recent }];
    view.rerender(wrap());
    await waitFor(() => expect(latestMessage).toHaveBeenCalledOnce());
    conversations = [{ ...conversations[0], lastReadAt: recent }];
    view.rerender(wrap());
    await act(async () =>
      finish({
        data: {
          id: "message",
          content: "hello",
          author_id: "friend",
          created_at: recent,
        },
      }),
    );
    expect(notify).not.toHaveBeenCalled();
  });
});

it("still delivers a new unread conversation message after suppressing initial history", async () => {
  notify.mockClear();
  latestMessage.mockClear();
  conversations = [
    {
      id: "dm",
      kind: "direct",
      name: null,
      ownerId: null,
      others: [],
      lastMessageAt: old,
      lastReadAt: old,
    },
  ];
  latestMessage.mockResolvedValue({
    data: {
      id: "fresh",
      content: "New kwento",
      author_id: "friend",
      created_at: recent,
    },
  });
  const view = render(wrap());
  expect(notify).not.toHaveBeenCalled();
  conversations = [{ ...conversations[0], lastMessageAt: recent }];
  view.rerender(wrap());
  await waitFor(() =>
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({ body: "New kwento", href: "/tambayan/dm/dm" }),
    ),
  );
});
