import { act, render, renderHook, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase } from "../fixtures/fake-supabase";
import { OWNER_ID, SERVER_ID, makeProfile, server } from "../fixtures/server";

const fake = createFakeSupabase({});
vi.mock("@/components/providers/RuntimeConfig", () => ({ useSupabase: () => fake.client, useOptionalSupabase: () => fake.client }));

const { UnreadsProvider, useOptionalUnreads, useChannelUnread } = await import("@/components/providers/UnreadsProvider");
const { MeProvider } = await import("@/components/providers/MeProvider");
const { ServerRail } = await import("@/components/shell/ServerRail");

const GENERAL = "20000000-0000-4000-8000-000000000001";
const CHIKA = "20000000-0000-4000-8000-000000000002";
const old = "2026-10-01T00:00:00Z";
const recent = "2026-10-12T00:00:00Z";

function rows(mentions = 2) {
  return [
    { channel_id: GENERAL, server_id: SERVER_ID, last_message_at: old, read_at: recent, mentions: 0 },
    { channel_id: CHIKA, server_id: SERVER_ID, last_message_at: recent, read_at: old, mentions },
  ];
}

const wrapper = ({ children }: { children: ReactNode }) => (
  <MeProvider profile={makeProfile(OWNER_ID, "Kapitan")}>
    <UnreadsProvider>{children}</UnreadsProvider>
  </MeProvider>
);

beforeEach(() => {
  vi.mocked(fake.client.rpc).mockImplementation((async (fn: string) => (fn === "my_unreads" ? { data: rows(), error: null } : { data: null, error: null })) as never);
});

describe("unreads", () => {
  it("loads unread channels and mentions, and reading clears them (a refresh racing the receipt keeps them read)", async () => {
    const { result } = renderHook(() => ({ ctx: useOptionalUnreads()!, chika: useChannelUnread(CHIKA), general: useChannelUnread(GENERAL) }), { wrapper });
    await waitFor(() => expect(result.current.chika).toEqual({ unread: true, mentions: 2 }));
    expect(result.current.general.unread).toBe(false);
    act(() => result.current.ctx.markRead(CHIKA));
    expect(result.current.chika).toEqual({ unread: false, mentions: 0 });
    // The server hasn't saved the read yet: the next poll still says unread, but we keep our read mark.
    vi.mocked(fake.client.rpc).mockImplementation((async () => ({ data: rows(0), error: null })) as never);
    await act(async () => result.current.ctx.refresh());
    expect(result.current.chika.unread).toBe(false);
  });

  it("turns a channel unread when the open server reports new activity", async () => {
    const { result } = renderHook(() => ({ ctx: useOptionalUnreads()!, general: useChannelUnread(GENERAL) }), { wrapper });
    await waitFor(() => expect(result.current.ctx.channels.size).toBe(2));
    act(() => result.current.ctx.noteActivity(GENERAL, SERVER_ID, new Date(Date.now() + 1000).toISOString()));
    expect(result.current.general.unread).toBe(true);
  });

  it("shows the rail's unread pill and mention badge for the server", async () => {
    render(<ServerRail servers={[server]} />, { wrapper });
    const link = await screen.findByRole("link", { name: /2 mentions/ });
    expect(within(link).getByTestId("mention-badge")).toHaveTextContent("2");
  });

  it("shows nothing when the database can't answer (not migrated yet)", async () => {
    vi.mocked(fake.client.rpc).mockImplementation((async () => ({ data: null, error: { message: "function my_unreads does not exist" } })) as never);
    const { result } = renderHook(() => useChannelUnread(CHIKA), { wrapper });
    await waitFor(() => expect(fake.client.rpc).toHaveBeenCalled());
    expect(result.current).toEqual({ unread: false, mentions: 0 });
  });

  it("marks a whole server read, or everything, and keeps it read across a refresh", async () => {
    const { result } = renderHook(() => ({ ctx: useOptionalUnreads()!, chika: useChannelUnread(CHIKA) }), { wrapper });
    await waitFor(() => expect(result.current.chika).toEqual({ unread: true, mentions: 2 }));
    act(() => result.current.ctx.markAllRead(SERVER_ID));
    expect(result.current.chika).toEqual({ unread: false, mentions: 0 });
    expect(fake.client.rpc).toHaveBeenCalledWith("mark_all_read", { p_server: SERVER_ID });
    await act(async () => result.current.ctx.refresh());
    expect(result.current.chika.unread).toBe(false);
    act(() => result.current.ctx.markAllRead());
    expect(fake.client.rpc).toHaveBeenLastCalledWith("mark_all_read", {});
  });
});
