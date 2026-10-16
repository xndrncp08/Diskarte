import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HeroLogo } from "../HeroLogo";

vi.mock("next/dynamic", () => ({ default: () => function Effect() { return <div data-testid="electric-effect" />; } }));
vi.mock("next/image", () => ({ default: ({ preload, unoptimized, ...props }: React.ImgHTMLAttributes<HTMLImageElement> & { preload?: boolean; unoptimized?: boolean }) => {
  void preload;
  void unoptimized;
  // eslint-disable-next-line @next/next/no-img-element
  return <img {...props} alt={props.alt} />;
} }));

afterEach(() => vi.unstubAllGlobals());

function setup(eligible: boolean) {
  let intersect: IntersectionObserverCallback;
  const disconnect = vi.fn();
  vi.stubGlobal("IntersectionObserver", class {
    constructor(callback: IntersectionObserverCallback) { intersect = callback; }
    observe() {}
    disconnect = disconnect;
  });
  const media = { matches: eligible, addEventListener: vi.fn(), removeEventListener: vi.fn() };
  vi.stubGlobal("matchMedia", () => media);
  const view = render(<HeroLogo />);
  const visible = (value: boolean) => act(() => intersect([{ isIntersecting: value } as IntersectionObserverEntry], {} as IntersectionObserver));
  return { ...view, visible, media, disconnect };
}

describe("landing electric logo lifecycle", () => {
  it("keeps the original image and skips the effect for reduced motion or mobile", () => {
    const { visible } = setup(false);
    visible(true);
    expect(screen.getByRole("img", { name: "Diskarte salakot mascot" })).toHaveAttribute("src", "/brand/diskarte-original-mascot.webp");
    expect(screen.queryByTestId("electric-effect")).not.toBeInTheDocument();
  });

  it("pauses, resumes and releases the effect offscreen and on unmount", () => {
    const { visible, unmount, media, disconnect } = setup(true);
    visible(true);
    expect(screen.getByTestId("electric-effect")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Pause logo animation" }));
    expect(screen.queryByTestId("electric-effect")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Play logo animation" }));
    expect(screen.getByTestId("electric-effect")).toBeInTheDocument();
    visible(false);
    expect(screen.queryByTestId("electric-effect")).not.toBeInTheDocument();
    unmount();
    expect(disconnect).toHaveBeenCalledOnce();
    expect(media.removeEventListener).toHaveBeenCalledWith("change", expect.any(Function));
  });

  it("keeps a static fallback after WebGL context loss", () => {
    const { visible } = setup(true);
    visible(true);
    act(() => { screen.getByTestId("electric-effect").dispatchEvent(new Event("webglcontextlost", { bubbles: true })); });
    visible(true);
    expect(screen.queryByTestId("electric-effect")).not.toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Diskarte salakot mascot" })).toBeInTheDocument();
  });
});
