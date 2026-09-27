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
	    expect(shippingPage).toContain('data-testid="vendor-edit-shipping"');
	    expect(shippingPage).toContain("Edit shipping &amp; warehouses");
	    expect(shippingPage).toContain('data-testid="vendor-shipping-edit-help"');
	    expect(shippingPage).toContain("VendorStyleOriginsEditor");
	    expect(shippingPage).toContain("Review &amp; edit");
	    expect(shippingPage).toContain("vendor-edit-style-origins-");
	  });

	  it("explains the green and yellow catalog-status badges without implying live inventory", () => {
	    const shippingPage = source.slice(source.indexOf("function VendorShippingPage"), source.indexOf("// ─── Promotions Page"));
	    expect(shippingPage).toContain('data-testid="vendor-catalog-status-legend"');
	    expect(shippingPage).toContain("Green</span> means every cabinet SKU is available and published.");
	    expect(shippingPage).toContain("Yellow</span> means one or more SKUs need availability or publishing review.");
	    expect(shippingPage).toContain("All catalog SKUs are available and customer-published");
	    expect(shippingPage).toContain("One or more catalog SKUs are unavailable or not customer-published");
	  });

	  it("lets vendors edit a single cabinet line's origin assignment directly from coverage", () => {
	    const editor = source.slice(source.indexOf("function VendorStyleOriginsEditor"), source.indexOf("function VendorShippingPage"));
	    expect(editor).toContain("Edit shipping origins");
	    expect(editor).toContain("updateFeaturedStyleMaterials.useMutation");
	    expect(editor).toContain("Use all");
	    expect(editor).toContain("Save origins");
	  });

	  it("gives vendors a visible Featured Style materials edit action instead of an icon-only control", () => {
	    const featuredPage = source.slice(source.indexOf("function VendorFeaturedStylesPage"), source.indexOf("// ─── Shipping Page"));
	    expect(featuredPage).toContain('data-testid="vendor-featured-style-edit-help"');
	    expect(featuredPage).toContain("Edit your line directly.");
	    expect(featuredPage).toContain("Edit materials");
	    expect(featuredPage).toContain("VendorFeaturedStyleEditor");
	    const editor = source.slice(source.indexOf("function VendorFeaturedStyleEditor"), source.indexOf("function VendorFeaturedStylesPage"));
	    expect(editor).toContain("trpc.distributorPortal.updateFeaturedStyleMaterials.useMutation");
	    expect(editor).toContain("Save Featured Style");
	  });

	  it("makes both editing areas reachable from the vendor dashboard and preserves the chosen section", () => {
	    const overview = source.slice(source.indexOf("function OverviewPage"), source.indexOf("// ─── Catalog Page"));
	    expect(overview).toContain('data-testid="vendor-editing-shortcuts"');
	    expect(overview).toContain("Manage Featured Styles");
	    expect(overview).toContain("Edit Shipping &amp; Warehouses");
	    expect(overview).toContain('onNavigate("featured-styles")');
	    expect(overview).toContain('onNavigate("shipping")');
	    expect(source).toContain('const requestedPage = params.get("section")');
	    expect(source).toContain('url.searchParams.set("section", nextPage)');
	    expect(source).toContain('aria-label="Vendor portal sections"');
	  });

  it("makes the approved vendor record, portal account, and PDF resources reachable in the supplier portal", () => {
    expect(source).toContain('id: "supplier-profile", label: "Supplier Profile"');
    expect(source).toContain('{page === "supplier-profile" && <SupplierProfilePage />}');
    const overview = source.slice(source.indexOf("function OverviewPage"), source.indexOf("// ─── Catalog Page"));
    expect(overview).toContain("Supplier account &amp; resources");
    expect(overview).toContain('onNavigate("supplier-profile")');
    expect(source).toContain('data-testid="supplier-profile-page"');
    expect(source).toContain("Portal account");
    expect(source).toContain("passwords are never displayed or stored in readable form");
    expect(source).toContain('label="PDF Catalog"');
    expect(source).toContain('label="PDF Spec Book"');
    expect(source).toContain("Open or download ${label}");
  });

	  it("adds a separate WooCommerce/Magento-style non-cabinet product import workspace", () => {
	    expect(source).toContain('id: "other-products", label: "Other Products"');
	    expect(source).toContain('{page === "other-products" && <VendorOtherProducts');
	    const otherProducts = readFileSync(new URL("../components/vendor/VendorOtherProducts.tsx", import.meta.url), "utf8");
	    expect(otherProducts).toContain("WooCommerce/Magento-style supplier import");
	    expect(otherProducts).toContain("Import spreadsheet");
	    expect(otherProducts).toContain("Nothing was deleted.");
	    expect(otherProducts).toContain("GENERIC_SUPPLIER_PRODUCT_IMAGE");
	    expect(otherProducts).toContain("Generic placeholder");
	    expect(otherProducts).toContain("trpc.distributorPortal.importVendorProducts.useMutation");
	    expect(otherProducts).toContain("source description, source price, and package dimensions/weight");
	  });
});
