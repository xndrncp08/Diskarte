import { act, render, screen, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetLowDataCache, setLowDataMode } from "@/lib/low-data";

/** The real scene needs a GPU; this stand-in records its props and lets a test fire its callbacks. */
const scene = vi.hoisted(() => ({ mounts: 0, props: null as null | { onReady: () => void; onContextLost: () => void; active: boolean; emblem?: boolean } }));
vi.mock("@/components/three/SolarScene", () => ({
  default: function SolarSceneStub(props: NonNullable<typeof scene.props>) {
    scene.props = props;
    useEffect(() => {
      scene.mounts++;
    }, []);
    return <canvas data-testid="solar-canvas" />;
  },
}));

const { HeroCanvas } = await import("@/components/three/HeroCanvas");
const { resetWebGLProbe, useStageBus } = await import("@/components/three/stage-bus");
const { default: LandingPage } = await import("@/app/page");

function setReducedMotion(reduce: boolean) {
  window.matchMedia = ((query: string) =>
    ({
      matches: query.includes("prefers-reduced-motion") ? reduce : false,
      media: query,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
      onchange: null,
      dispatchEvent: () => false,
    }) as MediaQueryList) as typeof window.matchMedia;
}

function setWebGL(available: boolean) {
  resetWebGLProbe();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation((() => (available ? { getExtension: () => null } : null)) as never);
}

function Hero({ onSceneChange }: { onSceneChange?: (live: boolean) => void }) {
  const stageRef = useStageBus();
  return <HeroCanvas bus={stageRef} onSceneChange={onSceneChange} />;
}

beforeEach(() => {
  localStorage.clear();
  resetLowDataCache();
  scene.mounts = 0;
  scene.props = null;
  setReducedMotion(false);
  setWebGL(true);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("HeroCanvas", () => {
  it("lazy-loads the WebGL scene and fades it in once it has drawn a frame", async () => {
    const onSceneChange = vi.fn();
    const { container } = render(<Hero onSceneChange={onSceneChange} />);
    const layer = container.firstElementChild as HTMLElement;
    expect(layer).toHaveAttribute("aria-hidden", "true");
    expect(layer).toHaveClass("pointer-events-none");
    await screen.findByTestId("solar-canvas");
    expect(layer).toHaveAttribute("data-scene", "static");

    act(() => scene.props!.onReady());
    expect(layer).toHaveAttribute("data-scene", "3d");
    expect(onSceneChange).toHaveBeenLastCalledWith(true);
    // The static sun stays underneath as the glow.
    expect(screen.getByTestId("static-sun")).toBeInTheDocument();
  });

  it("never loads the 3D code for reduced motion: a static gradient sun instead", async () => {
    setReducedMotion(true);
    const { container } = render(<Hero />);
    await act(async () => {});
    expect(screen.getByTestId("static-sun")).toBeInTheDocument();
    expect(screen.queryByTestId("solar-canvas")).not.toBeInTheDocument();
    expect(scene.mounts).toBe(0);
    expect(container.firstElementChild).toHaveAttribute("data-scene", "static");
  });

  it("stays static in low-data mode and without WebGL", async () => {
    setLowDataMode(true);
    const { unmount } = render(<Hero />);
    await act(async () => {});
    expect(screen.queryByTestId("solar-canvas")).not.toBeInTheDocument();
    unmount();

    setLowDataMode(false);
    setWebGL(false);
    render(<Hero />);
    await act(async () => {});
    expect(screen.queryByTestId("solar-canvas")).not.toBeInTheDocument();
    expect(scene.mounts).toBe(0);
  });

  it("falls back to the static sun when the GPU context is lost", async () => {
    const onSceneChange = vi.fn();
    render(<Hero onSceneChange={onSceneChange} />);
    await screen.findByTestId("solar-canvas");
    act(() => scene.props!.onReady());
    act(() => scene.props!.onContextLost());
    await waitFor(() => expect(screen.queryByTestId("solar-canvas")).not.toBeInTheDocument());
    expect(onSceneChange).toHaveBeenLastCalledWith(false);
  });
});

describe("landing page", () => {
  it("keeps the 3D layer decorative: headline, calls to action and links stay plain, reachable HTML", async () => {
    const { container } = render(<LandingPage />);
    await screen.findByTestId("solar-canvas");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Walang Shutdown-Shutdown.");
    expect(screen.getByRole("link", { name: /Create an account/ })).toHaveAttribute("href", "/signup");
    expect(screen.getByRole("link", { name: "Diskarte home" })).toBeInTheDocument();
    // The canvas, the kinetic word and the emblem's anchor are hidden from assistive tech.
    expect(screen.getByTestId("solar-canvas").closest("[aria-hidden='true']")).not.toBeNull();
    const word = container.querySelector("[data-kinetic]")!;
    expect(word.textContent).toBe("DISKARTE");
    expect(word.closest("[aria-hidden='true']")).not.toBeNull();
    expect(scene.props!.emblem).toBe(true);
    // Headline and CTAs are never part of the hidden entrance stages (they are the LCP).
    expect(screen.getByRole("heading", { level: 1 }).closest("[data-reveal]")).toBeNull();
  });
});
