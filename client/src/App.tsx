import { Route, Switch } from "wouter";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { TopNav } from "@/components/TopNav";
import { SiteFooter } from "@/components/SiteFooter";
import { AdminEditModeBar } from "@/components/admin/AdminEditModeBar";
import ChatWidget from "@/components/ChatWidget";
import { useWhiteLabelHead } from "@/hooks/useWhiteLabelHead";
import { StorefrontEmbed } from "@/components/storefront/StorefrontEmbed";
import Home from "@/pages/Home";
import NotFound from "@/pages/NotFound";
import { lazy, Suspense, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import ErrorBoundary from "@/components/ErrorBoundary";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "sonner";
import { startVersionWatcher, setVersionNotifier } from "@/lib/versionWatcher";
import { trpc } from "@/lib/trpc";
import { ShoppingCart } from "lucide-react";

// Lazy-loaded pages
const Catalog = lazy(() => import("@/pages/Catalog"));
const Countertops = lazy(() => import("@/pages/Countertops"));
const CabinetDetail = lazy(() => import("@/pages/CabinetDetail"));
const DoorStyles = lazy(() => import("@/pages/DoorStyles"));
const Family = lazy(() => import("@/pages/Family"));
const DesignTool = lazy(() => import("@/pages/DesignTool"));
const DesignSession = lazy(() => import("@/pages/DesignSession"));
const ProNetwork = lazy(() => import("@/pages/ProNetwork"));
const BecomeVendor = lazy(() => import("@/pages/BecomeVendor"));
const OrderBuilder = lazy(() => import("@/pages/OrderBuilder"));
const Admin = lazy(() => import("@/pages/Admin"));
const AdminCatalogImport = lazy(() => import("@/pages/AdminCatalogImport"));
const Storefront = lazy(() => import("@/pages/Storefront"));
const StorefrontPreview = lazy(() => import("@/pages/StorefrontPreview"));
const AffiliateDashboard = lazy(() => import("@/pages/AffiliateDashboard"));
const ContractorDashboard = lazy(() => import("@/pages/ContractorDashboard"));
const Cart = lazy(() => import("@/pages/Cart"));
const DistributorPortal = lazy(() => import("@/pages/DistributorPortal"));
const VendorPortal = lazy(() => import("@/pages/VendorPortal"));
const PhotoToCart = lazy(() => import("@/pages/PhotoToCart"));
const FixturePhotoToCart = lazy(() => import("@/pages/FixturePhotoToCart"));
const SignIn = lazy(() => import("@/pages/SignIn"));
const Account = lazy(() => import("@/pages/Account"));
const PlanSheet = lazy(() => import("@/pages/PlanSheet"));
const FeeSystemDoc = lazy(() => import("@/pages/FeeSystemDoc"));
const Surfaces = lazy(() => import("@/pages/Surfaces"));
const SurfacesCategory = lazy(() => import("@/pages/SurfacesCategory"));
const SurfacesProduct = lazy(() => import("@/pages/SurfacesProduct"));
const SurfacesWizard = lazy(() => import("@/pages/SurfacesWizard"));
const DesignPresentation = lazy(() => import("@/pages/DesignPresentation"));
const FabricatorSheet = lazy(() => import("@/pages/FabricatorSheet"));
const StoneCreekCollection = lazy(() => import("@/pages/StoneCreekCollection"));
const PlumbersChoice = lazy(() => import("@/pages/PlumbersChoice"));
const PriceShop = lazy(() => import("@/pages/PriceShop"));
const BundleDeals = lazy(() => import("@/pages/BundleDeals"));
const Contact = lazy(() => import("@/pages/Contact"));
const ShippingPolicy = lazy(() => import("@/pages/ShippingPolicy"));
const ReturnPolicy = lazy(() => import("@/pages/ReturnPolicy"));
const PrivacyPolicy = lazy(() => import("@/pages/PrivacyPolicy"));
const Terms = lazy(() => import("@/pages/Terms"));

function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-[50vh]">
      <Spinner className="h-8 w-8 text-primary" />
    </div>
  );
}

function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      <AdminEditModeBar />
      <TopNav />
      <main className="flex-1">
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}

function CartWithLayout() {
  // If the cart was filled from an affiliate storefront, skip the CabinetDealz
  // header and just show a minimal back-to-store link instead.
  const slug = typeof localStorage !== "undefined" ? localStorage.getItem("cd_cart_slug_v1") : null;
  if (slug) {
    return (
      <Suspense fallback={<PageLoader />}>
        <AffiliateShell slug={slug} />
      </Suspense>
    );
  }
  return (
    <AppLayout>
      <Cart />
    </AppLayout>
  );
}

function AffiliateShell({ slug, children }: { slug: string; children?: React.ReactNode }) {
  const { data } = trpc.affiliates.bySlug.useQuery({ slug });
  const storeName = data?.storeName ?? "Store";
  const logoUrl = data?.logoUrl ?? null;
  const primaryColor = data?.primaryColor || "#1a2b4a";
  const accentColor = data?.accentColor || "#c9a227";
  // Keep the tab/favicon on the affiliate's brand for cart, order, and design
  // pages reached from their storefront.
  useWhiteLabelHead({ storeName: data?.storeName, tagline: data?.tagline, logoUrl });
  return (
    <div className="min-h-screen flex flex-col">
      <AdminEditModeBar />
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur px-4 py-3 flex items-center justify-between" style={{ borderBottomColor: accentColor, borderBottomWidth: 2 }}>
        <a href={`/store/${slug}`} className="flex items-center gap-2">
          {logoUrl ? (
            <img src={logoUrl} alt={storeName} className="h-8 w-auto max-w-[140px] object-contain" />
          ) : (
            <span className="text-lg font-bold" style={{ color: primaryColor }}>{storeName}</span>
          )}
        </a>
        <a href={`/store/${slug}/cart`} className="text-sm font-medium text-muted-foreground">
          <ShoppingCart className="h-5 w-5" />
        </a>
      </header>
      <main className="flex-1">
        {children ?? <Cart />}
      </main>
      {/* Affiliate's own published widget, so it follows customers through
          cart / order / design just like it does on the storefront. */}
      <StorefrontEmbed code={data?.embedCode} />
    </div>
  );
}

function DesignerRoute() {
  const search = useSearch();
  const affiliateSlug = new URLSearchParams(search).get("affiliate")?.trim() || null;
  const designer = (
    <Suspense fallback={<PageLoader />}>
      <DesignTool affiliateSlug={affiliateSlug ?? undefined} />
    </Suspense>
  );

  if (affiliateSlug) {
    return <AffiliateShell slug={affiliateSlug}>{designer}</AffiliateShell>;
  }

  return (
    <div className="flex flex-col overflow-hidden" style={{ height: "100dvh" }}>
      <TopNav />
      <div className="flex-1 min-h-0 overflow-hidden">{designer}</div>
    </div>
  );
}

export default function App() {
  const [, navigate] = useLocation();

  // When the server injected window.__AFFILIATE_SLUG__ (affiliate subdomain visit),
  // redirect the SPA router to /store/:slug so the storefront renders instead of
  // the main homepage. This runs once on mount, before any route renders.
  useEffect(() => {
    const slug = (window as unknown as Record<string, unknown>).__AFFILIATE_SLUG__ as string | undefined;
    if (slug && window.location.pathname === "/") {
      navigate(`/store/${slug}`, { replace: true });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // Show a gentle, non-blocking refresh prompt when a newer build is deployed,
    // so users (and customers) never get stuck on a stale cached version.
    setVersionNotifier(({ onReload }) => {
      toast("A new version is available", {
        description: "Refresh to get the latest cabinets and fixes.",
        duration: Infinity,
        action: { label: "Refresh", onClick: onReload },
      });
    });
    startVersionWatcher();
  }, []);

  return (
      <ThemeProvider defaultTheme="light">
      <Switch>
        {/* Home has its own footer, no AppLayout wrapper needed */}
        <Route path="/">
          <AdminEditModeBar />
          <Home />
        </Route>

        {/* Branded affiliate storefront — its own header/footer, no AppLayout */}
        <Route path="/store/:slug/cart">
          {(params) => (
            <Suspense fallback={<PageLoader />}>
              <AffiliateShell slug={params.slug}>
                <Cart />
              </AffiliateShell>
            </Suspense>
          )}
        </Route>
        <Route path="/store/:slug/order">
          {(params) => (
            <Suspense fallback={<PageLoader />}>
              <AffiliateShell slug={params.slug}>
                <OrderBuilder />
              </AffiliateShell>
            </Suspense>
          )}
        </Route>
        <Route path="/store/:slug/design">
          {(params) => (
            <Suspense fallback={<PageLoader />}>
              <AffiliateShell slug={params.slug}>
                <DesignTool affiliateSlug={params.slug} />
              </AffiliateShell>
            </Suspense>
          )}
        </Route>
        <Route path="/store/:slug">
          {(params) => (
            <Suspense fallback={<PageLoader />}>
              <Storefront slug={params.slug} />
            </Suspense>
          )}
        </Route>
        {/* Live template preview — no real affiliate needed */}
        <Route path="/store-preview/:template">
          {(params) => (
            <Suspense fallback={<PageLoader />}>
              <StorefrontPreview template={params.template as "classic" | "showcase" | "minimal" | "craftsman"} />
            </Suspense>
          )}
        </Route>

        {/* All other pages use AppLayout with TopNav */}
        <Route path="/catalog">
          <AppLayout>
            <Suspense fallback={<PageLoader />}>
              <Catalog />
            </Suspense>
          </AppLayout>
        </Route>

        <Route path="/catalog/:masterCode">
          {(params) => (
            <AppLayout>
              <ErrorBoundary>
                <Suspense fallback={<PageLoader />}>
                  <CabinetDetail masterCode={params.masterCode} />
                </Suspense>
              </ErrorBoundary>
            </AppLayout>
          )}
        </Route>

        <Route path="/styles">
          <AppLayout>
            <Suspense fallback={<PageLoader />}>
              <DoorStyles />
            </Suspense>
          </AppLayout>
        </Route>

        {/* Door-style FAMILY page: pick a family, shop every cabinet in it together */}
        <Route path="/family/:styleCode">
          {(params) => (
            <AppLayout>
              <Suspense fallback={<PageLoader />}>
                <Family styleCode={decodeURIComponent(params.styleCode)} />
              </Suspense>
            </AppLayout>
          )}
        </Route>

        <Route path="/design/session/:token">
          <Suspense fallback={<PageLoader />}>
            <DesignSession />
          </Suspense>
        </Route>

        <Route path="/design">
          <DesignerRoute />
        </Route>

        <Route path="/pro-network">
          <AppLayout>
            <Suspense fallback={<PageLoader />}>
              <ProNetwork />
            </Suspense>
          </AppLayout>
        </Route>

        <Route path="/become-a-vendor">
          <AppLayout>
            <Suspense fallback={<PageLoader />}>
              <BecomeVendor />
            </Suspense>
          </AppLayout>
        </Route>

        <Route path="/design-surfaces">
          <AppLayout>
            <Suspense fallback={<PageLoader />}>
              <SurfacesWizard />
            </Suspense>
          </AppLayout>
        </Route>
        <Route path="/surfaces/build">
          <AppLayout>
            <Suspense fallback={<PageLoader />}>
              <SurfacesWizard />
            </Suspense>
          </AppLayout>
        </Route>
        <Route path="/surfaces/product/:slug">
          {(params) => (
            <AppLayout>
              <Suspense fallback={<PageLoader />}>
                <SurfacesProduct slug={params.slug} />
              </Suspense>
            </AppLayout>
          )}
        </Route>
        <Route path="/surfaces/:slug">
          {(params) => (
            <AppLayout>
              <Suspense fallback={<PageLoader />}>
                <SurfacesCategory slug={params.slug} />
              </Suspense>
            </AppLayout>
          )}
        </Route>
        <Route path="/stonecreek">
          <AppLayout>
            <Suspense fallback={<PageLoader />}>
              <StoneCreekCollection />
            </Suspense>
          </AppLayout>
        </Route>
        <Route path="/plumbers-choice">
          <AppLayout>
            <Suspense fallback={<PageLoader />}>
              <PlumbersChoice />
            </Suspense>
          </AppLayout>
        </Route>
        <Route path="/surfaces">
          <AppLayout>
            <Suspense fallback={<PageLoader />}>
              <Surfaces />
            </Suspense>
          </AppLayout>
        </Route>
        <Route path="/countertops">
          <AppLayout>
            <Suspense fallback={<PageLoader />}>
              <Countertops />
            </Suspense>
          </AppLayout>
        </Route>

        <Route path="/admin">
          <AppLayout>
            <Suspense fallback={<PageLoader />}>
              <Admin />
            </Suspense>
          </AppLayout>
        </Route>

        <Route path="/admin/catalog-import">
          <AppLayout>
            <Suspense fallback={<PageLoader />}>
              <AdminCatalogImport />
            </Suspense>
          </AppLayout>
        </Route>

        <Route path="/distributor">
          <AppLayout>
            <Suspense fallback={<PageLoader />}>
              <DistributorPortal />
            </Suspense>
          </AppLayout>
        </Route>

        <Route path="/vendor">
          <AppLayout>
            <Suspense fallback={<PageLoader />}>
              <VendorPortal />
            </Suspense>
          </AppLayout>
        </Route>

        <Route path="/affiliate">
          <AppLayout>
            <Suspense fallback={<PageLoader />}>
              <AffiliateDashboard />
            </Suspense>
          </AppLayout>
        </Route>

        <Route path="/contractor">
          <AppLayout>
            <Suspense fallback={<PageLoader />}>
              <ContractorDashboard />
            </Suspense>
          </AppLayout>
        </Route>

        <Route path="/order/new">
          <AppLayout>
            <Suspense fallback={<PageLoader />}>
              <OrderBuilder />
            </Suspense>
          </AppLayout>
        </Route>

        <Route path="/bulk-order">
          <AppLayout>
            <Suspense fallback={<PageLoader />}>
              <OrderBuilder />
            </Suspense>
          </AppLayout>
        </Route>

        <Route path="/cart">
          <Suspense fallback={<PageLoader />}>
            <CartWithLayout />
          </Suspense>
        </Route>

        <Route path="/account">
          <AppLayout>
            <Suspense fallback={<PageLoader />}>
              <Account />
            </Suspense>
          </AppLayout>
        </Route>

        <Route path="/signin">
          <AppLayout>
            <Suspense fallback={<PageLoader />}>
              <SignIn />
            </Suspense>
          </AppLayout>
        </Route>

        <Route path="/photo-to-cart">
          <AppLayout>
            <Suspense fallback={<PageLoader />}>
              <PhotoToCart />
            </Suspense>
          </AppLayout>
        </Route>

        <Route path="/fixture-photo">
          <AppLayout>
            <Suspense fallback={<PageLoader />}>
              <FixturePhotoToCart />
            </Suspense>
          </AppLayout>
        </Route>

        <Route path="/price-shop">
          <AppLayout>
            <Suspense fallback={<PageLoader />}>
              <PriceShop />
            </Suspense>
          </AppLayout>
        </Route>

        <Route path="/bundles">
          <AppLayout>
            <Suspense fallback={<PageLoader />}>
              <BundleDeals />
            </Suspense>
          </AppLayout>
        </Route>

        {/* Printable graph-paper plan sheet — standalone, print-optimized, no app chrome */}
        <Route path="/plan-sheet">
          <Suspense fallback={<PageLoader />}>
            <PlanSheet />
          </Suspense>
        </Route>

        {/* Design Presentation — print-optimized design package for customers */}
        <Route path="/design/presentation">
          <Suspense fallback={<PageLoader />}>
            <DesignPresentation />
          </Suspense>
        </Route>
        <Route path="/design/fabricator-sheet">
          <Suspense fallback={<PageLoader />}>
            <FabricatorSheet />
          </Suspense>
        </Route>

        {/* Admin-only Fee System reference sheet — print/PDF, no app chrome */}
        <Route path="/admin/fee-system">
          <Suspense fallback={<PageLoader />}>
            <FeeSystemDoc />
          </Suspense>
        </Route>

        <Route path="/contact">
          <AppLayout>
            <Suspense fallback={<PageLoader />}>
              <Contact />
            </Suspense>
          </AppLayout>
        </Route>

        <Route path="/shipping-policy">
          <AppLayout>
            <Suspense fallback={<PageLoader />}>
              <ShippingPolicy />
            </Suspense>
          </AppLayout>
        </Route>

        <Route path="/return-policy">
          <AppLayout>
            <Suspense fallback={<PageLoader />}>
              <ReturnPolicy />
            </Suspense>
          </AppLayout>
        </Route>

        <Route path="/privacy-policy">
          <AppLayout>
            <Suspense fallback={<PageLoader />}>
              <PrivacyPolicy />
            </Suspense>
          </AppLayout>
        </Route>

        <Route path="/terms">
          <AppLayout>
            <Suspense fallback={<PageLoader />}>
              <Terms />
            </Suspense>
          </AppLayout>
        </Route>

        <Route>
          <AppLayout>
            <NotFound />
          </AppLayout>
        </Route>
      </Switch>
      <ChatWidget />
      <Toaster />
    </ThemeProvider>
  );
}
