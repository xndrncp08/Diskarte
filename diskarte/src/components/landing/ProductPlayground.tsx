"use client";

import {
  ArrowUpRight,
  Check,
  Columns3,
  Hash,
  Headphones,
  MessageSquare,
  Mic,
  MonitorUp,
  SendHorizontal,
  Volume2,
} from "lucide-react";
import { useId, useState, type KeyboardEvent } from "react";
import Link from "next/link";
import { DiskarteLogo } from "@/components/brand/DiskarteLogo";

const VIEWS = [
  { id: "chat", label: "Conversations", Icon: MessageSquare },
  { id: "voice", label: "Voice & video", Icon: Headphones },
  { id: "workspace", label: "Shared workspace", Icon: Columns3 },
] as const;
type View = (typeof VIEWS)[number]["id"];

/** A clearly labelled, local product demo. No messages, tasks or participants are sent to a server. */
export function ProductPlayground() {
  const [view, setView] = useState<View>("chat");
  const [messages, setMessages] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [done, setDone] = useState([true, false, false]);
  const id = useId();
  function move(event: KeyboardEvent<HTMLDivElement>) {
    const delta =
      event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (!delta) return;
    event.preventDefault();
    const next =
      VIEWS[
        (VIEWS.findIndex((item) => item.id === view) + delta + VIEWS.length) %
          VIEWS.length
      ];
    setView(next.id);
    document.getElementById(`${id}-${next.id}`)?.focus();
  }
  return (
    <div className="product-playground" data-testid="product-playground">
      <div className="preview-titlebar">
        <span className="preview-window-dots" aria-hidden>
          <i />
          <i />
          <i />
        </span>
        <span>DISKARTE / PRODUCT PREVIEW</span>
        <span className="preview-sample">Sample content</span>
      </div>
      <div
        className="preview-tabs"
        role="tablist"
        aria-label="Explore Diskarte features"
        onKeyDown={move}
      >
        {VIEWS.map(({ id: key, label, Icon }) => (
          <button
            key={key}
            id={`${id}-${key}`}
            type="button"
            role="tab"
            aria-selected={view === key}
            aria-controls={`${id}-panel`}
            tabIndex={view === key ? 0 : -1}
            onClick={() => setView(key)}
          >
            <Icon className="size-4" aria-hidden />
            <span>{label}</span>
          </button>
        ))}
      </div>
      <div className="preview-layout">
        <div className="preview-rail" aria-hidden>
          <DiskarteLogo size={34} />
          <span className="preview-server">B</span>
          <span className="preview-server">G</span>
          <span className="preview-server">S</span>
          <span className="preview-rail-line" />
          <Headphones className="size-4 text-slate-400" />
        </div>
        <div className="preview-sidebar" aria-hidden>
          <strong>Barkada HQ</strong>
          <span className="section-kicker">TAMBAYAN</span>
          <span className={view === "chat" ? "selected" : ""}>
            <Hash /> general
          </span>
          <span>
            <Hash /> chika
          </span>
          <span>
            <Hash /> ideas-and-plans
          </span>
          <span className="section-kicker mt-4">VOICE ROOMS</span>
          <span className={view === "voice" ? "selected" : ""}>
            <Volume2 /> The tambayan
          </span>
          <span>
            <Volume2 /> Focus room
          </span>
          <span className="section-kicker mt-4">MAKE SOMETHING</span>
          <span className={view === "workspace" ? "selected" : ""}>
            <Columns3 /> Shared workspace
          </span>
        </div>
        <div
          id={`${id}-panel`}
          role="tabpanel"
          aria-labelledby={`${id}-${view}`}
          className="preview-main"
          tabIndex={0}
        >
          {view === "chat" ? (
            <>
              <div className="preview-channel">
                <Hash className="size-4" aria-hidden />
                <strong>general</strong>
                <span>One place for every kwento.</span>
              </div>
              <div
                className="preview-messages"
                role="log"
                aria-label="Demo messages"
                aria-live="polite"
              >
                <div className="preview-message">
                  <span className="preview-avatar">M</span>
                  <div>
                    <strong>
                      Maria <small>Sample message</small>
                    </strong>
                    <p>One more game, then we plan the weekend?</p>
                    <span className="preview-reaction">
                      <Check className="size-3" aria-hidden /> G, tara!
                    </span>
                  </div>
                </div>
                <div className="preview-message">
                  <span className="preview-avatar cyan">J</span>
                  <div>
                    <strong>
                      Juan <small>Sample message</small>
                    </strong>
                    <p>G! I left the notes in our shared workspace.</p>
                    <div className="preview-attachment">
                      <Columns3 className="size-5 text-sun" aria-hidden />
                      <span>
                        Weekend plans
                        <br />
                        <small>Shared note · in your tambayan</small>
                      </span>
                    </div>
                  </div>
                </div>
                {messages.map((message, index) => (
                  <div key={index} className="preview-message">
                    <span className="preview-avatar">Y</span>
                    <div>
                      <strong>
                        You <small>Local preview</small>
                      </strong>
                      <p>{message}</p>
                    </div>
                  </div>
                ))}
              </div>
              <form
                className="preview-composer"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (!draft.trim()) return;
                  setMessages((prev) => [...prev.slice(-3), draft.trim()]);
                  setDraft("");
                }}
              >
                <label htmlFor={`${id}-message`} className="sr-only">
                  Try a demo message
                </label>
                <input
                  id={`${id}-message`}
                  maxLength={200}
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder="Try a message. This stays in the preview."
                  autoComplete="off"
                />
                <button
                  type="submit"
                  disabled={!draft.trim()}
                  aria-label="Send demo message"
                >
                  <SendHorizontal className="size-4" aria-hidden />
                </button>
              </form>
            </>
          ) : view === "voice" ? (
            <>
              <div className="preview-channel">
                <Volume2 className="size-4" aria-hidden />
                <strong>The tambayan</strong>
                <span>Voice, video & screen sharing</span>
              </div>
              <div className="preview-voice">
                <div className="preview-participant">
                  <span className="preview-avatar">M</span>
                  <span>Camera & voice</span>
                  <div className="preview-wave" aria-hidden>
                    {[10, 22, 15, 30, 18, 25, 12].map((height, index) => (
                      <i
                        key={index}
                        style={{ height, animationDelay: `${index * 80}ms` }}
                      />
                    ))}
                  </div>
                </div>
                <div className="preview-participant">
                  <MonitorUp className="size-10 text-sun" aria-hidden />
                  <strong>Make room for the whole picture.</strong>
                  <p>
                    Share your screen. Watch together. Keep your conversation
                    going.
                  </p>
                </div>
              </div>
              <div className="preview-voice-caption">
                <Mic className="size-4" aria-hidden /> Illustrated call layout ·
                join a real room after signing in
              </div>
            </>
          ) : (
            <>
              <div className="preview-channel">
                <Columns3 className="size-4" aria-hidden />
                <strong>Shared workspace</strong>
                <span>From kwento to a plan</span>
              </div>
              <div className="preview-workspace">
                <div className="preview-note">
                  <span className="section-kicker">SHARED NOTE</span>
                  <h3>The weekend plan</h3>
                  <p>A place for ideas before they disappear into the chat.</p>
                  <div className="preview-note-lines" aria-hidden />
                </div>
                <div className="preview-task-list">
                  <span className="section-kicker">TRY THE TASK BOARD</span>
                  {[
                    "Find our tambayan",
                    "Bring everyone together",
                    "Make something happen",
                  ].map((text, index) => (
                    <label key={text}>
                      <input
                        type="checkbox"
                        checked={done[index]}
                        onChange={() =>
                          setDone((prev) =>
                            prev.map((value, i) =>
                              i === index ? !value : value,
                            ),
                          )
                        }
                      />
                      <span>{text}</span>
                    </label>
                  ))}
                  <p>
                    {done.filter(Boolean).length} of 3 sample tasks complete
                  </p>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
      <div className="preview-statusbar">
        <span>
          <span className="status-dot" /> Chat. Call. Create.
        </span>
        <span>Browser + installed PWA</span>
      </div>
      <Link href="/signup" className="preview-launch">
        <span>Make this your own tambayan</span>
        <ArrowUpRight className="size-4" aria-hidden />
      </Link>
    </div>
  );
}

export function WorkspaceCloseup() {
  return (
    <div className="workspace-closeup">
      <div className="closeup-title">
        <Columns3 className="size-4" aria-hidden /> A workspace that makes room.
      </div>
      <div className="closeup-columns">
        <div>
          <span className="section-kicker">TOGETHER</span>
          <h3>
            Ideas become
            <br />
            something real.
          </h3>
          <p>
            Shared notes, task boards, resources, whiteboards and focus
            sessions. Connected to the same channels as your conversations.
          </p>
          <Link
            href="/signup"
            className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-sun"
          >
            Create your space <ArrowUpRight className="size-4" aria-hidden />
          </Link>
        </div>
        <ul>
          {[
            "Notes that stay with the conversation",
            "A task board for the next big idea",
            "Resources worth keeping",
            "A little space to focus",
          ].map((text, index) => (
            <li key={text}>
              <span>0{index + 1}</span>
              {text}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
