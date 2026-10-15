import { fireEvent, render, screen } from "@testing-library/react";
import { forwardRef, useImperativeHandle } from "react";
import { describe, expect, it, vi } from "vitest";
import type { VirtualMessageListHandle } from "@/components/chat/VirtualMessageList";
import type { ChatMessage } from "../useChannelChat";
import { useConversationScroll } from "../useConversationScroll";
const row = (id: string, day: number) => ({ id, created_at: `2026-10-${String(day).padStart(2, "0")}T00:00:00Z` }) as ChatMessage;

describe("conversation reading anchors", () => {
  it("loads history until the saved message is available and restores its row offset", () => {
    const element = document.createElement("div");
    Object.defineProperties(element, { scrollHeight: { value: 2000 }, clientHeight: { value: 500 } }); element.scrollTop = 300;
    let loaded: ChatMessage[] = [];
    const scrollToAnchor = vi.fn((id: string) => loaded.some((m) => m.id === id));
    const loadOlder = vi.fn(async () => undefined);
    const List = forwardRef<VirtualMessageListHandle>(function List(_, ref) {
      useImperativeHandle(ref, () => ({ element, scrollToAnchor, scrollToBottom: vi.fn(), scrollToKey: () => false, readAnchor: () => ({ key: "anchor", offset: 12 }) }));
      return null;
    });
    function Harness({ rows, loading = false, hasMore = true }: { rows: ChatMessage[]; loading?: boolean; hasMore?: boolean }) {
      loaded = rows;
      const scroll = useConversationScroll("anchor-test:user:channel", rows, "user", loadOlder, hasMore, loading);
      return <><List ref={scroll.listRef} /><button onClick={scroll.onScroll}>Read older</button><span>{scroll.restoringHistory ? "Restoring" : "Ready"}</span></>;
    }
    const first = render(<Harness rows={[row("anchor", 1), row("latest", 5)]} />);
    fireEvent.click(screen.getByRole("button", { name: "Read older" })); first.unmount();
    const returned = render(<Harness rows={[row("latest", 5)]} />);
    expect(loadOlder).toHaveBeenCalledOnce(); expect(screen.getByText("Restoring")).toBeInTheDocument();
    returned.rerender(<Harness rows={[row("latest", 5)]} loading hasMore={false} />);
    expect(screen.getByText("Restoring")).toBeInTheDocument();
    returned.rerender(<Harness rows={[row("anchor", 1), row("latest", 5)]} hasMore={false} />);
    expect(scrollToAnchor).toHaveBeenLastCalledWith("anchor", 12);
    expect(screen.getByText("Ready")).toBeInTheDocument();
  });
});
