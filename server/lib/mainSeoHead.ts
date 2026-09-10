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
  return out;
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
