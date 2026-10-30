import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase } from "../fixtures/fake-supabase";

const CHANNEL = "20000000-0000-4000-8000-000000000001";
const tables: Record<string, unknown[]> = {};
let fake = createFakeSupabase(tables);
vi.mock("@/components/providers/RuntimeConfig", () => ({ useSupabase: () => fake.client, useOptionalSupabase: () => fake.client }));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }) }));

const { ScheduleButton, ScheduledBar, ScheduledPublisher } = await import("@/components/chat/ScheduledMessages");
const iso = (minutes: number) => new Date(Date.now() + minutes * 60_000).toISOString();

beforeEach(() => {
  tables.scheduled_messages = [];
  fake = createFakeSupabase(tables);
});

function withWrites() {
  const insert = vi.fn(async (_values: unknown) => { void _values; return { error: null }; });
  const eq = vi.fn(async () => ({ error: null }));
  const read = fake.client.from.getMockImplementation()!;
  fake.client.from.mockImplementation((table) => ({ ...read(table), insert, delete: () => ({ eq }) }) as never);
  return { insert, eq };
}

describe("scheduled messages", () => {
  it("schedules the draft for a quick time and clears it", async () => {
    const { insert } = withWrites();
    const onScheduled = vi.fn();
    const user = userEvent.setup();
    render(<ScheduleButton channelId={CHANNEL} content="Kain na tayo!" disabled={false} onScheduled={onScheduled} />);
    await user.click(screen.getByRole("button", { name: "Schedule message" }));
    const dialog = await screen.findByRole("dialog", { name: "Schedule message" });
    expect(dialog).toHaveTextContent("Kain na tayo!");
    const before = Date.now();
    await user.click(within(dialog).getByRole("button", { name: "In 1 hour" }));
    await waitFor(() => expect(onScheduled).toHaveBeenCalled());
    const row = insert.mock.calls[0][0] as { channel_id: string; content: string; send_at: string };
    expect(row).toMatchObject({ channel_id: CHANNEL, content: "Kain na tayo!" });
    const at = new Date(row.send_at).getTime();
    expect(at).toBeGreaterThanOrEqual(before + 59 * 60_000);
    expect(at).toBeLessThanOrEqual(Date.now() + 61 * 60_000);
  });

  it("lists my pending and failed messages for the channel and cancels one", async () => {
    tables.scheduled_messages = [
      { id: "s1", channel_id: CHANNEL, content: "Later na", send_at: iso(60), failed_reason: null },
      { id: "s2", channel_id: CHANNEL, content: "Hindi naipadala", send_at: iso(-5), failed_reason: "TIMED_OUT" },
      { id: "s3", channel_id: "elsewhere", content: "Other channel", send_at: iso(30), failed_reason: null },
    ];
    fake = createFakeSupabase(tables);
    const { eq } = withWrites();
    const user = userEvent.setup();
    render(<ScheduledBar channelId={CHANNEL} />);
    const bar = await screen.findByTestId("scheduled-bar");
    expect(bar).toHaveTextContent("2 scheduled messages");
    expect(bar).toHaveTextContent("1 couldn't send");
    await user.click(within(bar).getByRole("button", { expanded: false }));
    const list = within(bar).getByRole("list", { name: "Scheduled messages" });
    expect(list).toHaveTextContent("Couldn't send (timed out)");
    expect(list).not.toHaveTextContent("Other channel");
    await user.click(within(list).getByRole("button", { name: "Cancel scheduled message" }));
    expect(eq).toHaveBeenCalledWith("id", "s1");
  });

  it("publishes once my earliest message is due", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      tables.scheduled_messages = [{ id: "s1", channel_id: CHANNEL, content: "x", send_at: iso(1), failed_reason: null }];
      fake = createFakeSupabase(tables);
      render(<ScheduledPublisher />);
      await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
      expect(fake.client.rpc).not.toHaveBeenCalled();
      await act(async () => { await vi.advanceTimersByTimeAsync(31_000); });
      expect(fake.client.rpc).toHaveBeenCalledWith("publish_scheduled_messages");
    } finally {
      vi.useRealTimers();
    }
  });
});
