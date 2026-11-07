"use client";

import { useEffect } from "react";

/**
 * Progressive enhancement for a pre-rendered docs article: copy buttons, Mermaid diagrams (the
 * library loads only on pages that have one) and the table of contents' current section.
 * Without JavaScript the page is fully readable; diagrams show their source.
 */
export function DocsEnhancer({ slug }: { slug: string }) {
  useEffect(() => {
    const article = document.querySelector<HTMLElement>("[data-docs-article]");
    if (!article) return;
    let live = true;

    const onClick = async (e: MouseEvent) => {
      const button = (e.target as HTMLElement).closest<HTMLButtonElement>("button[data-copy]");
      const code = button?.closest(".docs-code")?.querySelector("pre")?.textContent;
      if (!button || code == null) return;
      try {
        await navigator.clipboard.writeText(code.replace(/\n$/, ""));
        button.textContent = "Copied";
      } catch {
        button.textContent = "Press Ctrl+C";
      }
      setTimeout(() => { button.textContent = "Copy"; }, 1600);
    };
    article.addEventListener("click", onClick);

    const diagrams = [...article.querySelectorAll<HTMLElement>("figure[data-mermaid]")];
    for (const figure of diagrams) figure.dataset.source ??= figure.querySelector("pre")?.textContent ?? "";
    const draw = async () => {
      const { default: mermaid } = await import("mermaid");
      const light = document.documentElement.dataset.colorMode === "light";
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: "strict",
        theme: "base",
        fontFamily: "Inter, system-ui, sans-serif",
        // Natural size (the figure scrolls) so large diagrams stay legible instead of shrinking.
        flowchart: { useMaxWidth: false }, sequence: { useMaxWidth: false }, state: { useMaxWidth: false }, er: { useMaxWidth: false },
        themeVariables: light
          ? { primaryColor: "#fff8ec", primaryTextColor: "#142138", primaryBorderColor: "#b45309", lineColor: "#526174", secondaryColor: "#eef2f7", tertiaryColor: "#ffffff", noteBkgColor: "#fff8ec", actorBkg: "#fff8ec", actorBorder: "#b45309" }
          : { darkMode: true, background: "#0f172a", primaryColor: "#111827", primaryTextColor: "#e2e8f0", primaryBorderColor: "#ffb800", lineColor: "#94a3b8", secondaryColor: "#1e293b", tertiaryColor: "#0f172a", noteBkgColor: "#1e293b", noteTextColor: "#e2e8f0", actorBkg: "#111827", actorBorder: "#ffb800", actorTextColor: "#e2e8f0", signalColor: "#cbd5e1", signalTextColor: "#e2e8f0", labelTextColor: "#e2e8f0" },
      });
      for (const [i, figure] of diagrams.entries()) {
        const source = figure.dataset.source ?? "";
        try {
          const { svg } = await mermaid.render(`docs-diagram-${slug.replace(/\W/g, "-")}-${i}`, source);
          if (!live) return;
          figure.innerHTML = svg;
          figure.setAttribute("role", "img");
          figure.setAttribute("aria-label", `Diagram: ${source.split("\n")[0].trim()}`);
          figure.dataset.rendered = "";
        } catch {
          figure.dataset.failed = "";
        }
      }
    };
    // Re-draw in the new palette when the reader switches colour mode.
    const modeWatch = new MutationObserver(() => { if (diagrams.length) void draw(); });
    if (diagrams.length) {
      void draw();
      modeWatch.observe(document.documentElement, { attributes: true, attributeFilter: ["data-color-mode"] });
    }

    const links = new Map([...document.querySelectorAll<HTMLAnchorElement>("[data-docs-toc] a")].map((a) => [a.hash.slice(1), a]));
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (!visible) return;
        links.forEach((a) => a.removeAttribute("aria-current"));
        links.get(visible.target.id)?.setAttribute("aria-current", "location");
      },
      { rootMargin: "-72px 0px -70% 0px" },
    );
    links.forEach((_, id) => { const h = document.getElementById(id); if (h) observer.observe(h); });

    return () => {
      live = false;
      article.removeEventListener("click", onClick);
      observer.disconnect();
      modeWatch.disconnect();
    };
  }, [slug]);
  return null;
}
