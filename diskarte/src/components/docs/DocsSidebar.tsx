import Link from "next/link";
import { docSections, getDoc } from "@/lib/docs/site";
import { cn } from "@/lib/utils";

/** Section-by-section navigation. Desktop: sticky column. Phones: a disclosure above the article (no JS). */
export function DocsSidebar({ active }: { active: string }) {
  const list = (
    <nav aria-label="Help Center sections" className="docs-nav">
      {docSections.map((section) => (
        <div key={section.id} className="docs-nav-group">
          <p className="docs-nav-title">{section.title}</p>
          <ul>
            {section.pages.map((slug) => (
              <li key={slug}>
                <Link href={`/docs/${slug}`} aria-current={slug === active ? "page" : undefined} className={cn(slug === active && "docs-nav-active")}>
                  {getDoc(slug)?.title}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
  return (
    <>
      <aside className="docs-sidebar">{list}</aside>
      <details className="docs-mobile-nav">
        <summary>Browse the Help Center</summary>
        {list}
      </details>
    </>
  );
}
