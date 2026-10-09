"use client";

import { animate, motion, useMotionValue, useReducedMotion, useTransform } from "framer-motion";
import { useEffect } from "react";
import { cn } from "@/lib/utils";

/** Animated metric: counts from its previous value to the new one (instant with reduced motion). */
export function CountUp({ value, className }: { value: number; className?: string }) {
  const reduce = useReducedMotion();
  const count = useMotionValue(reduce ? value : 0);
  const rounded = useTransform(count, (v) => Math.round(v).toLocaleString("en-PH"));

  useEffect(() => {
    if (reduce) {
      count.set(value);
      return;
    }
    const controls = animate(count, value, { duration: 0.9, ease: [0.23, 1, 0.32, 1] });
    return () => controls.stop();
  }, [value, reduce, count]);

  return (
    <span className={cn("tabular-nums", className)}>
      <span className="sr-only">{value}</span>
      <motion.span aria-hidden>{rounded}</motion.span>
    </span>
  );
}
