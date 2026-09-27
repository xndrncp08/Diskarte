import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

afterEach(() => cleanup());

/**
 * jsdom has no layout: default to a desktop viewport (min-width queries match) with motion
 * enabled. Tests that need a phone call `setViewport("mobile")`.
 */
let viewport: "desktop" | "mobile" = "desktop";
export function setViewport(next: "desktop" | "mobile") {
  viewport = next;
}

if (typeof window !== "undefined") {
  window.matchMedia = vi.fn((query: string) => ({
    matches: query.includes("min-width") ? viewport === "desktop" : false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;

  class IO {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
    takeRecords = () => [];
  }
  (window as unknown as { IntersectionObserver: unknown }).IntersectionObserver = IO;
  afterEach(() => setViewport("desktop"));
}
