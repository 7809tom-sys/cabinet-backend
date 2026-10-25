type MainSeoHeadInput = {
  canonicalUrl: string;
  requestPath: string;
};

const PRIVATE_PATHS = [
  "/admin", "/administration", "/account", "/cart", "/checkout", "/design",
  "/order", "/bulk-order", "/photo-to-cart", "/distributor", "/affiliate-dashboard",
];

const PUBLIC_ROUTE_COPY: Record<string, { title: string; description: string }> = {
  "/": {
    title: "CabinetDealz | Cabinets, Countertops & Kitchen Design",
    description: "Explore cabinet styles, kitchen design tools, countertops, and fixture options for your next project.",
  },
  "/styles": {
    title: "Cabinet Door Styles | CabinetDealz",
    description: "Explore cabinet door styles and finish collections for kitchen and bath projects.",
  },
  "/catalog": {
    title: "Cabinet Catalog | CabinetDealz",
    description: "Browse cabinet collections, cabinet configurations, and kitchen project options.",
  },
  "/bundles": {
    title: "Kitchen Packages | CabinetDealz",
    description: "Explore ready-to-customize complete kitchen package ideas before opening the kitchen designer.",
  },
  "/kitchens": {
    title: "Plan Your Complete Kitchen | CabinetDealz",
    description: "Explore kitchen styles, complete package ideas, and a guided path from room inspiration to kitchen design and quote.",
  },
  "/designer-guide": {
    title: "How to Design a Complete Kitchen | CabinetDealz",
    description: "Follow the CabinetDealz Designer walkthrough to set room size, place cabinets, plan working zones, select finishes, and review your complete kitchen plan.",
  },
  "/surfaces": {
    title: "Countertops, Sinks & Fixtures | CabinetDealz",
    description: "Explore countertop, sink, faucet, and fixture selections for kitchen projects.",
  },
};

/**
 * A small, route-specific document for non-JavaScript crawlers. The interactive
 * React page remains authoritative for customers, but this preserves the same
 * kitchen-first path when a crawler does not execute client JavaScript. Content
 * stays deliberately factual: no local-market, availability, or price claims.
 */
const PUBLIC_ROUTE_NOSCRIPT: Record<string, string> = {
  "/": `
    <main aria-labelledby="cd-crawl-title">
      <h1 id="cd-crawl-title">Plan your complete kitchen with CabinetDealz</h1>
      <p>Begin with a kitchen look, then compare cabinet styles, explore a Kitchen Package or layout, select surfaces and fixtures, and prepare a complete kitchen request.</p>
      <nav aria-label="Kitchen planning paths"><ul>
        <li><a href="/kitchens">Plan a complete kitchen</a></li>
        <li><a href="/bundles">Explore Kitchen Packages</a></li>
        <li><a href="/styles">Browse cabinet styles</a></li>
        <li><a href="/design">Open the kitchen designer</a></li>
      </ul></nav>
    </main>`,
  "/kitchens": `
    <main aria-labelledby="cd-crawl-title">
      <h1 id="cd-crawl-title">Plan the kitchen you want to live in</h1>
      <p>Start with the whole kitchen: choose a look, consider a ready-to-customize Kitchen Package or layout, select finishes and fixtures, then prepare the complete project for a quote discussion.</p>
      <ol>
        <li><strong>Choose your look.</strong> Explore cabinet styles and finishes with the full room in mind.</li>
        <li><strong>Start with a package or layout.</strong> Use a Kitchen Package as a starting point or build a layout in the kitchen designer.</li>
        <li><strong>Build the complete quote request.</strong> Bring cabinets, surfaces, fixtures, and delivery information together for the project.</li>
      </ol>
      <h2>Kitchen planning answers</h2>
      <dl>
        <dt>How do I start planning a complete kitchen?</dt><dd>Start with a kitchen look, then explore a package or build your layout in the kitchen designer.</dd>
        <dt>Can I begin with a ready-to-customize kitchen package?</dt><dd>Yes. Kitchen Packages provide a ready-to-customize starting point before you move into the design process.</dd>
        <dt>What should I have before I begin a kitchen design?</dt><dd>You can start with a kitchen style or package. Room measurements help organize the layout when you open the kitchen designer.</dd>
        <dt>When should I request a kitchen quote?</dt><dd>Request a quote after selecting the kitchen direction, package, or layout you want to discuss for the complete project.</dd>
      </dl>
      <nav aria-label="Next kitchen planning steps"><ul><li><a href="/bundles">Explore Kitchen Packages</a></li><li><a href="/styles">Browse cabinet styles</a></li><li><a href="/design">Design my kitchen</a></li></ul></nav>
    </main>`,
  "/bundles": `
    <main aria-labelledby="cd-crawl-title">
      <h1 id="cd-crawl-title">Kitchen Packages</h1>
      <p>Explore ready-to-customize complete kitchen package ideas before moving into kitchen planning, design, and quote review.</p>
      <p><a href="/kitchens">Plan a complete kitchen</a> or <a href="/design">open the kitchen designer</a> to continue.</p>
    </main>`,
  "/catalog": `
    <main aria-labelledby="cd-crawl-title">
      <h1 id="cd-crawl-title">Cabinet catalog for complete kitchen planning</h1>
      <p>Browse cabinet configurations and collections as part of a whole kitchen plan. Compare style and layout choices before creating a kitchen design or requesting a complete project quote.</p>
      <p><a href="/kitchens">Start with a complete kitchen plan</a> or <a href="/styles">browse cabinet styles</a>.</p>
    </main>`,
  "/designer-guide": `
    <main aria-labelledby="cd-crawl-title">
      <h1 id="cd-crawl-title">How to design a complete kitchen</h1>
      <p>Set the room size, place cabinets, plan working zones, select finishes, and review the complete kitchen plan before requesting a quote.</p>
      <p><a href="/design">Open the kitchen designer</a> or <a href="/kitchens">explore the complete kitchen planning path</a>.</p>
    </main>`,
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function replaceMeta(html: string, attribute: "name" | "property", key: string, content: string): string {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`<meta\\s+${attribute}=["']${escapedKey}["'][^>]*>`, "i");
  const tag = `<meta ${attribute}="${key}" content="${escapeHtml(content)}" />`;
  return pattern.test(html) ? html.replace(pattern, tag) : html.replace("</head>", `  ${tag}\n</head>`);
}

function replaceCanonical(html: string, canonicalUrl: string): string {
  const pattern = /<link\s+rel=["']canonical["'][^>]*>/i;
  const tag = `<link rel="canonical" href="${escapeHtml(canonicalUrl)}" />`;
  return pattern.test(html) ? html.replace(pattern, tag) : html.replace("</head>", `  ${tag}\n</head>`);
}

function replaceMainJsonLd(html: string, schema: Record<string, unknown>[]): string {
  const withoutExisting = html.replace(
    /<script\s+type=["']application\/ld\+json["'][^>]*data-main-seo[^>]*>[\s\S]*?<\/script>\s*/gi,
    "",
  );
  const safeJson = JSON.stringify(schema).replace(/</g, "\\u003c");
  return withoutExisting.replace(
    "</head>",
    `  <script type="application/ld+json" data-main-seo="true">${safeJson}</script>\n</head>`,
  );
}

function stripMainNoscript(html: string): string {
  return html.replace(/\s*<noscript\s+data-main-seo-noscript[^>]*>[\s\S]*?<\/noscript>/gi, "");
}

function injectMainNoscript(html: string, pathname: string, privateRoute: boolean): string {
  const document = privateRoute ? null : PUBLIC_ROUTE_NOSCRIPT[pathname] ?? null;
  const withoutExisting = stripMainNoscript(html);
  if (!document) return withoutExisting;
  const block = `<noscript data-main-seo-noscript="true">${document}</noscript>`;
  const rootPattern = /(<div\s+id=["']root["'][^>]*><\/div>)/i;
  return rootPattern.test(withoutExisting)
    ? withoutExisting.replace(rootPattern, `$1${block}`)
    : withoutExisting.replace("</body>", `${block}</body>`);
}

export function injectMainSeoHead(html: string, input: MainSeoHeadInput): string {
  const pathname = input.requestPath.split("?")[0].replace(/\/+$/, "") || "/";
  const privateRoute = PRIVATE_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
  const routeCopy = PUBLIC_ROUTE_COPY[pathname] ?? PUBLIC_ROUTE_COPY["/"];
  const title = privateRoute ? "CabinetDealz" : routeCopy.title;
  const description = privateRoute ? "Cabinet project workspace." : routeCopy.description;
  const canonicalUrl = input.canonicalUrl;

  let out = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeHtml(title)}</title>`);
  out = replaceMeta(out, "name", "description", description);
  out = replaceMeta(out, "property", "og:title", title);
  out = replaceMeta(out, "property", "og:description", description);
  out = replaceMeta(out, "property", "og:url", canonicalUrl);
  out = replaceMeta(out, "name", "twitter:title", title);
  out = replaceMeta(out, "name", "twitter:description", description);
  out = replaceMeta(out, "name", "robots", privateRoute ? "noindex, nofollow" : "index, follow, max-image-preview:large");
  out = replaceCanonical(out, canonicalUrl);

  if (!privateRoute) {
    out = replaceMainJsonLd(out, [
      {
        "@context": "https://schema.org",
        "@type": "Organization",
        name: "CabinetDealz",
        url: canonicalUrl.replace(/\/$/, ""),
      },
      {
        "@context": "https://schema.org",
        "@type": "WebSite",
        name: "CabinetDealz",
        url: canonicalUrl.replace(/\/$/, ""),
      },
    ]);
  }
  return injectMainNoscript(out, pathname, privateRoute);
}

export function injectSharedThreeDViewHead(html: string, input: {
  canonicalUrl: string;
  thumbnailUrl?: string | null;
}): string {
  const title = "Shared 3D Kitchen View | CabinetDealz";
  const description = "Open this shared CabinetDealz 3D kitchen perspective.";
  let out = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeHtml(title)}</title>`);
  out = replaceMeta(out, "name", "description", description);
  out = replaceMeta(out, "property", "og:title", title);
  out = replaceMeta(out, "property", "og:description", description);
  out = replaceMeta(out, "property", "og:url", input.canonicalUrl);
  out = replaceMeta(out, "name", "twitter:title", title);
  out = replaceMeta(out, "name", "twitter:description", description);
  out = replaceMeta(out, "name", "robots", "noindex, nofollow");
  out = replaceMeta(out, "name", "twitter:card", input.thumbnailUrl ? "summary_large_image" : "summary");
  out = replaceCanonical(out, input.canonicalUrl);
  if (input.thumbnailUrl) {
    out = replaceMeta(out, "property", "og:image", input.thumbnailUrl);
    out = replaceMeta(out, "name", "twitter:image", input.thumbnailUrl);
  }
  return out;
}
