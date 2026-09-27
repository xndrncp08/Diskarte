"use client";

import { motion, useIsPresent, type HTMLMotionProps } from "framer-motion";
import { forwardRef } from "react";

/**
 * motion.div for overlays inside <AnimatePresence>: the moment it starts exiting it stops taking
 * pointer events and leaves the accessibility tree, so a fading menu/picker can never swallow the
 * next click or be announced by screen readers.
 */
export const InertWhenExiting = forwardRef<HTMLDivElement, HTMLMotionProps<"div">>(function InertWhenExiting({ style, ...props }, ref) {
  const present = useIsPresent();
  return <motion.div ref={ref} {...props} aria-hidden={present ? props["aria-hidden"] : true} style={{ ...style, pointerEvents: present ? style?.pointerEvents : "none" }} />;
});
