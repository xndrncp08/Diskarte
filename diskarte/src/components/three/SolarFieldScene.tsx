"use client";

import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { AdditiveBlending, BufferGeometry, CanvasTexture, Float32BufferAttribute, MathUtils, type Mesh, type ShaderMaterial } from "three";
import { usePointerTracking, type StageBusRef } from "./stage-bus";

/** The workspace sits behind many blurred glass panels: render at ~30 fps, not every display frame. */
const FPS = 30;

export interface SolarFieldSceneProps {
  bus: StageBusRef;
  onContextLost: () => void;
}

/**
 * Workspace backdrop: slow solar dust drifting in depth, lit by a soft gold light that follows the
 * cursor (dust near it brightens and swells), with a gentle camera parallax. Rendered on demand at a
 * capped frame rate and paused while the tab is hidden.
 */
export default function SolarFieldScene({ bus, onContextLost }: SolarFieldSceneProps) {
  const lost = useRef(onContextLost);
  useEffect(() => {
    lost.current = onContextLost;
  }, [onContextLost]);
  usePointerTracking(bus);

  return (
    <Canvas
      aria-hidden
      dpr={1}
      frameloop="demand"
      camera={{ position: [0, 0, 12], fov: 50, near: 0.1, far: 60 }}
      gl={{ alpha: true, antialias: false, powerPreference: "low-power" }}
      style={{ pointerEvents: "none" }}
      onCreated={({ gl }) => {
        gl.domElement.addEventListener("webglcontextlost", () => lost.current(), { once: true });
      }}
    >
      <Throttle />
      <Field bus={bus} />
    </Canvas>
  );
}

function Throttle() {
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") invalidate();
    }, 1000 / FPS);
    return () => clearInterval(id);
  }, [invalidate]);
  return null;
}

const VERTEX = /* glsl */ `
  uniform float uTime;
  uniform vec2 uLight;
  uniform float uPixelRatio;
  attribute float aSeed;
  varying float vSeed;
  varying float vLit;
  varying float vDepth;
  void main() {
    vec3 p = position;
    float t = uTime * (0.04 + aSeed * 0.06);
    // Each mote circles slowly around its home and rises, wrapping at the top.
    p.x += sin(t * 6.2831 + aSeed * 40.0) * 0.6;
    p.z += cos(t * 6.2831 + aSeed * 40.0) * 0.6;
    p.y = mod(p.y + 9.0 + uTime * (0.05 + aSeed * 0.12), 18.0) - 9.0;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    float d = distance(p.xy, uLight);
    vLit = exp(-d * d / 9.0);
    vSeed = aSeed;
    vDepth = -mv.z;
    gl_PointSize = (1.4 + aSeed * 2.0 + vLit * 3.0) * uPixelRatio * (12.0 / vDepth);
  }
`;

const FRAGMENT = /* glsl */ `
  uniform float uTime;
  varying float vSeed;
  varying float vLit;
  varying float vDepth;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    if (d > 0.5) discard;
    float core = smoothstep(0.5, 0.0, d);
    vec3 gold = vec3(1.0, 0.72, 0.0);
    vec3 amber = vec3(0.96, 0.62, 0.04);
    vec3 cyan = vec3(0.02, 0.71, 0.83);
    vec3 base = vSeed > 0.92 ? cyan : mix(gold, amber, vSeed);
    float twinkle = 0.7 + 0.3 * sin(uTime * (0.6 + vSeed) + vSeed * 30.0);
    float fade = smoothstep(26.0, 8.0, vDepth);
    float alpha = core * fade * (0.18 + 0.55 * vLit) * twinkle;
    gl_FragColor = vec4(mix(base, vec3(1.0, 0.9, 0.6), vLit * 0.5), alpha);
  }
`;

function seeded(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildField(count: number) {
  const random = seeded(0xd15ca7);
  const positions = new Float32Array(count * 3);
  const seeds = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    positions[i * 3] = (random() - 0.5) * 34;
    positions[i * 3 + 1] = (random() - 0.5) * 18;
    positions[i * 3 + 2] = -12 + random() * 14;
    seeds[i] = random();
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("aSeed", new Float32BufferAttribute(seeds, 1));
  return geometry;
}

function Field({ bus }: { bus: StageBusRef }) {
  const viewport = useThree((s) => s.viewport);
  const material = useRef<ShaderMaterial>(null);
  const glow = useRef<Mesh>(null);
  const geometry = useMemo(() => buildField(1600), []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const uniforms = useMemo(() => ({ uTime: { value: 0 }, uLight: { value: [0, 0] }, uPixelRatio: { value: 1 } }), []);
  const glowMap = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const ctx = c.getContext("2d")!;
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, "rgba(255,184,0,0.55)");
    g.addColorStop(0.4, "rgba(255,184,0,0.14)");
    g.addColorStop(1, "rgba(255,184,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    return new CanvasTexture(c);
  }, []);
  useEffect(() => () => glowMap.dispose(), [glowMap]);
  const light = useRef({ x: 0, y: 0 });

  useFrame((state, dt) => {
    const delta = Math.min(dt, 1 / 15);
    const { pointer } = bus.current;
    // The gold light trails the cursor with a little inertia.
    light.current.x = MathUtils.damp(light.current.x, (pointer.x * viewport.width) / 2, 3, delta);
    light.current.y = MathUtils.damp(light.current.y, (-pointer.y * viewport.height) / 2, 3, delta);
    const u = material.current!.uniforms;
    u.uTime.value += delta;
    u.uLight.value = [light.current.x, light.current.y];
    u.uPixelRatio.value = state.viewport.dpr;
    glow.current!.position.set(light.current.x, light.current.y, -1);
    const cam = state.camera;
    cam.position.x = MathUtils.damp(cam.position.x, pointer.x * 0.5, 2, delta);
    cam.position.y = MathUtils.damp(cam.position.y, -pointer.y * 0.3, 2, delta);
    cam.lookAt(0, 0, 0);
  });

  return (
    <>
      <mesh ref={glow}>
        <planeGeometry args={[9, 9]} />
        <meshBasicMaterial map={glowMap} transparent depthWrite={false} blending={AdditiveBlending} />
      </mesh>
      <points geometry={geometry}>
        <shaderMaterial ref={material} uniforms={uniforms} vertexShader={VERTEX} fragmentShader={FRAGMENT} transparent depthWrite={false} blending={AdditiveBlending} />
      </points>
    </>
  );
}
