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
const { default: LandingPage } = await import("@/app/page");
const { AuthEntrance } = await import("@/components/motion/AuthEntrance");
const { gsap } = await import("@/components/motion/gsap");

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

describe("landing and auth stages", () => {
  beforeEach(() => void gsap.globalTimeline.timeScale(40));
  afterEach(() => void gsap.globalTimeline.timeScale(1));
  /** The entrance hides the card until Stage 3; wait for the timeline to finish. */
  const settle = (container: HTMLElement) => waitFor(() => expect(container.querySelector("[data-entrance]")).toHaveAttribute("data-entrance", "done"));

  function configure() {
    vi.stubEnv("SUPABASE_URL", "https://proj.supabase.co");
    vi.stubEnv("SUPABASE_ANON_KEY", "anon-key-that-is-long-enough");
    vi.stubEnv("LIVEKIT_URL", "wss://proj.livekit.cloud");
  }

  it("landing: the sign-in card is plain, reachable HTML beside the decorative 3D layers", async () => {
    configure();
    const { container } = render(await LandingPage());
    await screen.findByTestId("mascot-canvas");
    await settle(container);
    expect(screen.getByTestId("field-canvas")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Walang Shutdown-Shutdown.");
    // Stage 3: the card holds a real form, labelled fields and the sign-up path.
    const card = container.querySelector("#sign-in")!;
    expect(card).toHaveAttribute("data-reveal", "card");
    expect(card.firstElementChild).toHaveClass("backdrop-blur-2xl", "bg-slate-900/50", "border-white/10", "shadow-2xl");
    expect(screen.getByLabelText("Email")).toHaveAttribute("type", "email");
    expect(screen.getByRole("button", { name: "Sign in" })).toHaveAttribute("type", "submit");
    expect(screen.getByRole("link", { name: /Create an account/ })).toHaveAttribute("href", "/signup");
    expect(screen.getByRole("link", { name: "Log in" })).toHaveAttribute("href", "#sign-in");
    // The headline is never held back by the entrance (it's the LCP); the canvases are hidden from AT.
    expect(screen.getByRole("heading", { level: 1 }).closest("[data-reveal]")).toBeNull();
    for (const id of ["mascot-canvas", "field-canvas"]) expect(screen.getByTestId(id).closest("[aria-hidden='true']")).not.toBeNull();
    // "DISKARTE" is split into letters for the stagger, but read once.
    expect(container.querySelectorAll("[data-reveal='letter']")).toHaveLength(8);
    expect(container.querySelector("[data-reveal='letter']")!.parentElement!.querySelector(".sr-only")).toHaveTextContent("Diskarte");
  });

  it("landing without configuration explains what's missing instead of a broken form", async () => {
    const { container } = render(await LandingPage());
    await settle(container);
    expect(screen.getByRole("alert")).toHaveTextContent("Missing configuration");
    expect(screen.queryByLabelText("Email")).not.toBeInTheDocument();
  });

  it("auth pages: logo, split word, tagline, then the glass card with the form", async () => {
    const { container } = render(
      <AuthEntrance tagline="Walang Shutdown-Shutdown">
        <input aria-label="Email" />
      </AuthEntrance>,
    );
    await screen.findByTestId("mascot-canvas");
    const order = ["logo", "letter", "tagline", "card"].map((k) => container.querySelector(`[data-reveal='${k}']`)!);
    for (let i = 1; i < order.length; i++) expect(order[i - 1].compareDocumentPosition(order[i]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByLabelText("Email").closest("[data-reveal='card']")).not.toBeNull();
  });
});
