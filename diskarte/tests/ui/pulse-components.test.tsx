import { act, fireEvent, render, screen } from "@testing-library/react";
import { Settings } from "lucide-react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { PresenceDot } from "@/components/pulse/Avatar";
import { IconButton } from "@/components/pulse/Button";
import { Sheet } from "@/components/pulse/Dialog";
import { Tabs } from "@/components/pulse/Tabs";

const flushFrames = () => act(() => new Promise((resolve) => requestAnimationFrame(() => resolve(undefined))));

describe("Pulse Tabs", () => {
  function Harness() {
    const [tab, setTab] = useState("chat");
    return (
      <Tabs label="Space sections" value={tab} onChange={setTab} items={[{ id: "chat", label: "Chat" }, { id: "events", label: "Events" }, { id: "archive", label: "Archive", disabled: true }, { id: "members", label: "Members" }]}>
        <p>{`${tab} panel`}</p>
      </Tabs>
    );
  }

  it("keeps one tab stop and moves selection with arrows, Home and End, skipping disabled tabs", () => {
    render(<Harness />);
    const tab = (name: string) => screen.getByRole("tab", { name });
    expect(screen.getByRole("tablist", { name: "Space sections" })).toBeInTheDocument();
    expect(tab("Chat")).toHaveAttribute("aria-selected", "true");
    expect(screen.getAllByRole("tab").filter((t) => t.tabIndex === 0)).toEqual([tab("Chat")]);
    expect(screen.getByRole("tabpanel", { name: "Chat" })).toHaveTextContent("chat panel");

    tab("Chat").focus();
    fireEvent.keyDown(tab("Chat"), { key: "ArrowRight" });
    expect(tab("Events")).toHaveAttribute("aria-selected", "true");
    expect(tab("Events")).toHaveFocus();
    fireEvent.keyDown(tab("Events"), { key: "ArrowRight" });
    expect(tab("Members")).toHaveFocus(); // Archive is disabled
    fireEvent.keyDown(tab("Members"), { key: "ArrowRight" });
    expect(tab("Chat")).toHaveFocus(); // wraps
    fireEvent.keyDown(tab("Chat"), { key: "ArrowLeft" });
    expect(tab("Members")).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(tab("Members"), { key: "Home" });
    expect(tab("Chat")).toHaveFocus();
    fireEvent.keyDown(tab("Chat"), { key: "End" });
    expect(tab("Members")).toHaveFocus();
    expect(tab("Chat")).toHaveAttribute("aria-selected", "false");
    expect(tab("Chat").tabIndex).toBe(-1);
    expect(screen.getByRole("tabpanel", { name: "Members" })).toHaveTextContent("members panel");
  });
});

describe("Pulse Sheet", () => {
  function Harness() {
    const [open, setOpen] = useState(false);
    return (
      <>
        <button onClick={() => setOpen(true)}>Open context</button>
        <Sheet open={open} onClose={() => setOpen(false)} title="Context" description="People and pins">
          <button>First action</button>
          <button>Last action</button>
        </Sheet>
      </>
    );
  }

  it("is a labelled modal dialog that takes focus, traps Tab, closes on Escape and restores focus", async () => {
    render(<Harness />);
    const opener = screen.getByRole("button", { name: "Open context" });
    opener.focus();
    fireEvent.click(opener);
    const sheet = screen.getByRole("dialog", { name: "Context" });
    expect(sheet).toHaveAttribute("aria-modal", "true");
    expect(sheet).toHaveAccessibleDescription("People and pins");
    await flushFrames();
    expect(screen.getByRole("button", { name: "Close" })).toHaveFocus();

    screen.getByRole("button", { name: "Last action" }).focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(screen.getByRole("button", { name: "Close" })).toHaveFocus();

    fireEvent.keyDown(document, { key: "Escape" });
    await act(async () => {});
    expect(opener).toHaveFocus();
  });
});

describe("Pulse IconButton", () => {
  it("is named by its required label", () => {
    render(<IconButton label="Settings" icon={<Settings />} />);
    expect(screen.getByRole("button", { name: "Settings" })).toBeInTheDocument();
  });

  it("requires a label by type and reports an empty one", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      // @ts-expect-error `label` is required: an icon alone has no accessible name.
      render(<IconButton icon={<Settings />} />);
      render(<IconButton label=" " icon={<Settings />} />);
      expect(error).toHaveBeenCalledTimes(2);
      expect(error.mock.calls[0][0]).toMatch(/IconButton needs a non-empty `label`/);
    } finally {
      error.mockRestore();
    }
  });
});

describe("Pulse PresenceDot", () => {
  it("names the status and draws a different shape for each one, so it never rests on colour alone", () => {
    const statuses = ["online", "idle", "dnd", "offline"] as const;
    render(<>{statuses.map((s) => <PresenceDot key={s} status={s} />)}</>);
    const names = ["Online", "Idle", "Do Not Disturb", "Offline"];
    const shapes = names.map((name) => screen.getByRole("img", { name }).querySelector("path")?.getAttribute("d"));
    expect(new Set(shapes).size).toBe(statuses.length);
  });
});
