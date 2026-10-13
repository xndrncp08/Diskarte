import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase } from "../fixtures/fake-supabase";
import { MEMBER_ID, OWNER_ID, ServerFixture, channels, makeMember } from "../fixtures/server";

const tables: Record<string, unknown[]> = {};
const fake = createFakeSupabase(tables);
vi.mock("@/components/providers/RuntimeConfig", () => ({ useSupabase: () => fake.client, useOptionalSupabase: () => fake.client }));
vi.mock("sonner", async () => (await import("../mocks/actions")).toastMock);
const { CreatePollButton, PollCard, pollTimeLeft } = await import("@/components/chat/Poll");

const POLL = "80000000-0000-4000-8000-000000000001";
const CHANNEL = channels[0].id;
const members = [makeMember(OWNER_ID, "Kapitan", "admin"), makeMember(MEMBER_ID, "Juan", "member")];
const shell = (ui: React.ReactNode) => render(<ServerFixture members={members}>{ui}</ServerFixture>);

beforeEach(() => {
  tables.polls = [{ message_id: POLL, channel_id: CHANNEL, options: ["Jollibee", "Mang Inasal"], multi: false, ends_at: new Date(Date.now() + 4.5 * 3_600_000).toISOString() }];
  tables.poll_votes = [{ message_id: POLL, channel_id: CHANNEL, user_id: MEMBER_ID, option: 1 }];
  vi.mocked(fake.client.rpc).mockReset();
  vi.mocked(fake.client.rpc).mockImplementation((async () => ({ data: null, error: null })) as never);
});

describe("polls", () => {
  it("creates a poll from the composer", async () => {
    const user = userEvent.setup();
    shell(<CreatePollButton channelId={CHANNEL} />);
    await user.click(screen.getByRole("button", { name: "Create poll" }));
    const dialog = await screen.findByRole("dialog", { name: "Create a poll" });
    await user.type(within(dialog).getByLabelText("Question"), "Saan tayo kakain?");
    await user.type(within(dialog).getByLabelText("Answer 1"), "Jollibee");
    await user.type(within(dialog).getByLabelText("Answer 2"), "Mang Inasal");
    await user.click(within(dialog).getByRole("button", { name: /Add another answer/ }));
    await user.type(within(dialog).getByLabelText("Answer 3"), "Chowking");
    await user.click(within(dialog).getByRole("switch", { name: "Allow multiple answers" }));
    await user.click(within(dialog).getByRole("button", { name: "Post" }));
    await waitFor(() =>
      expect(fake.client.rpc).toHaveBeenCalledWith("create_poll", { p_channel: CHANNEL, p_question: "Saan tayo kakain?", p_options: ["Jollibee", "Mang Inasal", "Chowking"], p_multi: true, p_hours: 24 }),
    );
  });

  it("votes, then shows results with shares", async () => {
    const user = userEvent.setup();
    shell(<PollCard messageId={POLL} channelId={CHANNEL} />);
    const answers = await screen.findByRole("group", { name: "Poll answers" });
    expect(answers).not.toHaveTextContent("%"); // results hidden until you vote
    vi.mocked(fake.client.rpc).mockImplementationOnce((async () => {
      tables.poll_votes = [...tables.poll_votes, { message_id: POLL, channel_id: CHANNEL, user_id: OWNER_ID, option: 0 }];
      return { data: null, error: null };
    }) as never);
    await user.click(within(answers).getByRole("button", { name: /Jollibee/ }));
    expect(fake.client.rpc).toHaveBeenCalledWith("vote_poll", { p_message: POLL, p_options: [0] });
    await waitFor(() => expect(within(answers).getByRole("button", { name: /Jollibee/ })).toHaveTextContent("1 · 50%"));
    expect(screen.getByTestId("poll")).toHaveTextContent(/2 votes · 4h left/);
    expect(screen.getByRole("button", { name: "Remove vote" })).toBeInTheDocument();
  });

  it("collects several answers before voting when multiple are allowed", async () => {
    const user = userEvent.setup();
    tables.polls = [{ ...(tables.polls[0] as object), multi: true }];
    shell(<PollCard messageId={POLL} channelId={CHANNEL} />);
    const answers = await screen.findByRole("group", { name: "Poll answers" });
    await user.click(within(answers).getByRole("button", { name: /Jollibee/ }));
    await user.click(within(answers).getByRole("button", { name: /Mang Inasal/ }));
    await user.click(screen.getByRole("button", { name: "Vote" }));
    expect(fake.client.rpc).toHaveBeenCalledWith("vote_poll", { p_message: POLL, p_options: [0, 1] });
  });

  it("says how long is left", () => {
    const now = Date.parse("2026-10-13T00:00:00Z");
    expect(pollTimeLeft("2026-10-15T01:00:00Z", now)).toBe("2d left");
    expect(pollTimeLeft("2026-10-13T05:30:00Z", now)).toBe("5h left");
    expect(pollTimeLeft("2026-10-13T00:10:00Z", now)).toBe("10m left");
    expect(pollTimeLeft("2026-10-12T00:00:00Z", now)).toBe("Poll closed");
  });
});
