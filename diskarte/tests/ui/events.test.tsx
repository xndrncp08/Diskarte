import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase } from "../fixtures/fake-supabase";
import { MEMBER_ID, OWNER_ID, SERVER_ID, ServerFixture, makeMember } from "../fixtures/server";

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
});
