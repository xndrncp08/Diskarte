"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/settings/profile", label: "My Profile" },
  { href: "/settings/account", label: "Account & Sessions" },
] as const;

export function SettingsNav({ horizontal = false }: { horizontal?: boolean }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Settings" className={cn(horizontal ? "flex gap-2" : "space-y-1")}>
      {ITEMS.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={pathname === item.href ? "page" : undefined}
          className={cn(
            "block rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
            pathname === item.href ? "bg-white/10 text-white" : "text-slate-400 hover:bg-white/5 hover:text-slate-200",
          )}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
