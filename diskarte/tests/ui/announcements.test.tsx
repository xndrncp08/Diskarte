import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase } from "../fixtures/fake-supabase";
import { OWNER_ID, SERVER_ID, ServerFixture, channels, makeMember } from "../fixtures/server";

const tables: Record<string, unknown[]> = {};
let fake = createFakeSupabase(tables);
vi.mock("@/components/providers/RuntimeConfig", () => ({ useSupabase: () => fake.client, useOptionalSupabase: () => fake.client }));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }) }));

const { AnnouncementsPanel, describeSchedule } = await import("@/components/server/settings/AnnouncementsPanel");
const text = channels.find((c) => c.type === "text")!;

beforeEach(() => {
  tables.server_announcements = [
    { id: "a1", server_id: SERVER_ID, channel_id: text.id, content: "Game night!", weekday: 5, at_time: "21:00:00", time_zone: "Asia/Manila", enabled: true, next_run_at: "2026-10-30T13:00:00Z", last_run_at: null, last_error: "TIMED_OUT", created_by: OWNER_ID, created_at: "2026-10-29T00:00:00Z" },
  ];
  fake = createFakeSupabase(tables);
});

describe("recurring announcements", () => {
  it("describes schedules in plain words", () => {
    expect(describeSchedule(null, "09:00:00")).toMatch(/^Every day at 9:00\sAM$/);
    expect(describeSchedule(1, "21:30")).toMatch(/^Every Monday at 9:30\sPM$/);
  });

  it("lists announcements with their schedule and last failure, and adds a weekly one", async () => {
    const insert = vi.fn(async (_row: unknown) => { void _row; return { error: null }; });
    const read = fake.client.from.getMockImplementation()!;
    fake.client.from.mockImplementation((table) => ({ ...read(table), insert }) as never);
    const user = userEvent.setup();
    render(<ServerFixture members={[makeMember(OWNER_ID, "Kapitan", "admin")]}><AnnouncementsPanel /></ServerFixture>);
    const list = await screen.findByRole("list", { name: "Announcements" });
    expect(list).toHaveTextContent(/Every Friday at 9:00\sPM \(Asia\/Manila\)/);
    expect(list).toHaveTextContent("Last run failed: timed out");

    await user.type(screen.getByLabelText("Message"), "Weekly check-in");
    await user.selectOptions(screen.getByLabelText("Repeat"), "1");
    await user.clear(screen.getByLabelText("Time"));
    await user.type(screen.getByLabelText("Time"), "08:30");
    await user.click(screen.getByRole("button", { name: "Add announcement" }));
    await waitFor(() =>
      expect(insert).toHaveBeenCalledWith(expect.objectContaining({ server_id: SERVER_ID, channel_id: text.id, content: "Weekly check-in", weekday: 1, at_time: "08:30", time_zone: expect.any(String) })),
    );
    expect(within(list).getByRole("switch", { name: /On/ })).toBeChecked();
  });
});
