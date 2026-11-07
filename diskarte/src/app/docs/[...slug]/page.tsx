import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, ChevronRight, PencilLine } from "lucide-react";
import { DocsEnhancer } from "@/components/docs/DocsEnhancer";
import { DocsFeedback } from "@/components/docs/DocsFeedback";
import { DocsSidebar } from "@/components/docs/DocsSidebar";
import { formatDocDate, getDoc, neighbours, REPO_URL, sectionOf } from "@/lib/docs/site";

async function load(params: PageProps<"/docs/[...slug]">["params"]) {
  const page = getDoc((await params).slug.join("/"));
  if (!page) notFound();
  return page;
}

export async function generateMetadata({ params }: PageProps<"/docs/[...slug]">): Promise<Metadata> {
  const page = await load(params);
  return { title: page.title, description: page.description || undefined, alternates: { canonical: `/docs/${page.slug}` } };
}

export default async function DocPage({ params }: PageProps<"/docs/[...slug]">) {
  const page = await load(params);
  const section = sectionOf(page);
  const { previous, next } = neighbours(page.slug);
  return (
    <div className="docs-layout">
      <DocsSidebar active={page.slug} />
      <main id="docs-main" className="docs-main">
        <nav aria-label="Breadcrumb" className="docs-breadcrumbs">
          <ol>
            <li><Link href="/docs">Help Center</Link></li>
            <li aria-hidden><ChevronRight className="size-3.5" /></li>
            <li><Link href={`/docs/${section.pages[0]}`}>{section.title}</Link></li>
            <li aria-hidden><ChevronRight className="size-3.5" /></li>
            <li aria-current="page">{page.title}</li>
          </ol>
        </nav>
        <header className="docs-page-header">
          <p className="docs-eyebrow">{section.title} · for {section.audience.toLowerCase()}</p>
          <h1>{page.title}</h1>
          <p className="docs-meta">
            Last reviewed {formatDocDate(page.reviewed)} ·{" "}
            <a href={`${REPO_URL}/blob/main/${page.source}`} target="_blank" rel="noopener noreferrer">
              <PencilLine className="inline size-3.5" aria-hidden /> Edit on GitHub
            </a>
          </p>
        </header>
        {/* Rendered at build time from the repository's own Markdown (no user content). */}
        <article data-docs-article className="docs-prose" dangerouslySetInnerHTML={{ __html: page.html }} />
        <DocsEnhancer slug={page.slug} />
        <DocsFeedback slug={page.slug} title={page.title} issueUrl={`${REPO_URL}/issues/new`} />
        <nav aria-label="Previous and next pages" className="docs-pager">
          {previous ? <Link href={`/docs/${previous.slug}`} rel="prev"><span><ArrowLeft className="size-3.5" aria-hidden /> Previous</span>{previous.title}</Link> : <span />}
          {next ? <Link href={`/docs/${next.slug}`} rel="next" className="text-right"><span>Next <ArrowRight className="size-3.5" aria-hidden /></span>{next.title}</Link> : <span />}
        </nav>
      </main>
      {page.headings.length > 1 && (
        <aside className="docs-toc" aria-labelledby="docs-toc-title">
          <p id="docs-toc-title" className="docs-nav-title">On this page</p>
          <ul data-docs-toc>
            {page.headings.map((h) => (
              <li key={h.id} data-depth={h.depth}><a href={`#${h.id}`}>{h.text}</a></li>
            ))}
          </ul>
        </aside>
      )}
    </div>
  );
}
