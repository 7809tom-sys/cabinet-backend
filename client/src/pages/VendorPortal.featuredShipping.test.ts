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

  it("lets a supplier update its own profile and upload its own catalog resources", () => {
    const profile = source.slice(source.indexOf("function SupplierProfileEditor"), source.indexOf("function SupplierProfilePage"));
    expect(profile).toContain('data-testid="edit-supplier-profile"');
    expect(profile).toContain("trpc.distributorPortal.updateSupplierProfile.useMutation");
    expect(profile).toContain("trpc.distributorPortal.uploadSupplierResourcePdf.useMutation");
    expect(profile).toContain("Edit supplier profile");
    expect(profile).toContain("Supply-line identity, approval, and pricing stay protected.");
    expect(profile).toContain('accept="application/pdf"');
    expect(profile).toContain("PDF files must be between 1 byte and 12 MB.");
  });

  it("gives administrators a labeled quick vendor-account switcher that preserves the current portal section", () => {
    expect(source).toContain("function AdminVendorQuickSwitch");
    expect(source).toContain('data-testid="admin-vendor-quick-switcher"');
    expect(source).toContain('aria-label="Administrator vendor account switcher"');
    expect(source).toContain('aria-label="Quick switch vendor account"');
    expect(source).toContain("Admin quick switch");
    expect(source).toContain("Keeps this portal section open while switching accounts.");
    expect(source).toContain("const switchAdminVendor = useCallback");
    expect(source).toContain('url.searchParams.set("as", String(distributorId))');
    expect(source).toContain("className=\"mb-4 md:hidden\"");
    expect(source).toContain("mobile");
  });

  it("lets an approved vendor use either direct email registration or a private supplier setup link", () => {
    const login = source.slice(source.indexOf("function VendorLoginForm"), source.indexOf("// ─── Main Vendor Portal Component"));
    expect(login).toContain("New approved vendor? Create your password");
    expect(login).toContain("private setup link for");
    expect(login).toContain("works even if no email has been preloaded by Cabinet Dealz");
    expect(login).toContain("private one-time setup link");
    expect(login).toContain("Either route opens only your supplier portal.");
  });

  it("keeps every approved vendor logged into its own editable profile before a catalog line is linked", () => {
    expect(source).toContain("const supplierProfileOnly = Boolean(");
    expect(source).toContain("user.approvedVendorLineId != null");
    expect(source).toContain('page={supplierProfileOnly ? "supplier-profile" : page}');
    expect(source).toContain('item.id === "supplier-profile"');
    expect(source).toContain("Pending source-line link");
  });

  it("lets administrators switch across every approved vendor record, including profile-only suppliers", () => {
    expect(source).toContain("const approvedVendors = trpc.vendors.list.useQuery");
    expect(source).toContain("adminApprovedVendorLineId");
    expect(source).toContain('url.searchParams.set("vendor", String(vendor.id))');
    expect(source).toContain("Profile only");
    expect(source).toContain("approvedVendorList.filter((vendor) => vendor.isApproved)");
  });

  it("refreshes the displayed supplier profile after profile or PDF edits", () => {
    expect(source).toContain("utils.distributorPortal.supplierProfile.invalidate()");
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
