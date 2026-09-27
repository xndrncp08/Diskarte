"use client";

import { MotionConfig } from "framer-motion";
import type { ReactNode } from "react";

/** Every framer-motion animation honours the OS "reduce motion" setting (transforms are skipped). */
export function MotionRoot({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}

/** Shared easing/springs so the whole portal moves with one personality. */
export const EASE_OUT = [0.23, 1, 0.32, 1] as const;
export const SPRING = { type: "spring", stiffness: 420, damping: 30, mass: 0.8 } as const;
export const SOFT_SPRING = { type: "spring", stiffness: 180, damping: 22 } as const;
