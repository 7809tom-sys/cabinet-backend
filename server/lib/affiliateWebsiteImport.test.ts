import { describe, expect, it } from "vitest";
import { extractAffiliateWebsiteDraft, normalizeAffiliateWebsiteUrl } from "./affiliateWebsiteImport";

const SITE = `
  <html><head>
    <title>Harbor Kitchen Studio</title>
    <meta property="og:site_name" content="Harbor Kitchen Studio" />
    <meta name="description" content="Family-owned kitchen design and cabinetry in the bay area." />
    <meta name="theme-color" content="#183b62" />
    <meta property="og:image" content="/brand-logo.png" />
    <script type="application/ld+json">{"@context":"https://schema.org","@type":"LocalBusiness","name":"Harbor Kitchen Studio","telephone":"(941) 555-0199","address":{"streetAddress":"15 Harbor Lane","addressLocality":"Sarasota","addressRegion":"FL"},"review":{"@type":"Review","reviewBody":"The design team made our remodel easy from start to finish.","author":{"@type":"Person","name":"Morgan R."}}}</script>
  </head><body>
    <a href="https://www.facebook.com/harborkitchen">Facebook</a>
    <a href="https://instagram.com/harborkitchen">Instagram</a>
    <section class="customer-testimonial"><p>We love our new kitchen and the careful installation.</p><cite class="customer-name">Alex P.</cite></section>
  </body></html>`;

describe("affiliate website brand import", () => {
  it("normalizes a public website URL and rejects non-http protocols", () => {
    expect(normalizeAffiliateWebsiteUrl("harborkitchen.example")).toBe("https://harborkitchen.example/");
    expect(() => normalizeAffiliateWebsiteUrl("file:///etc/passwd")).toThrow(/public http or https/i);
    expect(() => normalizeAffiliateWebsiteUrl("http://127.0.0.1")).toThrow(/private network/i);
  });

  it("extracts reviewable public business identity, contacts, and source-attributed testimonials", () => {
    expect(extractAffiliateWebsiteDraft(SITE, "https://harborkitchen.example")).toMatchObject({
      sourceUrl: "https://harborkitchen.example/",
      storeName: "Harbor Kitchen Studio",
      logoUrl: "https://harborkitchen.example/brand-logo.png",
      primaryColor: "#183b62",
      publicPhone: "(941) 555-0199",
      publicAddress: "15 Harbor Lane, Sarasota, FL",
      facebookUrl: "https://www.facebook.com/harborkitchen",
      instagramUrl: "https://instagram.com/harborkitchen",
    });
    const draft = extractAffiliateWebsiteDraft(SITE, "https://harborkitchen.example");
    expect(draft.testimonials).toEqual(expect.arrayContaining([
      expect.objectContaining({ quote: "The design team made our remodel easy from start to finish.", author: "Morgan R.", sourceUrl: "https://harborkitchen.example/" }),
    ]));
  });
});
