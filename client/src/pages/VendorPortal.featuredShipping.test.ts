import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./VendorPortal.tsx", import.meta.url), "utf8");

describe("Vendor Portal Featured Styles and Shipping", () => {
  it("adds separately reachable Featured Styles and Shipping portal pages", () => {
    expect(source).toContain('id: "featured-styles", label: "Featured Styles"');
    expect(source).toContain('id: "shipping", label: "Shipping"');
    expect(source).toContain('{page === "featured-styles" && <VendorFeaturedStylesPage />}');
    expect(source).toContain('{page === "shipping" && <VendorShippingPage />}');
  });

	  it("uses vendor-scoped Featured Styles procedures instead of the global admin list", () => {
	    const featuredPage = source.slice(source.indexOf("function VendorFeaturedStylesPage"), source.indexOf("// ─── Shipping Page"));
	    expect(featuredPage).toContain("trpc.distributorPortal.featuredStyles.useQuery");
    expect(featuredPage).toContain("trpc.distributorPortal.setFeaturedStyle.useMutation");
    expect(featuredPage).toContain("trpc.distributorPortal.reorderFeaturedStyles.useMutation");
    expect(featuredPage).toContain("only includes door styles that have cabinets in your catalog");
    expect(featuredPage).toContain("cabinet SKU");
	    expect(featuredPage).not.toContain("trpc.doorStyles.listForAdmin");
	  });

	  it("searches the vendor's actual cabinet SKUs and offers multi-category filters", () => {
	    const featuredPage = source.slice(source.indexOf("function VendorFeaturedStylesPage"), source.indexOf("// ─── Shipping Page"));
	    expect(featuredPage).toContain('placeholder="Search cabinet SKU or description…"');
	    expect(featuredPage).toContain('aria-label="Cabinet categories"');
	    expect(featuredPage).toContain("selectedCategories");
	    expect(featuredPage).toContain("categories: selectedCategories");
	    expect(featuredPage).toContain("Search matches cabinet master codes, vendor/platform SKUs, and descriptions");
	    expect(featuredPage).toContain("Matches:");
	    expect(featuredPage).toContain("Clear filters to reorder the complete list.");
	  });

	  it("states the automatic warehouse check accurately and keeps it tied to shipping origins", () => {
    const shippingPage = source.slice(source.indexOf("function VendorShippingPage"), source.indexOf("// ─── Promotions Page"));
    expect(shippingPage).toContain("All cabinet lines cover every configured warehouse");
    expect(shippingPage).toContain("does not represent a live on-hand inventory count");
    expect(shippingPage).toContain("trpc.distributorPortal.shippingOverview.useQuery");
    expect(shippingPage).toContain("All warehouses");
  });
});
