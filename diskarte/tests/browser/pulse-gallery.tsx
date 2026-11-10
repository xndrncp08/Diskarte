import { MotionConfig } from "framer-motion";
import { Bell, Copy, Hash, Inbox, MoreHorizontal, Pencil, Phone, Plus, Settings, Trash2 } from "lucide-react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { AppToaster } from "@/components/AppToaster";
import { Avatar, Monogram, PresenceDot, type PresenceStatus } from "@/components/pulse/Avatar";
import { Button, IconButton, type ButtonVariant } from "@/components/pulse/Button";
import { BentoGrid, BentoTile, Card } from "@/components/pulse/Card";
import { Chip, CountBadge, StatusBadge } from "@/components/pulse/Chip";
import { Dialog, Sheet } from "@/components/pulse/Dialog";
import { Input, Select, Textarea } from "@/components/pulse/Field";
import { ContextMenu, ContextMenuItems, Menu, useContextMenu, type MenuItem } from "@/components/pulse/Menu";
import { LiveIndicator, PulseLine } from "@/components/pulse/PulseLine";
import { EmptyState, ErrorState, Loading, SkeletonRows } from "@/components/pulse/States";
import { Switch } from "@/components/pulse/Switch";
import { Tabs } from "@/components/pulse/Tabs";
import { Tooltip } from "@/components/pulse/Tooltip";

// Every Pulse component in every state, inside <html data-shell="pulse">; ?mode=light for paper.
const people = [
  { display_name: "Kapitan Juan", avatar_url: null, avatar_preset: "araw" },
  { display_name: "Maria Clara", avatar_url: null, avatar_preset: "ube" },
  { display_name: "Andres B.", avatar_url: null, avatar_preset: "dagat" },
  { display_name: "Tala Reyes", avatar_url: null, avatar_preset: "gabi" },
];
const STATUSES: PresenceStatus[] = ["online", "idle", "dnd", "offline"];
const VARIANTS: ButtonVariant[] = ["primary", "secondary", "quiet", "danger", "live"];

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={`g-${title}`} className="space-y-3 border-t border-pulse-line pt-6">
      <h2 id={`g-${title}`} className="font-pulse-display text-pulse-heading font-semibold">
        {title}
      </h2>
      {children}
    </section>
  );
}
const Row = ({ children }: { children: ReactNode }) => <div className="flex flex-wrap items-center gap-3">{children}</div>;

export function PulseGallery() {
  const [light, setLight] = useState(() => document.documentElement.dataset.colorMode === "light");
  const [on, setOn] = useState(true);
  const [off, setOff] = useState(false);
  const [tab, setTab] = useState("chat");
  const [filters, setFilters] = useState<string[]>(["Gaming"]);
  const [tags, setTags] = useState(["Cebu", "Weekend", "Open mic"]);
  const [dialog, setDialog] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [notify, setNotify] = useState("all");
  const context = useContextMenu();
  const items: MenuItem[] = [
    { label: "Edit", icon: <Pencil />, onSelect: () => {} },
    { label: "Copy link", icon: <Copy />, onSelect: () => {} },
    { label: "All messages", group: "Notify me", checked: notify === "all", onSelect: () => setNotify("all") },
    { label: "Mentions only", group: "Notify me", checked: notify === "mentions", onSelect: () => setNotify("mentions") },
    { label: "Delete", icon: <Trash2 />, danger: true, onSelect: () => {} },
  ];

  const setMode = (next: boolean) => {
    setLight(next);
    document.documentElement.dataset.colorMode = next ? "light" : "dark";
  };

  return (
    <MotionConfig reducedMotion="user">
      <main id="main-content" className="mx-auto max-w-5xl space-y-8 px-4 py-6 font-pulse-text text-pulse-body text-pulse-text">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-pulse-display text-pulse-display font-bold">Pulse gallery</h1>
            <p className="text-pulse-muted">Every Pulse component, in every state.</p>
          </div>
          <Switch checked={light} onChange={setMode} label="Light mode" />
        </header>

        <Section title="Buttons">
          {VARIANTS.map((variant) => (
            <Row key={variant}>
              <Button variant={variant}>{variant[0].toUpperCase() + variant.slice(1)}</Button>
              <Button variant={variant} size="sm" icon={<Plus />}>
                Small
              </Button>
              <Button variant={variant} size="lg">
                Large
              </Button>
              <Button variant={variant} disabled>
                Disabled
              </Button>
              <Button variant={variant} loading>
                Saving
              </Button>
            </Row>
          ))}
          <Row>
            <IconButton label="Settings" icon={<Settings />} tooltip />
            <IconButton label="Notifications" icon={<Bell />} variant="secondary" />
            <IconButton label="Join voice" icon={<Phone />} variant="live" />
            <IconButton label="Delete message" icon={<Trash2 />} variant="danger" size="sm" />
            <IconButton label="Add a Space" icon={<Plus />} variant="primary" size="lg" />
            <IconButton label="More" icon={<MoreHorizontal />} disabled />
          </Row>
        </Section>

        <Section title="Chips and badges">
          <Row>
            <Chip>Neutral</Chip>
            <Chip tone="accent">Accent</Chip>
            <Chip tone="live">Live</Chip>
            <Chip tone="alert">Alert</Chip>
            <Chip tone="people">People</Chip>
          </Row>
          <Row>
            {["Gaming", "Music", "Study"].map((f) => (
              <Chip key={f} selected={filters.includes(f)} onClick={() => setFilters((all) => (all.includes(f) ? all.filter((x) => x !== f) : [...all, f]))}>
                {f}
              </Chip>
            ))}
            {tags.map((t) => (
              <Chip key={t} tone="people" onRemove={() => setTags((all) => all.filter((x) => x !== t))}>
                {t}
              </Chip>
            ))}
          </Row>
          <Row>
            <CountBadge count={3} label="unread mentions" />
            <CountBadge count={12} label="new messages" tone="accent" />
            <CountBadge count={240} label="unread mentions" />
            <StatusBadge tone="live">Live</StatusBadge>
            <StatusBadge tone="alert">Muted</StatusBadge>
            <StatusBadge tone="people">Admin</StatusBadge>
            <StatusBadge tone="accent">Featured</StatusBadge>
            <StatusBadge icon={<Hash />}>Text</StatusBadge>
          </Row>
        </Section>

        <Section title="Fields">
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Display name" placeholder="Juan dela Cruz" hint="Shown to everyone in your Spaces." />
            <Input label="Email" type="email" defaultValue="juan@" error="Enter a full email address." />
            <Input label="Password" type="password" defaultValue="tinapay123" />
            <Input label="Invite code" disabled defaultValue="DSK-2026" />
            <Textarea label="About" placeholder="A line about you" hint="Up to 190 characters." />
            <Select label="Region" defaultValue="vis" hint="Used for event times.">
              <option value="luz">Luzon</option>
              <option value="vis">Visayas</option>
              <option value="min">Mindanao</option>
            </Select>
          </div>
        </Section>

        <Section title="Switches">
          <div className="max-w-md space-y-4">
            <Switch checked={on} onChange={setOn} label="Desktop notifications" hint="Only for mentions and DMs." />
            <Switch checked={off} onChange={setOff} label="Compact canvas" />
            <Switch checked disabled onChange={() => {}} label="Managed by your Space" hint="An admin turned this on." />
          </div>
        </Section>

        <Section title="Tabs">
          <Tabs
            label="Space sections"
            value={tab}
            onChange={setTab}
            items={[
              { id: "chat", label: "Chat" },
              { id: "events", label: "Events", badge: <CountBadge count={2} label="new events" tone="accent" /> },
              { id: "members", label: "Members" },
              { id: "archive", label: "Archive", disabled: true },
            ]}
          >
            <p className="text-pulse-muted">{`The ${tab} panel.`}</p>
          </Tabs>
        </Section>

        <Section title="Cards">
          <Card title="Weekend hangout" action={<Button size="sm">RSVP</Button>}>
            <p className="text-pulse-muted">Saturday, 7:00 PM in the Tambayan voice room.</p>
          </Card>
          <BentoGrid>
            <BentoTile span="hero" eyebrow="This week" title="Bayanihan night">
              Twelve people going. Bring a song.
            </BentoTile>
            <BentoTile title="Members">128 people, 14 here now.</BentoTile>
            <BentoTile title="Rules">Be kind. No spoilers.</BentoTile>
            <BentoTile span="wide" title="Live now">
              <LiveIndicator label="3 in General voice" />
            </BentoTile>
          </BentoGrid>
        </Section>

        <Section title="People and Spaces">
          <Row>
            {people.map((p, i) => (
              <Avatar key={p.display_name} profile={p} status={STATUSES[i]} labelled size={[32, 40, 48, 56][i]} />
            ))}
            <Avatar profile={people[1]} speaking labelled />
          </Row>
          <Row>
            {STATUSES.map((s) => (
              <span key={s} className="inline-flex items-center gap-1.5 text-pulse-label text-pulse-muted">
                <PresenceDot status={s} size={12} />
                {s}
              </span>
            ))}
          </Row>
          <Row>
            <Monogram name="Tambayan" labelled />
            <Monogram name="Bayanihan Crew" selected labelled />
            <Monogram name="Lakbay" size={56} labelled />
          </Row>
        </Section>

        <Section title="Pulse line and live">
          <p>Earlier messages stay above the line.</p>
          <PulseLine label="New since 3:42 PM" />
          <p>Fresh messages start below it.</p>
          <PulseLine />
          <Row>
            <LiveIndicator />
            <LiveIndicator label="Live in General" />
            <LiveIndicator hideLabel />
          </Row>
        </Section>

        <Section title="States">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <EmptyState title="No messages yet" icon={<Inbox />} action={<Button variant="primary">Say hello</Button>}>
                Start the conversation. Everyone here will see it.
              </EmptyState>
            </Card>
            <ErrorState title="Couldn't load messages" onRetry={() => setRetrying(true)} retrying={retrying}>
              Check your connection, then try again.
            </ErrorState>
            <Card>
              <SkeletonRows label="Loading messages" />
            </Card>
            <Card>
              <Loading label="Loading members…" />
            </Card>
          </div>
        </Section>

        <Section title="Overlays">
          <Row>
            <Button onClick={() => setDialog(true)}>Open dialog</Button>
            <Button onClick={() => setSheet(true)}>Open sheet</Button>
            <Menu
              label="Message options"
              trigger={({ open, toggle, id }) => (
                <Button aria-haspopup="menu" aria-expanded={open} aria-controls={open ? id : undefined} onClick={toggle} icon={<MoreHorizontal />}>
                  Menu
                </Button>
              )}
              items={items}
            />
            <Tooltip label="Tooltips name, they never explain">
              <Button variant="quiet">Hover for tooltip</Button>
            </Tooltip>
            <Button variant="quiet" onClick={() => toast.success("Saved", { description: "Your profile is up to date." })}>
              Show toast
            </Button>
          </Row>
          <div {...context.triggerProps} tabIndex={0} data-testid="context-target" className="rounded-pulse-item border border-dashed border-pulse-input p-4 text-pulse-muted">
            Right-click, long-press or Shift+F10 here for the context menu.
          </div>
          <ContextMenu menu={context} label="Message actions">
            <ContextMenuItems items={items} />
          </ContextMenu>
        </Section>

        <Dialog
          open={dialog}
          onClose={() => setDialog(false)}
          title="Leave Bayanihan Crew?"
          description="You can rejoin with a new invite."
          footer={
            <>
              <Button onClick={() => setDialog(false)}>Cancel</Button>
              <Button variant="danger" onClick={() => setDialog(false)}>
                Leave
              </Button>
            </>
          }
        >
          <Input label="Type the Space name to confirm" placeholder="Bayanihan Crew" />
        </Dialog>
        <Sheet open={sheet} onClose={() => setSheet(false)} title="Context" description="People, pins and files for #general." footer={<Button variant="primary" onClick={() => setSheet(false)}>Done</Button>}>
          <div className="space-y-3">
            {people.map((p, i) => (
              <div key={p.display_name} className="flex items-center gap-3">
                <Avatar profile={p} status={STATUSES[i]} size={36} />
                <span>{p.display_name}</span>
              </div>
            ))}
          </div>
        </Sheet>
      </main>
      <AppToaster />
    </MotionConfig>
  );
}
