"use client";

import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { AdditiveBlending, BufferGeometry, Float32BufferAttribute, MathUtils, type ShaderMaterial } from "three";
import { usePointerTracking, type StageBusRef } from "./stage-bus";

export interface ParticleMeshSceneProps {
  bus: StageBusRef;
  active: boolean;
  onReady: () => void;
  onContextLost: () => void;
}

/**
 * Stage 1 backdrop: a midnight plane of solar particles rolling in slow waves toward the horizon,
 * gold up close fading to neon cyan in the distance. All motion runs in the vertex shader.
 */
export default function ParticleMeshScene({ bus, active, onReady, onContextLost }: ParticleMeshSceneProps) {
  const lost = useRef(onContextLost);
  useEffect(() => {
    lost.current = onContextLost;
  }, [onContextLost]);
  usePointerTracking(bus);

  return (
    <Canvas
      aria-hidden
      dpr={[1, 1.5]}
      frameloop={active ? "always" : "never"}
      camera={{ position: [0, 1.6, 10], fov: 55, near: 0.1, far: 80 }}
      gl={{ alpha: true, antialias: false, powerPreference: "high-performance" }}
      style={{ pointerEvents: "none" }}
      onCreated={({ gl }) => {
        gl.domElement.addEventListener("webglcontextlost", () => lost.current(), { once: true });
      }}
    >
      <ParticlePlane bus={bus} onReady={onReady} />
    </Canvas>
  );
}

const VERTEX = /* glsl */ `
  uniform float uTime;
  uniform float uRise;
  uniform float uPixelRatio;
  attribute float aSeed;
  varying float vDepth;
  varying float vSeed;
  void main() {
    vec3 p = position;
    float wave = sin(p.x * 0.32 + uTime * 0.55) * 0.55
               + cos(p.z * 0.38 + uTime * 0.42) * 0.45
               + sin((p.x + p.z) * 0.18 + uTime * 0.3) * 0.35;
    p.y += wave * uRise - (1.0 - uRise) * 2.5;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    vDepth = -mv.z;
    vSeed = aSeed;
    gl_PointSize = (1.6 + aSeed * 2.2) * uPixelRatio * (14.0 / vDepth);
  }
`;

const FRAGMENT = /* glsl */ `
  uniform float uRise;
  uniform float uTime;
  varying float vDepth;
  varying float vSeed;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    if (d > 0.5) discard;
    float core = smoothstep(0.5, 0.0, d);
    vec3 gold = vec3(1.0, 0.72, 0.0);
    vec3 amber = vec3(0.96, 0.62, 0.04);
    vec3 cyan = vec3(0.02, 0.71, 0.83);
    vec3 color = mix(mix(gold, amber, vSeed), cyan, smoothstep(14.0, 40.0, vDepth));
    float fade = smoothstep(55.0, 18.0, vDepth) * smoothstep(2.0, 7.0, vDepth);
    float twinkle = 0.75 + 0.25 * sin(uTime * (0.8 + vSeed * 1.6) + vSeed * 40.0);
    gl_FragColor = vec4(color, core * fade * twinkle * uRise * 0.8);
  }
`;

function ParticlePlane({ bus, onReady }: { bus: StageBusRef; onReady: () => void }) {
  const width = useThree((s) => s.size.width);
  const dpr = useThree((s) => s.viewport.dpr);
  const [cols, rows] = width < 640 ? [90, 54] : [170, 80];
  const material = useRef<ShaderMaterial>(null);
  const ready = useRef(false);
  const geometry = useMemo(() => buildPlane(cols, rows), [cols, rows]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const uniforms = useMemo(() => ({ uTime: { value: 0 }, uRise: { value: 0 }, uPixelRatio: { value: 1 } }), []);

  useFrame((state, dt) => {
    if (!ready.current) {
      ready.current = true;
      onReady();
    }
    const delta = Math.min(dt, 1 / 20);
    const u = material.current!.uniforms;
    u.uTime.value += delta;
    u.uRise.value = MathUtils.clamp(bus.current.field, 0, 1) * (1 - bus.current.scroll * 0.6);
    u.uPixelRatio.value = dpr;
    // Gentle parallax: the camera drifts against the pointer and sinks as the hero scrolls away.
    const cam = state.camera;
    cam.position.x = MathUtils.damp(cam.position.x, bus.current.pointer.x * 1.2, 2, delta);
    cam.position.y = MathUtils.damp(cam.position.y, 1.6 - bus.current.pointer.y * 0.5 - bus.current.scroll * 1.2, 2, delta);
    cam.lookAt(0, -1.2, -12);
  });

  return (
    <points geometry={geometry} position={[0, -2.6, 0]}>
      <shaderMaterial
        ref={material}
        uniforms={uniforms}
        vertexShader={VERTEX}
        fragmentShader={FRAGMENT}
        transparent
        depthWrite={false}
        blending={AdditiveBlending}
      />
    </points>
  );
}

/** Small deterministic PRNG (mulberry32), so the mesh is identical on every render and visit. */
function seeded(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildPlane(cols: number, rows: number) {
  const random = seeded(0x5017a2);
  const positions = new Float32Array(cols * rows * 3);
  const seeds = new Float32Array(cols * rows);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      positions[i * 3] = (c / (cols - 1) - 0.5) * 70 + (random() - 0.5) * 0.25;
      positions[i * 3 + 1] = 0;
      positions[i * 3 + 2] = 6 - (r / (rows - 1)) * 56 + (random() - 0.5) * 0.25;
      seeds[i] = random();
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("aSeed", new Float32BufferAttribute(seeds, 1));
  return geometry;
}
