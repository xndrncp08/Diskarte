import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { createElement, forwardRef, type AnchorHTMLAttributes, type MouseEvent } from "react";
import { afterEach, vi } from "vitest";
import { FakeAudioContext } from "./mocks/audio";
import { livekitMock, MockRoom } from "./mocks/livekit";
import { navigation, paramsFor, usePathnameMock } from "./mocks/navigation";

// ---------------------------------------------------------------------------------------
// Global module mocks (individual test files may still override them with their own vi.mock)
// ---------------------------------------------------------------------------------------

/** WebRTC: a fake Room; enums, events and errors stay real. */
vi.mock("livekit-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("livekit-client")>()),
  Room: MockRoom,
}));

/** LiveKit React bindings: context passthrough + hooks driven by `livekitMock`. */
vi.mock("@livekit/components-react", async () => {
  const { createContext, createElement: h } = await import("react");
  const { isTrackReference } = await import("@livekit/components-core");
  return {
    RoomContext: createContext(undefined),
    RoomAudioRenderer: ({ muted }: { muted?: boolean }) => h("div", { "data-testid": "room-audio", "data-muted": String(Boolean(muted)) }),
    VideoTrack: ({ className }: { className?: string }) => h("video", { "data-testid": "video-track", className }),
    useTracks: () => livekitMock.tracks,
    useIsSpeaking: (p?: { identity: string }) => (p ? livekitMock.speaking.has(p.identity) : false),
    useSpeakingParticipants: () => Array.from(livekitMock.speaking, (identity) => ({ identity })),
    useRoomContext: () => livekitMock.rooms.at(-1),
    isTrackReference,
  };
});

/** Supabase SSR clients → in-memory fake (no network). */
vi.mock("@supabase/ssr", async () => {
  const { createFakeSupabase } = await import("./fixtures/fake-supabase");
  return {
    createBrowserClient: () => createFakeSupabase().client,
    createServerClient: () => createFakeSupabase().client,
  };
});

/** Next.js App Router hooks backed by the in-memory `navigation` store. */
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: navigation.push,
    replace: navigation.replace,
    refresh: navigation.refresh,
    back: () => undefined,
    forward: () => undefined,
    prefetch: () => Promise.resolve(),
  }),
  usePathname: usePathnameMock,
  useParams: () => paramsFor(usePathnameMock()),
  useSearchParams: () => new URLSearchParams(navigation.path.split("?")[1] ?? ""),
  redirect: (href: string) => {
    navigation.replace(href);
    throw new Error(`NEXT_REDIRECT ${href}`);
  },
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

/** <Link> → plain anchor that navigates the in-memory router on click. */
vi.mock("next/link", () => {
  const Link = forwardRef<HTMLAnchorElement, AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; prefetch?: boolean }>(function Link(
    { href, onClick, prefetch, ...rest },
    ref,
  ) {
    void prefetch; // Next-only prop; not a valid <a> attribute
    return createElement("a", {
      ...rest,
      ref,
      href,
      onClick: (event: MouseEvent<HTMLAnchorElement>) => {
        onClick?.(event);
        if (event.defaultPrevented) return;
        event.preventDefault();
        navigation.push(href);
      },
    });
  });
  return { default: Link };
});

// ---------------------------------------------------------------------------------------
// Browser APIs jsdom lacks
// ---------------------------------------------------------------------------------------

// Web Audio for 8-bit sound effects (assigned, not stubbed, so vi.unstubAllGlobals keeps it).
Object.assign(globalThis, { AudioContext: FakeAudioContext });

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
Object.assign(globalThis, { ResizeObserver: globalThis.ResizeObserver ?? ResizeObserverStub });

if (typeof window !== "undefined") {
  window.HTMLElement.prototype.scrollIntoView ??= function scrollIntoView() {};
  window.HTMLElement.prototype.scrollTo ??= function scrollTo() {};
  window.matchMedia ??= (query: string) =>
    ({ matches: false, media: query, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false }) as MediaQueryList;
}

afterEach(() => {
  cleanup();
  livekitMock.reset();
  navigation.reset();
});
