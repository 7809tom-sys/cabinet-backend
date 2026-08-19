import { describe, expect, it } from "vitest";
import { injectAffiliateWhiteLabelHead } from "./affiliateWhiteLabelHead";

const platformHead = `<!doctype html><html><head>
  <title>Cabinet Dealz — Professional Cabinet Platform</title>
  <meta name="description" content="Cabinet Dealz platform description" />
  <meta name="theme-color" content="#0f1f3d" />
  <link rel="icon" href="/favicon.svg" />
  <link rel="apple-touch-icon" href="/favicon.svg" />
  <link rel="manifest" href="/manifest.json" />
  <meta property="og:site_name" content="Cabinet Dealz" />
  <meta property="og:title" content="Cabinet Dealz" />
  <meta property="og:description" content="Cabinet Dealz platform description" />
  <meta property="og:image" content="https://cdn.example/cabinet-dealz.png" />
  <meta name="twitter:title" content="Cabinet Dealz" />
  <meta name="twitter:description" content="Cabinet Dealz platform description" />
  <meta name="twitter:image" content="https://cdn.example/cabinet-dealz.png" />
</head><body></body></html>`;

describe("affiliate white-label HTML head", () => {
  it("replaces every platform title, share tag, icon, and manifest before delivery", () => {
    const html = injectAffiliateWhiteLabelHead(platformHead, {
      slug: "reaves-way-cabinet-shop",
      storeName: "Reaves Way Cabinet Shop",
      tagline: "Cabinets designed for your home",
      logoUrl: "https://cdn.example/reaves-way-logo.png",
      primaryColor: "#225577",
      canonicalUrl: "https://reaves-way-cabinet-shop.cabinetdealz.com/store/reaves-way-cabinet-shop",
    });

    expect(html).toContain("window.__AFFILIATE_SLUG__=\"reaves-way-cabinet-shop\"");
    expect(html).toContain("window.location.replace('/store/'+window.__AFFILIATE_SLUG__+s+window.location.search)");
    expect(html).toContain("<title>Reaves Way Cabinet Shop — Cabinets designed for your home</title>");
    expect(html).toContain('property="og:site_name" content="Reaves Way Cabinet Shop"');
    expect(html).toContain('property="og:image" content="https://cdn.example/reaves-way-logo.png"');
    expect(html).toContain('name="twitter:image" content="https://cdn.example/reaves-way-logo.png"');
    expect(html).toContain('name="theme-color" content="#225577"');
    expect(html).toContain('rel="canonical" href="https://reaves-way-cabinet-shop.cabinetdealz.com/store/reaves-way-cabinet-shop"');
    expect(html).toContain('property="og:url" content="https://reaves-way-cabinet-shop.cabinetdealz.com/store/reaves-way-cabinet-shop"');
    expect(html).toContain('name="robots" content="index, follow, max-image-preview:large"');
    expect(html).toContain('data-affiliate-seo="true"');
    expect(html).toContain('rel="icon" href="https://cdn.example/reaves-way-logo.png"');
    expect(html).not.toContain("Cabinet Dealz");
    expect(html).not.toContain("cabinet-dealz.png");
    expect(html).not.toContain('rel="manifest"');
  });

  it("uses a neutral monogram and no platform social image when the affiliate has no logo", () => {
    const html = injectAffiliateWhiteLabelHead(platformHead, {
      slug: "neutral-store",
      storeName: "Neutral Store",
      primaryColor: "#234567",
    });

    expect(html).toContain("Neutral Store");
    expect(html).toContain('rel="icon" href="data:image/svg+xml,');
    expect(html).not.toContain("Cabinet Dealz");
    expect(html).not.toContain('property="og:image"');
    expect(html).not.toContain('name="twitter:image"');
  });

  it("noindexes a private white-label path without adding public organization schema", () => {
    const html = injectAffiliateWhiteLabelHead(platformHead, {
      slug: "neutral-store",
      storeName: "Neutral Store",
      canonicalUrl: "https://neutral-store.cabinetdealz.com/store/neutral-store/cart",
      indexable: false,
    });

    expect(html).toContain('name="robots" content="noindex, nofollow"');
    expect(html).not.toContain('data-affiliate-seo="true"');
  });
});
