import { describe, expect, it } from "vitest";
import { injectMainSeoHead, injectSharedThreeDViewHead } from "./mainSeoHead";

const shell = `<!doctype html><html><head>
  <title>Cabinet Dealz</title>
  <meta name="description" content="Old description" />
  <meta property="og:title" content="Old title" />
  <meta name="twitter:title" content="Old title" />
</head><body><div id="root"></div></body></html>`;

describe("main SEO head", () => {
  it("emits crawler-visible public metadata, canonical URL, and organization schema", () => {
    const html = injectMainSeoHead(shell, {
      canonicalUrl: "https://www.cabinetdealz.com/catalog",
      requestPath: "/catalog",
    });

    expect(html).toContain("<title>Cabinet Catalog | CabinetDealz</title>");
    expect(html).toContain('rel="canonical" href="https://www.cabinetdealz.com/catalog"');
    expect(html).toContain('property="og:url" content="https://www.cabinetdealz.com/catalog"');
    expect(html).toContain('name="robots" content="index, follow, max-image-preview:large"');
    expect(html).toContain('data-main-seo="true"');
  });

  it("keeps private design workspaces out of search and avoids public schema", () => {
    const html = injectMainSeoHead(shell, {
      canonicalUrl: "https://www.cabinetdealz.com/design",
      requestPath: "/design",
    });

    expect(html).toContain('name="robots" content="noindex, nofollow"');
    expect(html).not.toContain('data-main-seo="true"');
  });

  it("emits noindex social metadata and a token-scoped preview image for an already authorized shared 3D view", () => {
    const html = injectSharedThreeDViewHead(shell, {
      canonicalUrl: "https://www.cabinetdealz.com/3d/aBcD1234_efGhI56",
      thumbnailUrl: "https://www.cabinetdealz.com/api/shared-3d-preview/aBcD1234_efGhI56.jpg",
    });

    expect(html).toContain("<title>Shared 3D Kitchen View | CabinetDealz</title>");
    expect(html).toContain('property="og:image" content="https://www.cabinetdealz.com/api/shared-3d-preview/aBcD1234_efGhI56.jpg"');
    expect(html).toContain('name="twitter:image" content="https://www.cabinetdealz.com/api/shared-3d-preview/aBcD1234_efGhI56.jpg"');
    expect(html).toContain('name="twitter:card" content="summary_large_image"');
    expect(html).toContain('name="robots" content="noindex, nofollow"');
    expect(html).not.toContain("manus-storage");
  });
});
