import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { navigation } from "../mocks/navigation";
import { MOD_ID, MEMBER_ID } from "../fixtures/server";

vi.mock("@/actions/messages", async () => (await import("../mocks/actions")).messageActions);
vi.mock("@/actions/servers", async () => (await import("../mocks/actions")).serverActions);
vi.mock("@/actions/profile", async () => (await import("../mocks/actions")).profileActions);
vi.mock("sonner", async () => (await import("../mocks/actions")).toastMock);

const { DiskarteLayout, GENERAL, channelUrl, messageFixture } = await import("../fixtures/layout");

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
  });

  it("renders every message when the history is short", () => {
    navigation.set(channelUrl(GENERAL.id));
    render(<DiskarteLayout history={history(8)} />);
    expect(screen.getAllByTestId("message")).toHaveLength(8);
  });
});
