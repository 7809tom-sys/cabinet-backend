import { Route, Switch } from "wouter";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { TopNav } from "@/components/TopNav";
import Home from "@/pages/Home";
import NotFound from "@/pages/NotFound";
import { lazy, Suspense } from "react";
import { Spinner } from "@/components/ui/spinner";

// Lazy-loaded pages
const Catalog = lazy(() => import("@/pages/Catalog"));
const CabinetDetail = lazy(() => import("@/pages/CabinetDetail"));
const DoorStyles = lazy(() => import("@/pages/DoorStyles"));
const DesignTool = lazy(() => import("@/pages/DesignTool"));
const Packages = lazy(() => import("@/pages/Packages"));
const PackageDetail = lazy(() => import("@/pages/PackageDetail"));

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
      <TopNav />
      <main className="flex-1">
        {children}
      </main>
    </div>
  );
}

export default function App() {
  return (
      <ThemeProvider defaultTheme="light">
      <Switch>
        {/* Home has its own footer, no AppLayout wrapper needed */}
        <Route path="/" component={Home} />

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
              <Suspense fallback={<PageLoader />}>
                <CabinetDetail masterCode={params.masterCode} />
              </Suspense>
            </AppLayout>
          )}
        </Route>

        <Route path="/packages">
          <AppLayout>
            <Suspense fallback={<PageLoader />}>
              <Packages />
            </Suspense>
          </AppLayout>
        </Route>

        <Route path="/packages/:slug">
          {(params) => (
            <AppLayout>
              <Suspense fallback={<PageLoader />}>
                <PackageDetail slug={params.slug} />
              </Suspense>
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

        <Route path="/design">
          <AppLayout>
            <Suspense fallback={<PageLoader />}>
              <DesignTool />
            </Suspense>
          </AppLayout>
        </Route>

        <Route path="/bulk-order">
          <AppLayout>
            <div className="container py-16 text-center">
              <h1 className="font-serif text-3xl font-bold mb-4">Bulk Order</h1>
              <p className="text-muted-foreground">Coming soon — upload a CSV or scan barcodes to place a full kitchen order.</p>
            </div>
          </AppLayout>
        </Route>

        <Route path="/cart">
          <AppLayout>
            <div className="container py-16 text-center">
              <h1 className="font-serif text-3xl font-bold mb-4">Cart</h1>
              <p className="text-muted-foreground">Your cart is empty.</p>
            </div>
          </AppLayout>
        </Route>

        <Route>
          <AppLayout>
            <NotFound />
          </AppLayout>
        </Route>
      </Switch>
      <Toaster />
    </ThemeProvider>
  );
}
