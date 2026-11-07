"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CornerDownLeft, FileText, Hash, Search } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { searchDocs, type SearchEntry } from "@/lib/docs/search";
import { cn } from "@/lib/utils";

let indexPromise: Promise<SearchEntry[]> | null = null;
/** Fetched once per page load, on first open: the index never ships in the JS bundle. */
function loadIndex() {
  indexPromise ??= fetch("/docs-assets/search-index.json").then((r) => (r.ok ? (r.json() as Promise<SearchEntry[]>) : Promise.reject(new Error("index")))).catch((e) => { indexPromise = null; throw e; });
  return indexPromise;
}

/** The header search button and dialog: Ctrl/⌘ K or "/" opens it; arrows move, Enter opens. */
export function DocsSearch({ categories, className, shortcut = true, label = "Search docs" }: { categories: string[]; className?: string; shortcut?: boolean; label?: string }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [index, setIndex] = useState<SearchEntry[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [active, setActive] = useState(0);
  const list = useRef<HTMLUListElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (!shortcut) return;
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && (e.target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName));
      if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !typing)) {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [shortcut]);

  useEffect(() => {
    if (!open || index) return;
    let live = true;
    loadIndex().then((data) => live && setIndex(data), () => live && setFailed(true));
    return () => { live = false; };
  }, [open, index]);

  const hits = useMemo(() => (index ? searchDocs(index, query, category) : []), [index, query, category]);

  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const next = hits.length ? (active + (e.key === "ArrowDown" ? 1 : -1) + hits.length) % hits.length : 0;
      setActive(next);
      list.current?.children[next]?.scrollIntoView({ block: "nearest" });
    } else if (e.key === "Enter" && hits[active]) {
      e.preventDefault();
      go(hits[active].href);
    }
  };

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={cn("docs-search-trigger", className)} aria-label={label} aria-keyshortcuts={shortcut ? "Control+K Meta+K /" : undefined}>
        <Search className="size-4" aria-hidden />
        <span className="docs-search-label">{label}</span>
        <kbd aria-hidden>Ctrl K</kbd>
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Search the Help Center" hideTitle className="docs-search-dialog max-w-2xl p-0">
        <div className="flex items-center gap-3 border-b border-[var(--stroke)] px-4">
          <Search className="size-5 shrink-0 text-[var(--text-muted)]" aria-hidden />
          <input
            autoFocus
            value={query}
            onChange={(e) => { setQuery(e.target.value); setActive(0); }}
            onKeyDown={onKeyDown}
            placeholder="Search guides, help and developer docs…"
            aria-label="Search the documentation"
            aria-controls="docs-search-results"
            aria-activedescendant={hits[active] ? `docs-hit-${active}` : undefined}
            role="combobox"
            aria-expanded={hits.length > 0}
            aria-autocomplete="list"
            className="min-h-14 w-full bg-transparent text-base text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
          />
        </div>
        <div className="flex flex-wrap gap-1.5 border-b border-[var(--stroke)] px-4 py-2" role="group" aria-label="Filter by section">
          {[null, ...categories].map((c) => (
            <button key={c ?? "all"} type="button" aria-pressed={category === c} onClick={() => { setCategory(c); setActive(0); }} className="docs-chip">
              {c ?? "All"}
            </button>
          ))}
        </div>
        <div className="max-h-[min(60vh,28rem)] overflow-y-auto p-2" aria-live="polite">
          {failed ? (
            <p className="p-4 text-sm text-[var(--text-secondary)]">Search couldn’t load. Check your connection and try again.</p>
          ) : !index ? (
            <p className="p-4 text-sm text-[var(--text-muted)]">Loading search…</p>
          ) : !query.trim() ? (
            <p className="p-4 text-sm text-[var(--text-muted)]">Try “install”, “notifications”, “slow mode” or “webhook”.</p>
          ) : hits.length === 0 ? (
            <p className="p-4 text-sm text-[var(--text-secondary)]">No results for “{query}”. Try fewer or different words.</p>
          ) : (
            <ul ref={list} id="docs-search-results" role="listbox" aria-label="Results">
              {hits.map((hit, i) => (
                <li key={hit.href} id={`docs-hit-${i}`} role="option" aria-selected={i === active}>
                  <a
                    href={hit.href}
                    onClick={(e) => { e.preventDefault(); go(hit.href); }}
                    onMouseMove={() => setActive(i)}
                    className={cn("docs-hit", i === active && "docs-hit-active")}
                  >
                    {hit.entry.a ? <Hash className="mt-0.5 size-4 shrink-0" aria-hidden /> : <FileText className="mt-0.5 size-4 shrink-0" aria-hidden />}
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs text-[var(--text-muted)]">{hit.entry.c} › {hit.entry.p}</span>
                      <span className="block font-semibold text-[var(--text-primary)]">{hit.entry.h}</span>
                      <span className="mt-0.5 line-clamp-2 block text-sm text-[var(--text-secondary)]">
                        {hit.excerpt.before}<mark>{hit.excerpt.match}</mark>{hit.excerpt.after}
                      </span>
                    </span>
                    {i === active && <CornerDownLeft className="mt-0.5 size-4 shrink-0 text-[var(--text-muted)]" aria-hidden />}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Modal>
    </>
  );
}
