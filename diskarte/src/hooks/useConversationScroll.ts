"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";
import type { VirtualMessageListHandle } from "@/components/chat/VirtualMessageList";
import type { ChatMessage } from "./useChannelChat";

// Positions only, never message content. Bound memory during a long session.
const positions = new Map<string, { top: number; bottom: boolean }>();

export function useConversationScroll(key: string, messages: ChatMessage[], meId: string, loadOlder: () => Promise<void>, hasMore: boolean) {
  const listRef = useRef<VirtualMessageListHandle>(null);
  const saved = positions.get(key);
  const [atBottom, setAtBottom] = useState(saved?.bottom ?? true);
  const [unseen, setUnseen] = useState(0);
  const bottom = useRef(saved?.bottom ?? true);
  const previous = useRef<{ first?: string; count: number; height: number } | null>(null);

  useLayoutEffect(() => {
    const el = listRef.current?.element;
    if (!el) return;
    const before = previous.current;
    if (!before) {
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
  }, [key, messages, meId]);

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
      positions.set(key, { top: el.scrollTop, bottom: bottom.current });
      if (positions.size > 50) positions.delete(positions.keys().next().value!);
    };
  }, [key]);

  const onScroll = useCallback(() => {
    const el = listRef.current?.element;
    if (!el) return;
    bottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    setAtBottom(bottom.current);
    if (bottom.current) setUnseen(0);
    if (previous.current) previous.current.height = el.scrollHeight;
    positions.set(key, { top: el.scrollTop, bottom: bottom.current });
    if (el.scrollTop < 240 && hasMore) void loadOlder();
  }, [key, hasMore, loadOlder]);

  const scrollToBottom = useCallback(() => {
    bottom.current = true;
    listRef.current?.scrollToBottom();
    setAtBottom(true);
    setUnseen(0);
  }, []);
  return { listRef, atBottom, unseen, onScroll, scrollToBottom };
}
