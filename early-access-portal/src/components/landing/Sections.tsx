"use client";

import { AnimatePresence, motion, type Variants } from "framer-motion";
import { ChevronDown, Gamepad2, MessagesSquare, Mic, RadioTower, ShieldCheck, Signal } from "lucide-react";
import { useState } from "react";
import { EASE_OUT } from "@/components/motion/MotionRoot";
import { cn } from "@/lib/utils";

const reveal: Variants = { hidden: { opacity: 0, y: 28 }, show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: EASE_OUT } } };
const stagger: Variants = { hidden: {}, show: { transition: { staggerChildren: 0.08 } } };
const inView = { initial: "hidden", whileInView: "show", viewport: { once: true, amount: 0.25 } } as const;

const STEPS = [
  { title: "Mag-apply", body: "Kwentuhan mo kami tungkol sa'yo at sa komunidad mo. 2 minuto lang." },
  { title: "I-review ng team", body: "Isa-isa naming binabasa ang applications — gaming squads, orgs at creators muna." },
  { title: "Login details sa email", body: "Kapag approved, darating ang “Maligayang Pagdating sa Diskarte!” kasama ang temporary password." },
  { title: "Tambay na!", body: "Gumawa ng sariling password, pumili ng salakot avatar, at buuin ang Tambayan ninyo." },
];

const FEATURES = [
  { icon: Mic, title: "Voice, video at screen share", body: "LiveKit-powered calls na hindi nagla-lag kahit naka-data." },
  { icon: RadioTower, title: "LFG Board", body: "1-click Join Party diretso sa voice channel ng squad." },
  { icon: ShieldCheck, title: "Bantay-Bayan", body: "Auto-mod laban sa scam links, spam at toxic, may audit log pa." },
  { icon: Signal, title: "Low-data mode", body: "Para sa prepaid data at mahinang signal sa probinsya." },
  { icon: Gamepad2, title: "Voice activities", body: "Watch party, 8-bit Tic-Tac-Toe at Pinoy Trivia habang nasa call." },
  { icon: MessagesSquare, title: "Friends & DMs", body: "Mag-add gamit ang @username, group DMs hanggang 10." },
];

const FAQ = [
  { q: "Libre ba?", a: "Oo. Open-source ang Diskarte at walang bayad ang pag-apply o paggamit." },
  { q: "Gaano katagal bago ma-approve?", a: "Depende sa dami ng applicants, pero sinusubukan naming sumagot sa loob ng ilang araw. Makakatanggap ka ng email kapag approved ka na." },
  { q: "Ano ang mangyayari sa info ko?", a: "Ginagamit lang ito para i-review ang application mo at i-email ka. Hindi namin ito ibinebenta o ibinabahagi." },
  { q: "May account na ako — kailangan ko pa bang mag-apply?", a: "Hindi na. Mag-login ka na lang sa Diskarte gamit ang “Mag-login” sa itaas." },
];

export function HowItWorks() {
  return (
    <motion.section {...inView} variants={stagger} className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 2xl:max-w-7xl" aria-labelledby="how-title">
      <motion.p variants={reveal} className="font-pixel text-[10px] text-sun">PAANO ITO GUMAGANA</motion.p>
      <motion.h2 variants={reveal} id="how-title" className="mt-3 text-3xl font-extrabold text-white sm:text-4xl">
        Apat na hakbang papunta sa tambayan
      </motion.h2>
      <ol className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {STEPS.map((s, i) => (
          <motion.li key={s.title} variants={reveal} className="glass relative rounded-2xl p-5">
            <span className="flex size-9 items-center justify-center rounded-lg bg-sun font-pixel text-[11px] text-abyss shadow-[0_3px_0_0_#b45309]">{i + 1}</span>
            <h3 className="mt-4 font-bold text-white">{s.title}</h3>
            <p className="mt-1 text-sm text-slate-400">{s.body}</p>
          </motion.li>
        ))}
      </ol>
    </motion.section>
  );
}

export function Features() {
  return (
    <motion.section {...inView} variants={stagger} className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 2xl:max-w-7xl" aria-labelledby="features-title">
      <motion.p variants={reveal} className="font-pixel text-[10px] text-sun">ANO ANG MERON</motion.p>
      <motion.h2 variants={reveal} id="features-title" className="mt-3 text-3xl font-extrabold text-white sm:text-4xl">
        Lahat ng kailangan ng barkada — at ng buong komunidad
      </motion.h2>
      <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((f) => (
          <motion.li
            key={f.title}
            variants={reveal}
            whileHover={{ y: -4, scale: 1.015 }}
            transition={{ type: "spring", stiffness: 300, damping: 22 }}
            className="glass flex gap-4 rounded-2xl p-5"
          >
            <span className="flex size-12 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5" aria-hidden>
              <f.icon className="size-6 text-sun" strokeWidth={2.25} />
            </span>
            <span>
              <span className="block font-bold text-white">{f.title}</span>
              <span className="mt-1 block text-sm text-slate-400">{f.body}</span>
            </span>
          </motion.li>
        ))}
      </ul>
    </motion.section>
  );
}

export function Faq() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <motion.section {...inView} variants={stagger} className="mx-auto w-full max-w-3xl px-4 py-16 sm:px-6" aria-labelledby="faq-title">
      <motion.h2 variants={reveal} id="faq-title" className="text-3xl font-extrabold text-white sm:text-4xl">
        Mga tanong
      </motion.h2>
      <div className="mt-6 space-y-2">
        {FAQ.map((item, i) => {
          const isOpen = open === i;
          return (
            <motion.div key={item.q} variants={reveal} className="glass overflow-hidden rounded-2xl">
              <button
                type="button"
                aria-expanded={isOpen}
                aria-controls={`faq-${i}`}
                onClick={() => setOpen(isOpen ? null : i)}
                className="flex min-h-14 w-full items-center justify-between gap-4 px-5 text-left font-semibold text-white"
              >
                {item.q}
                <motion.span animate={{ rotate: isOpen ? 180 : 0 }} transition={{ duration: 0.25, ease: EASE_OUT }}>
                  <ChevronDown className="size-5 text-slate-400" aria-hidden />
                </motion.span>
              </button>
              <AnimatePresence initial={false}>
                {isOpen && (
                  <motion.div
                    id={`faq-${i}`}
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.28, ease: EASE_OUT }}
                  >
                    <p className={cn("px-5 pb-5 text-sm text-slate-300")}>{item.a}</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          );
        })}
      </div>
    </motion.section>
  );
}

export function FinalCta() {
  return (
    <motion.section {...inView} variants={reveal} className="mx-auto w-full max-w-6xl px-4 pb-20 pt-6 sm:px-6 2xl:max-w-7xl">
      <div className="glass-strong relative overflow-hidden rounded-3xl p-8 text-center sm:p-12">
        <div className="scanlines pointer-events-none absolute inset-0" aria-hidden />
        <p className="font-pixel text-[10px] text-sun">▲ PRESS START ▲</p>
        <h2 className="mt-4 text-3xl font-extrabold text-white sm:text-4xl">Sali na sa unang batch</h2>
        <p className="mx-auto mt-2 max-w-lg text-slate-300">Limitado ang slots. Ang mauuna, siya ang unang tatambay.</p>
        <a href="#apply" className="mt-6 inline-flex min-h-12 items-center rounded-xl bg-sun px-6 font-extrabold text-abyss shadow-[0_4px_0_0_#b45309] transition-[filter,transform] hover:brightness-110 active:translate-y-1 active:shadow-none">
          Mag-apply ngayon ▶
        </a>
      </div>
    </motion.section>
  );
}
