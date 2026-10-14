import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase } from "../fixtures/fake-supabase";
import { MEMBER_ID, OWNER_ID, SERVER_ID, ServerFixture, makeMember } from "../fixtures/server";
import { ConfirmHost } from "@/components/ui/ConfirmHost";

const tables: Record<string, unknown[]> = {};
let fake = createFakeSupabase(tables);
vi.mock("@/components/providers/RuntimeConfig", () => ({ useSupabase: () => fake.client, useOptionalSupabase: () => fake.client }));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }) }));

const { EventsButton } = await import("@/components/server/EventsButton");
const VOICE = "20000000-0000-4000-8000-000000000003";
const members = [makeMember(OWNER_ID, "Kapitan", "admin"), makeMember(MEMBER_ID, "Juan", "member")];
const iso = (minutes: number) => new Date(Date.now() + minutes * 60_000).toISOString();

beforeEach(() => {
  tables.server_events = [
    { id: "e1", server_id: SERVER_ID, channel_id: VOICE, location: null, name: "Game night", description: "Valorant 5-stack", starts_at: iso(-30), ends_at: null, created_by: OWNER_ID, created_at: iso(-60) },
    { id: "e2", server_id: SERVER_ID, channel_id: null, location: "SM North", name: "Meetup", description: "", starts_at: iso(60 * 24), ends_at: null, created_by: OWNER_ID, created_at: iso(-60) },
    { id: "e0", server_id: SERVER_ID, channel_id: null, location: "Old", name: "Last week", description: "", starts_at: iso(-60 * 24 * 7), ends_at: null, created_by: OWNER_ID, created_at: iso(-60 * 24 * 8) },
  ];
  tables.event_rsvps = [{ event_id: "e1", server_id: SERVER_ID, user_id: OWNER_ID }];
  fake = createFakeSupabase(tables);
});

function mockWrites(result: { data: { id: string } | null; error: null | { code: string } }) {
  const from = vi.mocked(fake.client.from);
  const read = from.getMockImplementation()! as (table: string) => ReturnType<typeof fake.client.from>;
  const chain = {
    eq: vi.fn(() => chain), is: vi.fn(() => chain), select: vi.fn(() => chain),
    maybeSingle: vi.fn(async () => result),
  };
  const update = vi.fn((values: unknown) => { void values; return chain; }), remove = vi.fn(() => chain);
  from.mockImplementation((table: string) => ({ ...read(table), update, delete: remove }) as never);
  return { update, remove, chain };
}

describe("events", () => {
  it("shows LIVE, lists what's not over with interest counts, and lets members join a live voice event", async () => {
    const user = userEvent.setup();
    render(
      <ServerFixture members={members} meId={MEMBER_ID} myRole="member">
        <EventsButton />
      </ServerFixture>,
    );
    const button = await screen.findByTestId("events-button");
    await waitFor(() => expect(button).toHaveTextContent("LIVE"));
    await user.click(button);
    const list = await screen.findByTestId("events-list");
    const items = within(list).getAllByRole("listitem");
    expect(items.map((li) => within(li).getByText(/Game night|Meetup/).textContent)).toEqual(["Game night", "Meetup"]);
    expect(within(items[0]).getByText("Happening now")).toBeInTheDocument();
    expect(within(items[0]).getByRole("button", { name: /Interested · 1/ })).toHaveAttribute("aria-pressed", "false");
    expect(within(items[0]).getByRole("link", { name: "Join" })).toHaveAttribute("href", `/tambayan/${SERVER_ID}/${VOICE}`);
    expect(within(items[1]).getByText("SM North")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Create Event/ })).toBeNull();
  });

  it("lets moderators schedule and cancel", async () => {
    const user = userEvent.setup();
    render(
      <ServerFixture members={members} meId={OWNER_ID} myRole="admin">
        <EventsButton />
      </ServerFixture>,
    );
    await user.click(await screen.findByTestId("events-button"));
    expect(await screen.findByRole("button", { name: "Cancel Game night" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Create Event/ }));
    expect(await screen.findByLabelText("Event topic")).toBeInTheDocument();
  });

  it("recovers missed deletions while open without polling hidden or closed views", async () => {
    render(<ServerFixture members={members}><EventsButton /></ServerFixture>);
    const button = screen.getByTestId("events-button");
    await waitFor(() => expect(button).toHaveTextContent("LIVE"));
    vi.useFakeTimers();
    try {
      fireEvent.click(button);
      await act(async () => { await Promise.resolve(); });
      expect(screen.getByTestId("events-list")).toHaveTextContent("Meetup");
      tables.server_events = tables.server_events.filter((event) => (event as { id: string }).id !== "e2");
      await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
      expect(screen.getByTestId("events-list")).not.toHaveTextContent("Meetup");
      const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
      const calls = fake.client.from.mock.calls.length;
      await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
      expect(fake.client.from.mock.calls).toHaveLength(calls);
      visibility.mockRestore();
      fireEvent.click(screen.getByRole("button", { name: "Close" }));
      await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
      expect(fake.client.from.mock.calls).toHaveLength(calls);
    } finally { vi.useRealTimers(); }
  });

  it.each(["conflict", "network"])("preserves moderator edits after a %s failure", async (failure) => {
    const writes = mockWrites({ data: null, error: null });
    if (failure === "network") writes.chain.maybeSingle.mockRejectedValue(new TypeError("Failed to fetch"));
    const user = userEvent.setup();
    render(<ServerFixture members={members}><EventsButton /></ServerFixture>);
    await user.click(await screen.findByTestId("events-button"));
    await user.click(await screen.findByRole("button", { name: "Edit Meetup" }));
    const topic = screen.getByLabelText("Event topic");
    await user.clear(topic); await user.type(topic, "Updated meetup");
    await user.click(screen.getByRole("button", { name: "Save event" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(failure === "conflict" ? "event changed" : "Couldn’t save");
    expect(topic).toHaveValue("Updated meetup");
    expect(writes.update).toHaveBeenCalledOnce();
    expect(writes.chain.eq).toHaveBeenCalledWith("name", "Meetup");
    expect(writes.chain.is).toHaveBeenCalledWith("channel_id", null);
  });

  it("allows editing a live event without altering its start time or creator", async () => {
    const writes = mockWrites({ data: { id: "e1" }, error: null });
    const user = userEvent.setup();
    render(<ServerFixture members={members}><EventsButton /></ServerFixture>);
    await user.click(await screen.findByTestId("events-button"));
    await user.click(await screen.findByRole("button", { name: "Edit Game night" }));
    await user.type(screen.getByLabelText("Description"), " — bring friends");
    await user.click(screen.getByRole("button", { name: "Save event" }));
    await waitFor(() => expect(screen.queryByLabelText("Event topic")).toBeNull());
    expect(writes.update.mock.calls[0][0]).toMatchObject({ starts_at: (tables.server_events[0] as { starts_at: string }).starts_at });
    expect(writes.update.mock.calls[0][0]).not.toHaveProperty("created_by");
  });

  it("requires confirmation before removing an event and its RSVPs", async () => {
    const writes = mockWrites({ data: { id: "e1" }, error: null });
    const user = userEvent.setup();
    render(<ServerFixture members={members}><EventsButton /><ConfirmHost /></ServerFixture>);
    await user.click(await screen.findByTestId("events-button"));
    await user.click(await screen.findByRole("button", { name: "Cancel Game night" }));
    expect(writes.remove).not.toHaveBeenCalled();
    expect(screen.getByText("This removes the event and everyone’s RSVPs.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cancel event" }));
    await waitFor(() => expect(writes.remove).toHaveBeenCalledOnce());
    expect(writes.chain.eq).toHaveBeenCalledWith("id", "e1");
  });
});
