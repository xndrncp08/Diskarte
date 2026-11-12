import { act, fireEvent, render, screen } from "@testing-library/react";
import { Settings } from "lucide-react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { AvatarStack, PresenceDot } from "@/components/pulse/Avatar";
import { IconButton } from "@/components/pulse/Button";
import { Kbd, SegmentedControl, Toolbar } from "@/components/pulse/Controls";
import { Sheet } from "@/components/pulse/Dialog";
import { Input } from "@/components/pulse/Field";
import { PulseMenuSkin } from "@/components/pulse/Menu";
import { BottomTabBar, NavItem } from "@/components/pulse/Nav";
import { Tabs } from "@/components/pulse/Tabs";
import { Menu } from "@/components/ui/Menu";

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

describe("Pulse Input", () => {
  it("keeps the disabled and invalid classes separate, and an error turns the edge alert", () => {
    render(<Input label="Email" defaultValue="juan@" error="Enter a full email address." />);
    const input = screen.getByRole("textbox", { name: "Email" });
    expect(input).toHaveAttribute("aria-invalid", "true");
    const classes = input.className.split(/\s+/);
    expect(classes).toContain("disabled:text-pulse-disabled");
    expect(classes).toContain("aria-[invalid=true]:border-pulse-alert");
  });
});

describe("PulseMenuSkin", () => {
  it("skins a Classic Menu rendered inside it, and the first keyboard open focuses the first row", async () => {
    render(
      <PulseMenuSkin>
        <Menu label="Space options" items={[{ label: "Invite", onSelect: () => {} }, { label: "Leave", danger: true, onSelect: () => {} }]} trigger={({ toggle }) => <button onClick={toggle}>Options</button>} />
      </PulseMenuSkin>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Options" }));
    await flushFrames();
    const invite = screen.getByRole("menuitem", { name: "Invite" });
    expect(invite).toHaveFocus();
    expect(invite.className).toMatch(/bg-pulse-selected/);
    expect(invite.className).not.toMatch(/shadow-\[inset/); // the global outline is the only focus shape
    expect(screen.getByRole("menu").className).toMatch(/bg-pulse-raised/);
  });
});

describe("Pulse NavItem", () => {
  it("marks the current page, says unread in words and names counts", () => {
    render(
      <ul>
        <li><NavItem href="/s/tambayan" label="Tambayan" current /></li>
        <li><NavItem href="/s/crew" label="Crew" unread /></li>
        <li><NavItem label="general" count={3} countLabel="mentions" live onClick={() => {}} /></li>
      </ul>,
    );
    expect(screen.getByRole("link", { name: "Tambayan" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Crew, unread" })).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("link", { name: "Crew, unread" }).querySelector("[data-unread]")).not.toBeNull();
    expect(screen.getByRole("button", { name: /general.*Live.*3 mentions/ })).toBeInTheDocument();
  });
});

describe("Pulse BottomTabBar", () => {
  it("is a labelled nav of links (not tabs) with the current one marked and badge counts named", () => {
    render(<BottomTabBar label="Main" items={[{ href: "/home", label: "Home", icon: <Settings />, current: true }, { href: "/dms", label: "Messages", icon: <Settings />, count: 3, countLabel: "unread messages" }]} />);
    const nav = screen.getByRole("navigation", { name: "Main" });
    expect(nav.querySelectorAll("a")).toHaveLength(2);
    expect(screen.queryByRole("tab")).toBeNull();
    expect(screen.getByRole("link", { name: "Home" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: /3 unread messages/ })).not.toHaveAttribute("aria-current");
  });
});

describe("Pulse SegmentedControl", () => {
  function Harness() {
    const [v, setV] = useState<"all" | "unread" | "mentions">("all");
    return <SegmentedControl label="Filter" value={v} onChange={setV} options={[{ value: "all", label: "All" }, { value: "unread", label: "Unread" }, { value: "mentions", label: "Mentions" }]} />;
  }

  it("is a radio group with one tab stop; arrows move and check, wrapping, Home and End jump", () => {
    render(<Harness />);
    const radio = (name: string) => screen.getByRole("radio", { name });
    expect(screen.getByRole("radiogroup", { name: "Filter" })).toBeInTheDocument();
    expect(screen.getAllByRole("radio").filter((r) => r.tabIndex === 0)).toEqual([radio("All")]);
    fireEvent.keyDown(radio("All"), { key: "ArrowRight" });
    expect(radio("Unread")).toHaveAttribute("aria-checked", "true");
    expect(radio("Unread")).toHaveFocus();
    fireEvent.keyDown(radio("Unread"), { key: "ArrowLeft" });
    fireEvent.keyDown(radio("All"), { key: "ArrowLeft" });
    expect(radio("Mentions")).toHaveAttribute("aria-checked", "true");
    fireEvent.keyDown(radio("Mentions"), { key: "Home" });
    expect(radio("All")).toHaveFocus();
    expect(radio("Mentions").tabIndex).toBe(-1);
  });
});

describe("Pulse Toolbar", () => {
  it("is one tab stop; arrows rove focus, skip disabled controls and remember the last one", () => {
    render(
      <Toolbar label="Formatting">
        <button>Bold</button>
        <button disabled>Link</button>
        <button>Italic</button>
      </Toolbar>,
    );
    const btn = (name: string) => screen.getByRole("button", { name });
    expect(screen.getByRole("toolbar", { name: "Formatting" })).toHaveAttribute("aria-orientation", "horizontal");
    expect(btn("Bold").tabIndex).toBe(0);
    expect(btn("Italic").tabIndex).toBe(-1);
    btn("Bold").focus();
    fireEvent.keyDown(btn("Bold"), { key: "ArrowRight" });
    expect(btn("Italic")).toHaveFocus();
    expect(btn("Italic").tabIndex).toBe(0);
    expect(btn("Bold").tabIndex).toBe(-1);
    fireEvent.keyDown(btn("Italic"), { key: "ArrowRight" });
    expect(btn("Bold")).toHaveFocus(); // wraps
    fireEvent.keyDown(btn("Bold"), { key: "End" });
    expect(btn("Italic")).toHaveFocus();
  });
});

describe("Pulse Kbd and AvatarStack", () => {
  it("names symbol keys in words", () => {
    render(<Kbd label="Enter">↵</Kbd>);
    expect(screen.getByText("Enter")).toHaveClass("sr-only");
    expect(screen.getByText("↵")).toHaveAttribute("aria-hidden");
  });

  it("names the people shown, who is speaking, and how many more", () => {
    const p = (name: string, speaking = false) => ({ display_name: name, avatar_url: null, avatar_preset: "araw", speaking });
    render(<AvatarStack max={3} people={[p("Juan", true), p("Maria"), p("Andres"), p("Tala"), p("Lapu")]} />);
    expect(screen.getByRole("img", { name: "Juan (speaking), Maria and 3 more" })).toBeInTheDocument();
    expect(screen.getByText("+3")).toBeInTheDocument();
  });
});
