// @vitest-environment node
import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BlockedUrlError, isPublicAddress, safeFetch, vetUrl } from "@/lib/ssrf";
import { extractLinks, parseMeta } from "@/lib/unfurl";

describe("SSRF guard", () => {
  it("only treats public unicast addresses as fetchable", () => {
    for (const ip of ["8.8.8.8", "1.1.1.1", "2606:4700:4700::1111"]) expect(isPublicAddress(ip)).toBe(true);
    for (const ip of ["127.0.0.1", "10.1.2.3", "172.20.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "224.0.0.1", "::1", "fe80::1", "fd00::1", "::ffff:127.0.0.1", "::ffff:10.0.0.1", "64:ff9b::a00:1", "not-an-ip"]) {
      expect(isPublicAddress(ip), ip).toBe(false);
    }
  });

  it("vets URLs: http(s), default ports, no credentials, no internal hosts", () => {
    expect(vetUrl("https://example.com/a?b=c")?.hostname).toBe("example.com");
    for (const bad of ["ftp://example.com", "file:///etc/passwd", "javascript:alert(1)", "https://user:pw@example.com", "https://example.com:8443/", "http://127.0.0.1/", "http://[::1]/", "http://169.254.169.254/latest/meta-data", "http://localhost/", "http://foo.internal/", "http://intranet/"]) {
      expect(vetUrl(bad), bad).toBeNull();
    }
  });

  describe("against a real local server", () => {
    let server: http.Server;
    let port: number;
    beforeAll(async () => {
      server = http.createServer((_req, res) => res.end("<title>internal</title>"));
      await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
      port = (server.address() as AddressInfo).port;
    });
    afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

    it("refuses loopback targets, by IP or by a name that resolves there", async () => {
      await expect(safeFetch(`http://127.0.0.1:${port}/`, { accept: "*/*", maxBytes: 1000 })).rejects.toBeInstanceOf(BlockedUrlError);
      // localtest.me-style names: a public-looking host that resolves to 127.0.0.1 is caught at connect time.
      await expect(safeFetch("http://localhost./", { accept: "*/*", maxBytes: 1000 })).rejects.toBeInstanceOf(BlockedUrlError);
    });
  });
});

describe("link previews", () => {
  it("picks up to three links outside code, skipping <suppressed> ones", () => {
    const text = "see https://a.com/x, and <https://b.com> plus `https://c.com` and https://a.com/x again\n```\nhttps://d.com\n```\nhttps://e.com/(1) https://f.com https://g.com";
    expect(extractLinks(text)).toEqual(["https://a.com/x", "https://e.com/(1)", "https://f.com"]);
    expect(extractLinks("(see https://en.wikipedia.org/wiki/Adobo_(dish))")).toEqual(["https://en.wikipedia.org/wiki/Adobo_(dish)"]);
  });

  it("reads Open Graph, Twitter and <title> tags, decoding entities and resolving the image", () => {
    const html = `<html><head><title>Fallback &amp; title</title>
      <meta content="Barkada Night" property="og:title">
      <meta name='description' content='Tara &quot;laro&quot; tayo'>
      <meta property="og:image" content="/img/cover.png">
      <meta name="theme-color" content="#f5b400">
      <meta property="og:site_name" content="Diskarte">
      </head><body>…</body></html>`;
    expect(parseMeta(html, "https://example.com/events/1")).toEqual({
      siteName: "Diskarte",
      title: "Barkada Night",
      description: 'Tara "laro" tayo',
      image: "https://example.com/img/cover.png",
      color: "#f5b400",
    });
    expect(parseMeta("<title> Just a title </title><meta property=og:image content=javascript:alert(1)>", "https://www.site.ph/")).toEqual({
      siteName: "site.ph",
      title: "Just a title",
      description: null,
      image: null,
      color: null,
    });
  });
});
