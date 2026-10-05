"use client";

import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Environment, Float, Lightformer, PerformanceMonitor } from "@react-three/drei";
import { AdditiveBlending, BufferGeometry, CanvasTexture, Color, Float32BufferAttribute, LatheGeometry, MathUtils, Vector2, type Group, type Points, type PointsMaterial } from "three";
import type { StageBusRef } from "./stage-bus";

const GOLD = "#FFB800";
const AMBER = "#F59E0B";
const CYAN = "#06B6D4";
/** World-space height of the emblem (hat + sun rays) at scale 1, used to fit it into its DOM anchor. */
const EMBLEM_SIZE = 5.4;

export interface SolarSceneProps {
  bus: StageBusRef;
  /** DOM element the emblem (or, without one, the particle field) centres itself and sizes to. */
  anchor?: RefObject<HTMLElement | null>;
  /** Render the glass salakot emblem; otherwise just the solar particle field. */
  emblem?: boolean;
  /** Paused while the hero is off screen. */
  active: boolean;
  onReady: () => void;
  onContextLost: () => void;
}

/**
 * The decorative WebGL layer: a floating glass salakot under a Philippine sun, inside a swirl of
 * solar particles. Purely visual (the canvas is aria-hidden and ignores pointer events); pointer
 * movement is read from the window so every DOM control above it stays fully interactive.
 */
export default function SolarScene({ bus, anchor, emblem = true, active, onReady, onContextLost }: SolarSceneProps) {
  const [dpr, setDpr] = useState(1.5);
  const lost = useRef(onContextLost);
  useEffect(() => {
    lost.current = onContextLost;
  }, [onContextLost]);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      bus.current.pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
      bus.current.pointer.y = (e.clientY / window.innerHeight) * 2 - 1;
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, [bus]);

  return (
    <Canvas
      aria-hidden
      dpr={dpr}
      frameloop={active ? "always" : "never"}
      camera={{ position: [0, 0, 10], fov: 35, near: 0.1, far: 60 }}
      gl={{ alpha: true, antialias: true, powerPreference: "high-performance" }}
      style={{ pointerEvents: "none" }}
      onCreated={({ gl }) => {
        gl.domElement.addEventListener("webglcontextlost", () => lost.current(), { once: true });
      }}
    >
      <PerformanceMonitor onDecline={() => setDpr(1)} onIncline={() => setDpr(1.5)} />
      <ambientLight intensity={0.35} />
      <directionalLight position={[4, 6, 5]} intensity={1.6} color={GOLD} />
      <pointLight position={[-5, -2, 3]} intensity={18} color={CYAN} />
      {/* Studio lighting rendered once, locally: no HDR download (and nothing for the CSP to allow). */}
      <Environment resolution={128} frames={1}>
        <Lightformer form="rect" intensity={4} color={GOLD} position={[4, 3, 4]} scale={[5, 2, 1]} />
        <Lightformer form="rect" intensity={2.5} color={CYAN} position={[-5, -1, 3]} scale={[3, 4, 1]} />
        <Lightformer form="ring" intensity={3} color="#ffffff" position={[0, 5, -5]} scale={4} />
      </Environment>
      <Stage bus={bus} anchor={anchor} emblem={emblem} onReady={onReady} />
    </Canvas>
  );
}

/** Reads the anchor's box (relative to the canvas) in world units at z = 0. */
function useAnchorFrame(anchor: RefObject<HTMLElement | null> | undefined) {
  const gl = useThree((s) => s.gl);
  const size = useThree((s) => s.size);
  const viewport = useThree((s) => s.viewport);
  const frame = useRef({ x: 0, y: 0, size: viewport.height * 0.6 });

  useEffect(() => {
    const measure = () => {
      const el = anchor?.current;
      const box = gl.domElement.getBoundingClientRect();
      if (!el || box.width === 0 || box.height === 0) {
        frame.current = { x: 0, y: 0, size: viewport.height * 0.6 };
        return;
      }
      const r = el.getBoundingClientRect();
      frame.current = {
        x: ((r.left + r.width / 2 - box.left) / box.width - 0.5) * viewport.width,
        y: -((r.top + r.height / 2 - box.top) / box.height - 0.5) * viewport.height,
        size: (Math.min(r.width, r.height) / box.height) * viewport.height,
      };
    };
    measure();
    // Text reflow (late web fonts) moves the anchor without resizing the canvas: watch the page too.
    const ro = new ResizeObserver(measure);
    if (anchor?.current) ro.observe(anchor.current);
    ro.observe(document.body);
    return () => ro.disconnect();
  }, [anchor, gl, size.width, size.height, viewport.width, viewport.height]);

  return frame;
}

function Stage({ bus, anchor, emblem, onReady }: { bus: StageBusRef; anchor?: RefObject<HTMLElement | null>; emblem: boolean; onReady: () => void }) {
  const frame = useAnchorFrame(anchor);
  const viewport = useThree((s) => s.viewport);
  const rig = useRef<Group>(null);
  const tilt = useRef<Group>(null);
  const hat = useRef<Group>(null);
  // Eased entrance progress. The scene may finish loading after the DOM entrance has played: it then
  // eases itself in rather than popping.
  const intro = useRef(0);
  const scroll = useRef(0);
  const ready = useRef(false);

  useFrame((state, dt) => {
    if (!ready.current) {
      ready.current = true;
      onReady();
    }
    const delta = Math.min(dt, 1 / 20);
    const { intro: target, scroll: progress, pointer } = bus.current;
    intro.current = Math.min(MathUtils.clamp(target, 0, 1), MathUtils.damp(intro.current, 1, 2.2, delta));
    scroll.current = MathUtils.damp(scroll.current, progress, 6, delta);
    const f = frame.current;
    const s = scroll.current;

    rig.current!.position.set(f.x, f.y + s * f.size * 0.35, 0);
    // Inertia tilt toward the pointer, plus a partial turn as the hero scrolls away.
    const t = tilt.current!;
    t.rotation.x = MathUtils.damp(t.rotation.x, pointer.y * 0.28, 3, delta);
    t.rotation.y = MathUtils.damp(t.rotation.y, pointer.x * 0.45 + s * Math.PI * 0.6 + (1 - intro.current) * -0.8, 3, delta);
    hat.current?.scale.setScalar(Math.max(0.001, (f.size / EMBLEM_SIZE) * (0.55 + 0.45 * intro.current) * (1 - s * 0.25)));

    // The camera dollies back as you scroll, so the scene recedes behind the content.
    state.camera.position.z = MathUtils.damp(state.camera.position.z, 10 + s * 3, 4, delta);
  });

  return (
    <group ref={rig}>
      <group ref={tilt}>
        {/* The dust spans the viewport whatever the anchor's size. */}
        <group scale={Math.max(viewport.width, viewport.height) / 16}>
          <SolarField intro={intro} scroll={scroll} />
        </group>
        {emblem && (
          <group ref={hat}>
            <Float speed={1.4} rotationIntensity={0.35} floatIntensity={0.6} floatingRange={[-0.12, 0.12]}>
              <GlassSalakot />
            </Float>
          </group>
        )}
      </group>
    </group>
  );
}

/** Closed profile (radius, height) of a salakot shell: a steep crown flaring into a wide brim. */
const SALAKOT_PROFILE = [
  [0, 1.32],
  [0.12, 1.2],
  [0.42, 0.86],
  [0.86, 0.46],
  [1.38, 0.12],
  [1.86, -0.12],
  [1.94, -0.2],
  [1.84, -0.24],
  [1.32, 0.0],
  [0.8, 0.32],
  [0.38, 0.7],
  [0.1, 1.04],
  [0, 1.12],
].map(([x, y]) => new Vector2(x, y));

function GlassSalakot() {
  const shell = useMemo(() => new LatheGeometry(SALAKOT_PROFILE, 96), []);
  // A coarser lathe of the same profile, drawn as wireframe: the woven ribs and rings.
  const weave = useMemo(() => new LatheGeometry(SALAKOT_PROFILE.slice(0, 7), 28), []);
  useEffect(
    () => () => {
      shell.dispose();
      weave.dispose();
    },
    [shell, weave],
  );

  return (
    <group rotation={[0.32, 0, -0.12]} position={[0, -0.25, 0]}>
      <SunRays />
      <mesh geometry={shell}>
        <meshPhysicalMaterial
          transmission={1}
          thickness={0.35}
          roughness={0.06}
          ior={1.5}
          iridescence={0.6}
          iridescenceIOR={1.3}
          clearcoat={1}
          clearcoatRoughness={0.05}
          specularIntensity={1}
          color="#FFFFFF"
          attenuationColor="#FFE3A0"
          attenuationDistance={6}
          envMapIntensity={2}
          transparent
          opacity={0.92}
        />
      </mesh>
      <mesh geometry={weave} scale={1.004}>
        <meshBasicMaterial color={GOLD} wireframe transparent opacity={0.4} depthWrite={false} />
      </mesh>
      {/* The salakot's metal finial. */}
      <mesh position={[0, 1.42, 0]}>
        <octahedronGeometry args={[0.16, 0]} />
        <meshStandardMaterial color={GOLD} emissive={AMBER} emissiveIntensity={0.6} metalness={0.9} roughness={0.25} />
      </mesh>
    </group>
  );
}

/** The eight rays of the Philippine sun, slowly turning behind the hat. */
function SunRays() {
  const ref = useRef<Group>(null);
  useFrame((_, dt) => {
    ref.current!.rotation.z += Math.min(dt, 1 / 20) * 0.12;
  });
  return (
    <group ref={ref} position={[0, 0.55, -0.9]}>
      {Array.from({ length: 8 }, (_, i) => {
        const a = (i / 8) * Math.PI * 2;
        return (
          <mesh key={i} position={[Math.cos(a) * 2.15, Math.sin(a) * 2.15, 0]} rotation={[0, 0, a - Math.PI / 2]}>
            <coneGeometry args={[0.2, 0.95, 4]} />
            <meshStandardMaterial color={GOLD} emissive={AMBER} emissiveIntensity={0.9} metalness={0.7} roughness={0.3} />
          </mesh>
        );
      })}
      <mesh>
        <torusGeometry args={[1.62, 0.025, 8, 96]} />
        <meshBasicMaterial color={GOLD} transparent opacity={0.55} />
      </mesh>
    </group>
  );
}

/** Soft round sprite for the particles (a radial gradient drawn once). */
function useDotTexture() {
  const texture = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const ctx = c.getContext("2d")!;
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.35, "rgba(255,255,255,0.55)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    return new CanvasTexture(c);
  }, []);
  useEffect(() => () => texture.dispose(), [texture]);
  return texture;
}

/** Small deterministic PRNG (mulberry32): the same field on every render and every visit. */
function seeded(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildSolarField(count: number) {
  const random = seeded(0x5017a2);
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const gold = new Color(GOLD);
  const amber = new Color(AMBER);
  const cyan = new Color(CYAN);
  const mixed = new Color();
  for (let i = 0; i < count; i++) {
    const arm = i % 3;
    const r = 1.6 + Math.pow(random(), 0.7) * 7.5;
    const angle = (arm / 3) * Math.PI * 2 + r * 0.42;
    const spread = 0.35 + r * 0.08;
    positions[i * 3] = Math.cos(angle) * r + (random() - 0.5) * spread * 2;
    positions[i * 3 + 1] = (random() - 0.5) * spread * 1.2;
    positions[i * 3 + 2] = Math.sin(angle) * r + (random() - 0.5) * spread * 2;
    // Gold at the core fading to amber further out, with a sprinkle of neon cyan.
    if (random() < 0.1) mixed.copy(cyan);
    else mixed.copy(gold).lerp(amber, Math.min(1, r / 9));
    colors.set([mixed.r, mixed.g, mixed.b], i * 3);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
  return geometry;
}

/** A three-armed spiral of solar dust, tilted toward the viewer. */
function SolarField({ intro, scroll }: { intro: RefObject<number>; scroll: RefObject<number> }) {
  const width = useThree((s) => s.size.width);
  const count = width < 640 ? 900 : 2200;
  const map = useDotTexture();
  const points = useRef<Points>(null);
  const material = useRef<PointsMaterial>(null);

  const geometry = useMemo(() => buildSolarField(count), [count]);
  useEffect(() => () => geometry.dispose(), [geometry]);

  useFrame((_, dt) => {
    const p = points.current!;
    const delta = Math.min(dt, 1 / 20);
    p.rotation.y += delta * 0.05;
    p.scale.setScalar(0.2 + 0.8 * intro.current + scroll.current * 0.5);
    material.current!.opacity = 0.85 * intro.current * (1 - scroll.current * 0.5);
  });

  return (
    <points ref={points} geometry={geometry} rotation={[1.08, 0, 0.2]}>
      <pointsMaterial
        ref={material}
        map={map}
        size={0.13}
        sizeAttenuation
        vertexColors
        transparent
        opacity={0}
        depthWrite={false}
        blending={AdditiveBlending}
      />
    </points>
  );
}
