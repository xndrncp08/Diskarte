"use client";

import { motion, type HTMLMotionProps } from "framer-motion";
import { forwardRef } from "react";
import { cn } from "@/lib/utils";
import { SPRING } from "@/components/motion/MotionRoot";
import { PixelSpinner } from "./PixelSpinner";

type Variant = "primary" | "ghost" | "success" | "danger" | "outline";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-sun text-abyss shadow-[0_4px_0_0_#b45309] hover:brightness-110",
  success: "bg-emerald-700 text-white shadow-[0_3px_0_0_#064e3b] hover:bg-emerald-800",
  danger: "bg-red-700 text-white shadow-[0_3px_0_0_#7f1d1d] hover:bg-red-800",
  outline: "border border-white/15 bg-white/5 text-slate-200 hover:bg-white/10",
  ghost: "text-slate-300 hover:bg-white/10",
};

/**
 * Tactile button: springs down on press (and its 8-bit drop shadow collapses), lifts slightly on
 * hover, and swaps its label for a pixel loader while busy. Transform/opacity only (GPU-friendly);
 * reduced-motion users get the colour changes without the movement.
 */
export const PressButton = forwardRef<HTMLButtonElement, HTMLMotionProps<"button"> & { variant?: Variant; loading?: boolean; loadingLabel?: string }>(
  function PressButton({ variant = "primary", loading = false, loadingLabel = "Sandali…", className, children, disabled, ...props }, ref) {
    return (
      <motion.button
        ref={ref}
        whileHover={disabled || loading ? undefined : { y: -1, scale: 1.015 }}
        whileTap={disabled || loading ? undefined : { y: 3, scale: 0.97, boxShadow: "0 0 0 0 rgba(0,0,0,0)" }}
        transition={SPRING}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        className={cn(
          "relative inline-flex min-h-11 select-none items-center justify-center gap-2 rounded-xl px-4 font-bold transition-[background-color,filter,opacity] disabled:cursor-not-allowed disabled:opacity-60",
          VARIANTS[variant],
          className,
        )}
        {...props}
      >
        {loading ? (
          <>
            <PixelSpinner />
            <span>{loadingLabel}</span>
          </>
        ) : (
          children
        )}
      </motion.button>
    );
  },
);
