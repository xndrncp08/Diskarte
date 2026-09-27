"use client";

import { useVirtualizer } from "@tanstack/react-virtual";
import { forwardRef, useImperativeHandle, useLayoutEffect, useRef, useState, type ReactNode, type UIEvent } from "react";

export interface VirtualMessageListHandle {
  element: HTMLDivElement | null;
  scrollToBottom: (behavior?: ScrollBehavior) => void;
  /** Scrolls a (possibly unrendered) message into view; returns false if it isn't loaded. */
  scrollToKey: (key: string) => boolean;
}

const FALLBACK_RECT = { width: 800, height: 900 };

function observeWithFallback(instance: { scrollElement: Element | null }, cb: (rect: { width: number; height: number }) => void) {
  const el = instance.scrollElement as HTMLElement | null;
  if (!el) return;
  const report = () => cb({ width: el.offsetWidth || FALLBACK_RECT.width, height: el.offsetHeight || FALLBACK_RECT.height });
  report();
  const observer = new ResizeObserver(report);
  observer.observe(el);
  return () => observer.disconnect();
}

interface Props {
  keys: string[];
  header: ReactNode;
  renderItem: (index: number) => ReactNode;
  onScroll?: (event: UIEvent<HTMLDivElement>) => void;
  estimateSize?: number;
}

/**
 * Windowed chat stream (@tanstack/react-virtual): only the rows around the viewport are mounted,
 * so channels with thousands of messages scroll at full frame rate. Rows are measured as they
 * render (variable heights: markdown, attachments, reactions) and size changes above the viewport
 * are compensated so reading position never jumps.
 */
export const VirtualMessageList = forwardRef<VirtualMessageListHandle, Props>(function VirtualMessageList({ keys, header, renderItem, onScroll, estimateSize = 64 }, ref) {
  const scroller = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const [scrollMargin, setScrollMargin] = useState(0);

  // The welcome header / "load more" row sits above the virtual rows inside the same scroller.
  useLayoutEffect(() => {
    const el = list.current;
    if (!el) return;
    const update = () => setScrollMargin(el.offsetTop);
    update();
    const observer = new ResizeObserver(update);
    if (el.previousElementSibling) observer.observe(el.previousElementSibling);
    return () => observer.disconnect();
  }, []);

  const virtualizer = useVirtualizer({
    count: keys.length,
    getScrollElement: () => scroller.current,
    estimateSize: () => estimateSize,
    getItemKey: (index) => keys[index],
    overscan: 8,
    scrollMargin,
    // Before layout (first paint, hidden panes, jsdom) the scroller reports 0×0, which would render
    // nothing; fall back to a typical viewport so the latest messages are always mounted.
    initialRect: FALLBACK_RECT,
    observeElementRect: observeWithFallback,
    // A 0 px row (not laid out yet / hidden) would make every row "fit" and render the whole list.
    measureElement: (el) => (el as HTMLElement).getBoundingClientRect().height || estimateSize,
  });

  useImperativeHandle(
    ref,
    () => ({
      get element() {
        return scroller.current;
      },
      scrollToBottom(behavior: ScrollBehavior = "auto") {
        if (keys.length === 0) return;
        virtualizer.scrollToIndex(keys.length - 1, { align: "end", behavior });
        // Rows measured after the jump can grow the list; settle on the real bottom next frame.
        requestAnimationFrame(() => {
          const el = scroller.current;
          if (el && behavior === "auto") el.scrollTop = el.scrollHeight;
        });
      },
      scrollToKey(key: string) {
        const index = keys.indexOf(key);
        if (index < 0) return false;
        virtualizer.scrollToIndex(index, { align: "center" });
        return true;
      },
    }),
    [keys, virtualizer],
  );

  const items = virtualizer.getVirtualItems();

  return (
    <div ref={scroller} onScroll={onScroll} className="scrollbar-thin flex-1 overflow-y-auto overscroll-contain" role="log" aria-live="polite" aria-relevant="additions" data-testid="message-list">
      <div>{header}</div>
      <div ref={list} className="relative w-full" style={{ height: virtualizer.getTotalSize() }} data-testid="message-rows" data-rendered={items.length}>
        {items.map((item) => (
          <div
            key={item.key}
            data-index={item.index}
            ref={virtualizer.measureElement}
            className="absolute left-0 top-0 w-full"
            style={{ transform: `translateY(${item.start - scrollMargin}px)` }}
          >
            {renderItem(item.index)}
          </div>
        ))}
      </div>
      <div className="h-4" aria-hidden />
    </div>
  );
});
