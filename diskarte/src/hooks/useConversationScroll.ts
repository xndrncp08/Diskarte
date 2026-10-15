"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";
import type { VirtualMessageListHandle } from "@/components/chat/VirtualMessageList";
import type { ChatMessage } from "./useChannelChat";

// Positions only, never message content. Bound memory during a long session.
type Position = { top: number; bottom: boolean; anchor?: { key: string; offset: number; date: string } };
const positions = new Map<string, Position>();

export function useConversationScroll(key: string, messages: ChatMessage[], meId: string, loadOlder: () => Promise<void>, hasMore: boolean, loadingOlder = false) {
  const listRef = useRef<VirtualMessageListHandle>(null);
  const saved = positions.get(key);
  const [atBottom, setAtBottom] = useState(saved?.bottom ?? true);
  const [unseen, setUnseen] = useState(0);
  const bottom = useRef(saved?.bottom ?? true);
  const restoring = useRef(saved?.anchor && !saved.bottom ? saved : null);
  const [restoringHistory, setRestoringHistory] = useState(!!saved?.anchor && !saved.bottom);
  const currentMessages = useRef(messages);
  useLayoutEffect(() => { currentMessages.current = messages; }, [messages]);
  const previous = useRef<{ first?: string; count: number; height: number } | null>(null);
  const requested = useRef(new Set<string>());

  useLayoutEffect(() => {
    const el = listRef.current?.element;
    if (!el) return;
    const before = previous.current;
    const position = restoring.current;
    if (position?.anchor) {
      if (loadingOlder) return;
      const anchor = position.anchor;
      if (listRef.current?.scrollToAnchor(anchor.key, anchor.offset)) { restoring.current = null; setRestoringHistory(false); }
      else if (hasMore && messages[0] && (messages[0].created_at > anchor.date || messages[0].created_at === anchor.date && messages[0].id > anchor.key)) {
        if (!requested.current.has(messages[0].id)) { requested.current.add(messages[0].id); void loadOlder(); }
        return;
      } else {
        // If the anchor was deleted, restore the nearest surviving message rather than fetching forever.
        const nearest = messages.find((m) => m.created_at >= anchor.date) ?? messages.at(-1);
        if (nearest) listRef.current?.scrollToAnchor(nearest.id, 0);
        restoring.current = null;
        setRestoringHistory(false);
      }
    } else if (!before) {
      const position = positions.get(key);
      if (position && !position.bottom) el.scrollTop = position.top;
      else listRef.current?.scrollToBottom();
    } else if (messages.length > before.count && messages[0]?.id !== before.first && before.count > 0) {
      el.scrollTop += el.scrollHeight - before.height;
    } else if (messages.length > before.count) {
      if (bottom.current || messages.at(-1)?.author_id === meId) listRef.current?.scrollToBottom();
      else setUnseen((n) => n + messages.length - before.count);
    }
    previous.current = { first: messages[0]?.id, count: messages.length, height: el.scrollHeight };
  }, [key, messages, meId, hasMore, loadOlder, loadingOlder]);

  const remember = useCallback((el: HTMLDivElement) => {
    if (restoring.current) return;
    const anchor = listRef.current?.readAnchor() ?? positions.get(key)?.anchor;
    const row = anchor && currentMessages.current.find((m) => m.id === anchor.key);
    positions.set(key, { top: el.scrollTop, bottom: bottom.current, ...(anchor && row ? { anchor: { ...anchor, date: row.created_at } } : {}) });
    if (positions.size > 50) positions.delete(positions.keys().next().value!);
  }, [key]);

  useLayoutEffect(() => {
    const el = listRef.current?.element;
    if (!el) return;
    let frame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      if (bottom.current) frame = requestAnimationFrame(() => listRef.current?.scrollToBottom());
    });
    observer.observe(el);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      remember(el);
    };
  }, [key, remember]);

  const onScroll = useCallback(() => {
    const el = listRef.current?.element;
    if (!el || restoring.current) return;
    bottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    setAtBottom(bottom.current);
    if (bottom.current) setUnseen(0);
    if (previous.current) previous.current.height = el.scrollHeight;
    remember(el);
    if (el.scrollTop < 240 && hasMore) void loadOlder();
  }, [hasMore, loadOlder, remember]);

  const scrollToBottom = useCallback(() => {
    restoring.current = null;
    setRestoringHistory(false);
    bottom.current = true;
    listRef.current?.scrollToBottom();
    setAtBottom(true);
    setUnseen(0);
  }, []);
  return { listRef, atBottom, unseen, onScroll, scrollToBottom, restoringHistory };
}
