"use client";

import { useState, type FocusEvent, type KeyboardEvent } from "react";

const TABBABLE = "a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]";
const ROW = "[data-message-id]";
const ACTIONS = ".pulse-msg-actions";

/** ↑/↓ step one message, Home/End jump to the ends of what's loaded; no wrapping (a log has a top and a bottom). -1 for other keys. */
export function logIndex(key: string, index: number, length: number) {
  if (length === 0) return -1;
  if (key === "ArrowUp") return Math.max(0, index - 1);
  if (key === "ArrowDown") return Math.min(length - 1, index + 1);
  if (key === "Home") return 0;
  if (key === "End") return length - 1;
  return -1;
}

const visible = (el: Element) => (el as HTMLElement & { checkVisibility?: () => boolean }).checkVisibility?.() ?? true;
const tabbables = (root: ParentNode) => Array.from(root.querySelectorAll<HTMLElement>(TABBABLE)).filter((el) => el.tabIndex >= 0 && visible(el));

/** Moves focus to the first tab stop after (or the last before) `container`, so Tab leaves the log in one step. */
function leave(container: HTMLElement, forward: boolean) {
  const outside = tabbables(document).filter((el) => !container.contains(el) && Boolean(container.compareDocumentPosition(el) & (forward ? Node.DOCUMENT_POSITION_FOLLOWING : Node.DOCUMENT_POSITION_PRECEDING)));
  const next = forward ? outside[0] : outside.at(-1);
  if (!next) return false;
  next.focus();
  return true;
}

/**
 * Pulse message log keyboard model: the log is one Tab stop (the last focused message, else the newest); ↑/↓,
 * Home/End move between messages; Enter or → goes into the message (its action row first), Tab walks its controls
 * and leaves the log after the last one; Escape returns to the message; Tab or Shift+Tab on a message leaves the log.
 * Spread `onKeyDown`/`onFocus` on the log and give each message `tabIndex={tabStop === id ? 0 : -1}`.
 * `reveal` scrolls an unrendered (virtualized) message into the DOM before it is focused.
 */
export function useMessageRoving(keys: readonly string[], reveal?: (key: string) => void) {
  const [current, setCurrent] = useState<string | null>(null);
  const tabStop = current !== null && keys.includes(current) ? current : (keys.at(-1) ?? null);

  function focusMessage(container: HTMLElement, key: string) {
    setCurrent(key);
    const find = () => container.querySelector<HTMLElement>(`${ROW}[data-message-id="${CSS.escape(key)}"]`);
    if (!find()) reveal?.(key);
    let tries = 0;
    const go = () => {
      const el = find();
      if (el) {
        el.focus({ preventScroll: true });
        el.scrollIntoView?.({ block: "nearest" });
      } else if (tries++ < 10) requestAnimationFrame(go);
    };
    go();
  }

  function onKeyDown(e: KeyboardEvent<HTMLElement>) {
    const container = e.currentTarget;
    const target = e.target as HTMLElement;
    // Events bubble here through portals (menus, pickers): only handle ones from inside the log's own DOM.
    const row = target.closest<HTMLElement>(ROW);
    if (!row || !container.contains(row) || e.altKey || e.ctrlKey || e.metaKey) return;
    if (target === row) {
      const next = logIndex(e.key, keys.indexOf(row.dataset.messageId ?? ""), keys.length);
      if (next >= 0) {
        e.preventDefault();
        focusMessage(container, keys[next]);
      } else if (e.key === "Enter" || e.key === "ArrowRight") {
        const first = tabbables(row.querySelector(ACTIONS) ?? row)[0] ?? row.querySelector<HTMLElement>(`${ACTIONS} button`);
        if (!first) return;
        e.preventDefault();
        first.focus();
      } else if (e.key === "Tab" && leave(container, !e.shiftKey)) e.preventDefault();
      return;
    }
    // The inline edit box keeps its own keys; an open picker closes itself on Escape.
    if (target.matches("textarea, input") || target.getAttribute("aria-expanded") === "true") return;
    if (e.key === "Escape") {
      e.preventDefault();
      row.focus();
    } else if (e.key === "Tab") {
      const inside = tabbables(row);
      if (e.shiftKey && inside[0] === target) {
        e.preventDefault();
        row.focus();
      } else if (!e.shiftKey && inside.at(-1) === target && leave(container, true)) e.preventDefault();
    }
  }

  function onFocus(e: FocusEvent<HTMLElement>) {
    const target = e.target as HTMLElement;
    const row = target.closest<HTMLElement>(ROW);
    if (row && e.currentTarget.contains(row) && row.dataset.messageId) setCurrent(row.dataset.messageId);
    // The log itself is focusable only while its tab stop is scrolled out of the DOM: hand focus to that message.
    else if (target === e.currentTarget && tabStop) focusMessage(e.currentTarget, tabStop);
  }

  return { tabStop, onKeyDown, onFocus };
}
