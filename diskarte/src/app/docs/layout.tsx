import Link from "next/link";
import type { Metadata } from "next";
import { ArrowUpRight } from "lucide-react";
import { DiskarteLogo } from "@/components/brand/DiskarteLogo";
import { DocsSearch } from "@/components/docs/DocsSearch";
import { ThemeToggle } from "@/components/docs/ThemeToggle";
import { docSections } from "@/lib/docs/site";
import "./docs.css";

export const metadata: Metadata = {
  title: { default: "Help Center", template: "%s · Diskarte Help Center" },
  description: "Guides, help and developer documentation for Diskarte.",
};

const NAV = [
  { href: "/docs/guides", label: "Guides" },
  { href: "/docs/help/faq", label: "Help" },
  { href: "/docs/developers/local-setup", label: "Developers" },
  { href: "/docs/api", label: "API" },
  { href: "/docs/changelog", label: "Changelog" },
];

/** Public Help Center shell: no sign-in needed, its own header, the app's themes and tokens. */
export default function DocsLayout({ children }: LayoutProps<"/docs">) {
  return (
    <div className="docs-root">
      <a href="#docs-main" className="docs-skip">Skip to content</a>
      <header className="docs-header">
        <div className="docs-header-inner">
          <Link href="/docs" className="flex shrink-0 items-center gap-2.5" aria-label="Diskarte Help Center home">
            <DiskarteLogo size={30} title="" aria-hidden />
            <span className="font-extrabold tracking-tight text-[var(--text-primary)]">Diskarte</span>
            <span className="docs-badge">Help Center</span>
          </Link>
          <nav aria-label="Documentation" className="docs-top-nav">
            {NAV.map((item) => <Link key={item.href} href={item.href}>{item.label}</Link>)}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <DocsSearch categories={docSections.map((s) => s.title)} />
            <ThemeToggle />
            <Link href="/tambayan" className="docs-open-app">Open Diskarte <ArrowUpRight className="size-3.5" aria-hidden /></Link>
          </div>
        </div>
      </header>
      {children}
      <footer className="docs-footer">
        <p>Diskarte Help Center · documentation for the <code>main</code> branch.</p>
        <nav aria-label="Footer">
          <Link href="/">Diskarte home</Link>
          <Link href="/docs/help/report-a-problem">Report a problem</Link>
          <Link href="/docs/help/privacy">Privacy</Link>
          <a href="https://github.com/xndrncp08/Diskarte" target="_blank" rel="noopener noreferrer">GitHub</a>
          <a href="https://github.com/xndrncp08/Diskarte/blob/main/SECURITY.md" target="_blank" rel="noopener noreferrer">Security</a>
        </nav>
      </footer>
    </div>
  );
}
