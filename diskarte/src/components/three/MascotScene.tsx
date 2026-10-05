"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Environment, Float, Lightformer, PerformanceMonitor } from "@react-three/drei";
import { AdditiveBlending, CanvasTexture, MathUtils, type Group, type Mesh, type MeshBasicMaterial, type MeshPhysicalMaterial, type MeshStandardMaterial, type PointLight } from "three";
import {
  BUBBLE_BEVEL,
  BUBBLE_DEPTH,
  BUBBLE_PIVOT,
  BUBBLE_TILT,
  createBubbleCore,
  createBubbleShell,
  createHatGeometry,
  createRayGeometry,
  createSparkleGeometry,
  createWeaveTexture,
  EYES,
  HAT_BASE,
  HAT_HEIGHT,
  HAT_LEAN,
  HAT_RADIUS,
  RAYS,
  SPARKLES,
  SUN_CENTER,
  SUN_RADIUS,
} from "./mascot-geometry";
import { usePointerTracking, type StageBusRef } from "./stage-bus";

const GOLD = "#FFB800";
const AMBER = "#F59E0B";
const CREAM = "#FFF8EC";
const INK = "#0B1020";

export interface MascotSceneProps {
  bus: StageBusRef;
  /** False while the logo's box is off screen: the render loop stops. */
  active: boolean;
  onReady: () => void;
  onContextLost: () => void;
}

/**
 * The 3D Diskarte mascot: the official salakot-wearing chat bubble rebuilt as physically based
 * meshes — a frosted-glass body around a glowing core, a woven straw salakot with a polished gold
 * rim, and the Philippine sun's rays behind. GSAP drives scale, the camera's entry orbit and the
 * brightness through `bus`; the pointer tilts it with inertia and steers a moving key light.
 */
export default function MascotScene({ bus, active, onReady, onContextLost }: MascotSceneProps) {
  const [dpr, setDpr] = useState(1.75);
  const lost = useRef(onContextLost);
  useEffect(() => {
    lost.current = onContextLost;
  }, [onContextLost]);
  usePointerTracking(bus);

  return (
    <Canvas
      aria-hidden
      dpr={dpr}
      frameloop={active ? "always" : "never"}
      camera={{ position: [0, 0, 10], fov: 30, near: 0.1, far: 50 }}
      gl={{ alpha: true, antialias: true, powerPreference: "high-performance" }}
      style={{ pointerEvents: "none" }}
      onCreated={({ gl }) => {
        gl.domElement.addEventListener("webglcontextlost", () => lost.current(), { once: true });
      }}
    >
      <PerformanceMonitor onDecline={() => setDpr(1)} onIncline={() => setDpr(1.75)} />
      {/* Studio lighting baked once, locally (no HDR download): a soft key box, a gold kicker, a cyan rim. */}
      <Environment resolution={256} frames={1}>
        <Lightformer form="rect" intensity={2.2} color="#ffffff" position={[0, 4, 6]} scale={[8, 3, 1]} />
        <Lightformer form="rect" intensity={3} color={GOLD} position={[5, 1, 3]} scale={[3, 5, 1]} />
        <Lightformer form="rect" intensity={2} color="#06B6D4" position={[-6, -1, 2]} scale={[2, 5, 1]} />
        <Lightformer form="ring" intensity={1.5} color="#ffffff" position={[0, 0, -6]} scale={6} />
      </Environment>
      <Rig bus={bus} onReady={onReady} />
    </Canvas>
  );
}

function Rig({ bus, onReady }: { bus: StageBusRef; onReady: () => void }) {
  const stage = useRef<Group>(null);
  const tilt = useRef<Group>(null);
  const key = useRef<PointLight>(null);
  const rim = useRef<PointLight>(null);
  const ready = useRef(false);
  const glow = useRef(0);

  useFrame((state, dt) => {
    if (!ready.current) {
      ready.current = true;
      onReady();
    }
    const delta = Math.min(dt, 1 / 20);
    const { logo, orbit, glow: target, scroll, pointer } = bus.current;
    glow.current = MathUtils.damp(glow.current, target, 8, delta);

    // Entry orbit: from high on the left, far back, round to the front.
    const o = MathUtils.clamp(orbit, 0, 1);
    const azimuth = MathUtils.lerp(-1.05, 0, o);
    const elevation = MathUtils.lerp(0.5, 0.04, o);
    const distance = MathUtils.lerp(16, 11, o) + scroll * 2.5;
    const cam = state.camera;
    cam.position.set(Math.sin(azimuth) * Math.cos(elevation) * distance, Math.sin(elevation) * distance, Math.cos(azimuth) * Math.cos(elevation) * distance);
    cam.lookAt(0, 0, 0);

    stage.current!.scale.setScalar(Math.max(0.001, logo));
    // Inertia tilt toward the pointer.
    const t = tilt.current!;
    t.rotation.y = MathUtils.damp(t.rotation.y, pointer.x * 0.42, 3.2, delta);
    t.rotation.x = MathUtils.damp(t.rotation.x, pointer.y * 0.26, 3.2, delta);

    // The key light follows the pointer; brightness rides the timeline's glow.
    const k = key.current!;
    k.position.x = MathUtils.damp(k.position.x, pointer.x * 5, 4, delta);
    k.position.y = MathUtils.damp(k.position.y, -pointer.y * 4 + 1, 4, delta);
    k.intensity = 40 * (0.2 + 0.8 * glow.current);
    rim.current!.intensity = 30 * (0.3 + 0.7 * glow.current);
  });

  return (
    <>
      <ambientLight intensity={0.3} />
      <pointLight ref={key} position={[0, 1, 5]} color="#FFE7B0" distance={18} decay={2} />
      <pointLight ref={rim} position={[-4, 2, -3]} color="#06B6D4" distance={14} decay={2} />
      <group ref={stage}>
        <group ref={tilt}>
          <Float speed={1.3} rotationIntensity={0.25} floatIntensity={0.5} floatingRange={[-0.1, 0.1]}>
            <Mascot glow={glow} />
          </Float>
        </group>
      </group>
    </>
  );
}

function Mascot({ glow }: { glow: { current: number } }) {
  return (
    <group>
      <Sun glow={glow} />
      <Bubble glow={glow} />
      <Salakot />
      <Sparkles glow={glow} />
    </group>
  );
}

/** Radial gradient sprite used for the sun's halo and its beams. */
function useGlowTexture(stops: [number, string][]) {
  const key = JSON.stringify(stops);
  const texture = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const ctx = c.getContext("2d")!;
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    for (const [at, color] of JSON.parse(key) as [number, string][]) g.addColorStop(at, color);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    return new CanvasTexture(c);
  }, [key]);
  useEffect(() => () => texture.dispose(), [texture]);
  return texture;
}

function Sun({ glow }: { glow: { current: number } }) {
  const rays = useRef<Group>(null);
  const halo = useRef<MeshBasicMaterial>(null);
  const beams = useRef<Group>(null);
  const disc = useRef<MeshStandardMaterial>(null);
  const mainRay = useMemo(() => createRayGeometry(true), []);
  const minorRay = useMemo(() => createRayGeometry(false), []);
  useEffect(
    () => () => {
      mainRay.dispose();
      minorRay.dispose();
    },
    [mainRay, minorRay],
  );
  const haloMap = useGlowTexture([
    [0, "rgba(255,214,120,0.9)"],
    [0.35, "rgba(255,184,0,0.35)"],
    [1, "rgba(255,184,0,0)"],
  ]);

  useFrame((state, dt) => {
    const delta = Math.min(dt, 1 / 20);
    rays.current!.rotation.z += delta * 0.06;
    beams.current!.rotation.z -= delta * 0.03;
    const g = glow.current;
    halo.current!.opacity = 0.55 * g;
    disc.current!.emissiveIntensity = 0.5 + 0.9 * g;
    // Sunbeams breathe gently around their timeline brightness.
    const pulse = 0.85 + 0.15 * Math.sin(state.clock.elapsedTime * 1.4);
    beams.current!.children.forEach((child, i) => {
      ((child as Mesh).material as MeshBasicMaterial).opacity = 0.22 * g * (i % 2 ? pulse : 2 - pulse);
    });
  });

  return (
    <group position={[SUN_CENTER[0], SUN_CENTER[1], -0.7]}>
      <mesh position={[0, 0, -0.3]}>
        <planeGeometry args={[5, 5]} />
        <meshBasicMaterial ref={halo} map={haloMap} transparent depthWrite={false} blending={AdditiveBlending} />
      </mesh>
      {/* Golden sunbeams: long, soft wedges of light fanning out from the sun. */}
      <group ref={beams} position={[0, 0, -0.25]}>
        {Array.from({ length: 6 }, (_, i) => (
          <mesh key={i} rotation={[0, 0, (i / 6) * Math.PI * 2 + 0.3]}>
            <planeGeometry args={[0.5, 9]} />
            <meshBasicMaterial map={haloMap} color={GOLD} transparent opacity={0} depthWrite={false} blending={AdditiveBlending} />
          </mesh>
        ))}
      </group>
      <mesh scale={[1, 1, 0.35]}>
        <sphereGeometry args={[SUN_RADIUS, 48, 24]} />
        <meshStandardMaterial ref={disc} color={GOLD} emissive={AMBER} metalness={0.6} roughness={0.28} />
      </mesh>
      <group ref={rays}>
        {RAYS.map(({ angle, main }, i) => (
          <mesh key={i} geometry={main ? mainRay : minorRay} rotation={[0, 0, angle]} position={[0, 0, main ? 0 : -0.06]}>
            <meshStandardMaterial color={main ? GOLD : "#EAB308"} emissive={AMBER} emissiveIntensity={main ? 0.45 : 0.3} metalness={0.85} roughness={0.22} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

function Bubble({ glow }: { glow: { current: number } }) {
  const shell = useMemo(() => createBubbleShell(), []);
  const core = useMemo(() => createBubbleCore(), []);
  const coreMaterial = useRef<MeshStandardMaterial>(null);
  useEffect(
    () => () => {
      shell.dispose();
      core.dispose();
    },
    [shell, core],
  );
  useFrame(() => {
    coreMaterial.current!.emissiveIntensity = 0.25 + 0.55 * glow.current;
  });
  const front = BUBBLE_DEPTH / 2 + BUBBLE_BEVEL;

  return (
    <group position={[BUBBLE_PIVOT[0], BUBBLE_PIVOT[1], 0]} rotation={[0, 0, BUBBLE_TILT]}>
      {/* Opaque core: the frosted shell blurs it into a softly lit cream body. */}
      <mesh geometry={core}>
        <meshStandardMaterial ref={coreMaterial} color={CREAM} emissive="#FFE9C2" roughness={0.6} />
      </mesh>
      <mesh geometry={shell}>
        <meshPhysicalMaterial
          color="#ffffff"
          transmission={1}
          roughness={0.38}
          thickness={1.1}
          ior={1.42}
          attenuationColor="#FFF1D2"
          attenuationDistance={2.5}
          clearcoat={1}
          clearcoatRoughness={0.12}
          specularIntensity={0.9}
          envMapIntensity={1.2}
        />
      </mesh>
      {EYES.map(([x, y], i) => (
        <mesh key={i} position={[x, y, front - 0.05]} scale={[1, 1, 0.45]}>
          <capsuleGeometry args={[0.15, 0.3, 8, 20]} />
          <meshPhysicalMaterial color={INK} roughness={0.25} clearcoat={1} clearcoatRoughness={0.05} />
        </mesh>
      ))}
    </group>
  );
}

function Salakot() {
  const hat = useMemo(() => createHatGeometry(), []);
  const weave = useMemo(() => createWeaveTexture(), []);
  useEffect(
    () => () => {
      hat.dispose();
      weave.dispose();
    },
    [hat, weave],
  );
  const straw = useRef<MeshPhysicalMaterial>(null);

  return (
    <group position={[HAT_BASE[0], HAT_BASE[1], 0.08]} rotation={[0.14, 0, HAT_LEAN]}>
      <mesh geometry={hat}>
        <meshPhysicalMaterial
          ref={straw}
          map={weave}
          bumpMap={weave}
          bumpScale={2.2}
          roughness={0.62}
          sheen={1}
          sheenColor="#FFD27A"
          sheenRoughness={0.45}
          clearcoat={0.3}
          clearcoatRoughness={0.4}
        />
      </mesh>
      {/* Polished gold rim with a metallic sheen. */}
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, -0.03, 0]}>
        <torusGeometry args={[HAT_RADIUS + 0.03, 0.06, 20, 160]} />
        <meshPhysicalMaterial color={GOLD} metalness={1} roughness={0.18} clearcoat={1} clearcoatRoughness={0.06} envMapIntensity={1.6} />
      </mesh>
      {/* Finial. */}
      <mesh position={[0, HAT_HEIGHT + 0.1, 0]}>
        <coneGeometry args={[0.1, 0.26, 24]} />
        <meshPhysicalMaterial color={GOLD} metalness={1} roughness={0.2} clearcoat={1} envMapIntensity={1.6} />
      </mesh>
    </group>
  );
}

function Sparkles({ glow }: { glow: { current: number } }) {
  const geometries = useMemo(() => SPARKLES.map((s) => createSparkleGeometry(s.r)), []);
  useEffect(() => () => geometries.forEach((g) => g.dispose()), [geometries]);
  const group = useRef<Group>(null);
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    group.current!.children.forEach((child, i) => {
      const twinkle = 0.85 + 0.15 * Math.sin(t * 2.2 + i * 1.7);
      child.scale.setScalar(twinkle * Math.min(1, glow.current + 0.2));
      child.rotation.z = Math.sin(t * 0.8 + i) * 0.25;
    });
  });
  return (
    <group ref={group}>
      {SPARKLES.map((s, i) => (
        <mesh key={i} geometry={geometries[i]} position={[s.at[0], s.at[1], 0.4]}>
          <meshStandardMaterial color={GOLD} emissive={AMBER} emissiveIntensity={0.8} metalness={0.7} roughness={0.25} />
        </mesh>
      ))}
    </group>
  );
}
