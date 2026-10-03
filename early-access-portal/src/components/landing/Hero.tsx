"use client";

import { Gamepad2, ShieldCheck, Volume2 } from "lucide-react";
import { motion, type Variants } from "framer-motion";
import { Mascot } from "@/components/Brand";
import { EASE_OUT } from "@/components/motion/MotionRoot";

const container: Variants = { hidden: {}, show: { transition: { staggerChildren: 0.09, delayChildren: 0.05 } } };
const item: Variants = { hidden: { opacity: 0, y: 18 }, show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: EASE_OUT } } };

const CHIPS = [
  { label: "LFG Board", icon: Gamepad2, className: "left-0 top-6", delay: 0 },
  { label: "Voice + screen share", icon: Volume2, className: "right-0 top-24", delay: 1.2 },
  { label: "Bantay-Bayan", icon: ShieldCheck, className: "left-6 bottom-2", delay: 2.1 },
];

/** Staggered headline entrance plus the salakot mascot with floating glass chips. */
export function Hero() {
  return (
    <motion.div variants={container} initial="hidden" animate="show" className="flex flex-col justify-center">
      <motion.p
        variants={item}
        className="inline-flex w-fit items-center gap-2 rounded-full border border-sun/40 bg-sun/10 px-3 py-1 font-pixel text-[9px] leading-relaxed text-sun"
      >
        <span className="size-1.5 animate-blink rounded-full bg-sun" aria-hidden /> EARLY ACCESS · BATCH 01
      </motion.p>
      <motion.h1 variants={item} id="hero-title" className="mt-5 text-[clamp(2.25rem,4.2vw+1rem,4.25rem)] font-extrabold leading-[1.05] tracking-tight text-white">
        Mauna sa bagong <span className="bg-gradient-to-r from-sun via-amber-300 to-sun bg-clip-text text-transparent">istambayan</span> ng bayan.
      </motion.h1>
      <motion.p variants={item} className="mt-4 max-w-xl text-[clamp(1rem,0.4vw+0.9rem,1.25rem)] text-slate-300">
        Ang Diskarte ay open-source na Discord alternative para sa Pinoy gamers, estudyante at creators. Limitado ang slots sa unang batch. Mag-apply na at kami na ang bahala sa login mo.
      </motion.p>
      <motion.ul variants={item} className="mt-6 flex flex-wrap gap-2 text-sm text-slate-200" aria-label="Highlights">
        {["Libre", "Open-source", "Gawa para sa PH", "Walang shutdown-shutdown"].map((t) => (
          <li key={t} className="glass rounded-full px-3 py-1.5">
            {t}
          </li>
        ))}
      </motion.ul>

      <motion.div variants={item} className="relative mx-auto mt-10 hidden h-64 w-full max-w-md lg:block" aria-hidden>
        <motion.div
          className="absolute inset-0 m-auto size-44"
          animate={{ y: [0, -12, 0], rotate: [0, -2, 0] }}
          transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
        >
          <Mascot size={176} className="drop-shadow-[0_18px_40px_rgba(255,184,0,0.35)]" />
        </motion.div>
        {CHIPS.map((chip) => (
          <motion.span
            key={chip.label}
            className={`glass absolute rounded-2xl px-3 py-2 text-sm font-semibold text-white shadow-lg shadow-black/30 ${chip.className}`}
            animate={{ y: [0, -8, 0] }}
            transition={{ duration: 5, repeat: Infinity, ease: "easeInOut", delay: chip.delay }}
          >
            <chip.icon className="mr-1.5 inline size-4 text-sun" aria-hidden />
            {chip.label}
          </motion.span>
        ))}
      </motion.div>
    </motion.div>
  );
}
