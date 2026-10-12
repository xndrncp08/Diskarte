import { act, render, screen, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetLowDataCache, setLowDataMode } from "@/lib/low-data";

/** The real scenes need a GPU; these stand-ins record their props and let a test fire callbacks. */
type SceneProps = { onReady: () => void; onContextLost: () => void; active: boolean };
const scenes = vi.hoisted(() => ({ mascot: { mounts: 0, props: null as null | SceneProps }, field: { mounts: 0, props: null as null | SceneProps } }));
function stub(kind: "mascot" | "field") {
  return function SceneStub(props: SceneProps) {
    scenes[kind].props = props;
    useEffect(() => {
      scenes[kind].mounts++;
    }, []);
    return <canvas data-testid={`${kind}-canvas`} />;
  };
}
vi.mock("@/components/three/MascotScene", () => ({ default: stub("mascot") }));
vi.mock("@/components/three/ParticleMeshScene", () => ({ default: stub("field") }));

const { Diskarte3DLogo } = await import("@/components/three/Diskarte3DLogo");
const { ParticleBackdrop } = await import("@/components/three/ParticleBackdrop");
const { resetWebGLProbe, useStageBus } = await import("@/components/three/stage-bus");

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

function Backdrop() {
  const stageRef = useStageBus();
  return <ParticleBackdrop bus={stageRef} />;
}

beforeEach(() => {
  localStorage.clear();
  resetLowDataCache();
  for (const s of Object.values(scenes)) Object.assign(s, { mounts: 0, props: null });
  setReducedMotion(false);
  setWebGL(true);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("<Diskarte3DLogo />", () => {
  it("holds its box with a geometric skeleton until the WebGL mascot draws, then crossfades", async () => {
    const { container } = render(<Diskarte3DLogo className="size-40" />);
    const box = container.firstElementChild as HTMLElement;
    expect(box).toHaveAttribute("aria-hidden", "true");
    expect(box).toHaveClass("size-40");
    expect(screen.getByTestId("logo-skeleton")).toBeInTheDocument();
    expect(box).toHaveAttribute("data-logo3d", "loading");

    await screen.findByTestId("mascot-canvas");
    act(() => scenes.mascot.props!.onReady());
    expect(box).toHaveAttribute("data-logo3d", "3d");
    expect(screen.getByTestId("logo-skeleton")).toHaveClass("opacity-0");
  });

  it("shows the vector mascot with a plain fade for reduced motion, and never loads the 3D code", async () => {
    setReducedMotion(true);
    const { container } = render(<Diskarte3DLogo />);
    await act(async () => {});
    expect(container.firstElementChild).toHaveAttribute("data-logo3d", "static");
    expect(screen.getByTestId("diskarte-logo").parentElement).toHaveClass("fade-soft");
    expect(screen.queryByTestId("logo-skeleton")).not.toBeInTheDocument();
    expect(scenes.mascot.mounts).toBe(0);
  });

  it("stays on the vector mascot in low-data mode and without WebGL", async () => {
    setLowDataMode(true);
    const { unmount } = render(<Diskarte3DLogo />);
    await act(async () => {});
    expect(screen.queryByTestId("mascot-canvas")).not.toBeInTheDocument();
    unmount();

    setLowDataMode(false);
    setWebGL(false);
    render(<Diskarte3DLogo />);
    await act(async () => {});
    expect(screen.queryByTestId("mascot-canvas")).not.toBeInTheDocument();
    expect(scenes.mascot.mounts).toBe(0);
  });

  it("falls back to the vector mascot when the GPU context is lost", async () => {
    const { container } = render(<Diskarte3DLogo />);
    await screen.findByTestId("mascot-canvas");
    act(() => scenes.mascot.props!.onReady());
    act(() => scenes.mascot.props!.onContextLost());
    await waitFor(() => expect(screen.queryByTestId("mascot-canvas")).not.toBeInTheDocument());
    expect(container.firstElementChild).toHaveAttribute("data-logo3d", "static");
  });
});

describe("<ParticleBackdrop />", () => {
  it("renders the particle mesh over the ambient glow, decorative and click-through", async () => {
    const { container } = render(<Backdrop />);
    const layer = container.firstElementChild as HTMLElement;
    expect(layer).toHaveAttribute("aria-hidden", "true");
    expect(layer).toHaveClass("pointer-events-none");
    await screen.findByTestId("field-canvas");
    act(() => scenes.field.props!.onReady());
    expect(layer).toHaveAttribute("data-backdrop", "3d");
  });

  it("is a static gradient under reduced motion", async () => {
    setReducedMotion(true);
    const { container } = render(<Backdrop />);
    await act(async () => {});
    expect(screen.getByTestId("ambient-glow")).toBeInTheDocument();
    expect(screen.queryByTestId("field-canvas")).not.toBeInTheDocument();
    expect(container.firstElementChild).toHaveAttribute("data-backdrop", "static");
  });
});
