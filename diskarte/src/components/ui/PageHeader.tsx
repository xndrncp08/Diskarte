"use client";

import { Menu } from "lucide-react";
import type { ReactNode } from "react";
import { useShellUI } from "@/components/shell/ShellUI";

export function PageHeader({
  title,
  description,
  icon,
  actions,
}: {
  title: string;
  description?: string;
  icon?: ReactNode;
  actions?: ReactNode;
}) {
  const { setNavOpen } = useShellUI();
  return (
    <header className="page-header">
      <button
        type="button"
        onClick={() => setNavOpen(true)}
        aria-label="Open navigation"
        className="flex size-11 shrink-0 items-center justify-center rounded-xl text-slate-300 hover:bg-white/10 md:hidden"
      >
        <Menu className="size-5" aria-hidden />
      </button>
      {icon && (
        <span className="page-header-icon" aria-hidden>
          {icon}
        </span>
      )}
      <div className="min-w-0">
        <h1 className="truncate text-white">{title}</h1>
        {description && (
          <p className="page-header-description truncate">{description}</p>
        )}
      </div>
      {actions && (
        <div className="ml-auto flex items-center gap-2">{actions}</div>
      )}
    </header>
  );
}
