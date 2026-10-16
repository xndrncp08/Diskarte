"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import "./hero-logo.css";

const ElectricLogo = dynamic(() => import("./react-bits/ElectricLogo").catch(() => ({ default: () => null })), { ssr: false });
const SOURCE = "/brand/diskarte-original-mascot.png";

/** The source image stays visible independently of WebGL, loading, or motion preferences. */
export function HeroLogo() {
  const stage = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(false);
  const [paused, setPaused] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const node = stage.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const media = matchMedia("(prefers-reduced-motion: no-preference) and (min-width: 768px) and (hover: hover) and (pointer: fine)");
    const device = navigator as Navigator & { deviceMemory?: number; connection?: EventTarget & { saveData?: boolean; effectiveType?: string } };
    let inView = false;
    const update = () => setActive(
      media.matches && inView && !document.hidden &&
      !device.connection?.saveData && !/^(slow-)?2g$/.test(device.connection?.effectiveType ?? "") &&
      (device.deviceMemory ?? 8) >= 4 && (navigator.hardwareConcurrency || 8) >= 4,
    );
    const observer = new IntersectionObserver(([entry]) => { inView = entry.isIntersecting; update(); });
    const loseContext = () => setFailed(true);
    node.addEventListener("webglcontextlost", loseContext, true);
    observer.observe(node);
    media.addEventListener("change", update);
    document.addEventListener("visibilitychange", update);
    device.connection?.addEventListener("change", update);
    return () => {
      observer.disconnect();
      node.removeEventListener("webglcontextlost", loseContext, true);
      media.removeEventListener("change", update);
      document.removeEventListener("visibilitychange", update);
      device.connection?.removeEventListener("change", update);
    };
  }, []);

  const animate = active && !paused && !failed;
  return (
    <div className="hero-logo" data-testid="hero-logo">
      <div ref={stage} className={`hero-logo-stage${animate ? " hero-logo-idle" : ""}`}>
        <Image src="/brand/diskarte-original-mascot.webp" alt="Diskarte salakot mascot" width={1274} height={1321} unoptimized preload className="hero-logo-image" />
        {animate && <div className="hero-logo-electric" aria-hidden>
          <ElectricLogo src={SOURCE} color="#FFE7A3" glowColor="#FFB800" scale={0.76} intensity={0.6} glow={0.45} thickness={0.65} strands={2} bend={0.25} crackle={0.3} arcs={0.18} flicker={0} fill={0} speed={0.55} interactive={false} />
        </div>}
      </div>
      {active && !failed && <button type="button" className="hero-logo-toggle" aria-pressed={paused} onClick={() => setPaused(!paused)}>{paused ? "Play logo animation" : "Pause logo animation"}</button>}
    </div>
  );
}
