import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Menu, X, ShoppingCart, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { useCart } from "@/contexts/CartContext";

const NAV_LINKS = [
  { label: "Shop by Style", href: "/styles" },
  { label: "Kitchen Packages", href: "/packages" },
  { label: "All Cabinets", href: "/catalog" },
  { label: "Design Tool", href: "/design" },
  { label: "Build an Order", href: "/order/new" },
  { label: "Photo to Cart", href: "/photo-to-cart" },
  { label: "Pro Network", href: "/pro-network" },
];

const PORTAL_LINKS = [
  { label: "Supplier Portal", href: "/distributor" },
  { label: "Dealer Portal", href: "/portal/dealer" },
  { label: "Affiliate Portal", href: "/affiliate" },
  { label: "Admin", href: "/admin" },
];

export function TopNav() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [portalsOpen, setPortalsOpen] = useState(false);
  const [location] = useLocation();
  const { user } = useAuth();
  const { count: cartCount } = useCart();

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur-sm supports-[backdrop-filter]:bg-background/80">
      <div className="container flex h-16 items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 shrink-0">
          <div className="flex h-8 w-8 items-center justify-center rounded bg-[var(--color-navy)] text-white font-bold text-sm">
            CD
          </div>
          <span className="font-serif text-xl font-bold text-[var(--color-navy)] dark:text-foreground">
            Cabinet<span className="text-[var(--color-gold)]">Dealz</span>
          </span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-1">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`px-3 py-2 rounded-md text-sm font-medium transition-colors duration-150 ${
                location.startsWith(link.href)
                  ? "bg-primary/10 text-primary"
                  : "text-foreground/70 hover:text-foreground hover:bg-muted"
              }`}
            >
              {link.label}
            </Link>
          ))}

          {/* Portals dropdown */}
          <div className="relative">
            <button
              onClick={() => setPortalsOpen(!portalsOpen)}
              className="flex items-center gap-1 px-3 py-2 rounded-md text-sm font-medium text-foreground/70 hover:text-foreground hover:bg-muted transition-colors duration-150"
            >
              Portals
              <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-150 ${portalsOpen ? "rotate-180" : ""}`} />
            </button>
            {portalsOpen && (
              <div
                className="absolute right-0 top-full mt-1 w-48 rounded-lg border border-border bg-popover shadow-lg py-1 fade-in"
                onMouseLeave={() => setPortalsOpen(false)}
              >
                {PORTAL_LINKS.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setPortalsOpen(false)}
                    className="block px-4 py-2 text-sm text-popover-foreground hover:bg-muted transition-colors"
                  >
                    {link.label}
                  </Link>
                ))}
              </div>
            )}
          </div>
        </nav>

        {/* Right side actions */}
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" asChild className="relative">
            <Link href="/cart" aria-label="Shopping cart">
              <ShoppingCart className="h-5 w-5" />
              {cartCount > 0 && (
                <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-none text-primary-foreground">
                  {cartCount > 99 ? "99+" : cartCount}
                </span>
              )}
            </Link>
          </Button>

          {user ? (
            <div className="hidden md:flex items-center gap-2">
              <span className="text-sm text-muted-foreground">{user.name || user.email}</span>
              <Link href="/account">
                <Button variant="outline" size="sm">Account</Button>
              </Link>
            </div>
          ) : (
            <a href={getLoginUrl()}>
              <Button
                size="sm"
                className="hidden md:flex bg-[var(--color-navy)] text-white hover:bg-[var(--color-navy)]/90"
              >
                Sign In
              </Button>
            </a>
          )}

          {/* Mobile menu toggle */}
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label="Toggle menu"
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>
      </div>

      {/* Mobile nav */}
      {mobileOpen && (
        <div className="md:hidden border-t border-border bg-background slide-up">
          <nav className="container py-4 flex flex-col gap-1">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMobileOpen(false)}
                className={`px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${
                  location.startsWith(link.href)
                    ? "bg-primary/10 text-primary"
                    : "text-foreground/70 hover:text-foreground hover:bg-muted"
                }`}
              >
                {link.label}
              </Link>
            ))}
            <div className="border-t border-border my-2" />
            {PORTAL_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMobileOpen(false)}
                className="px-3 py-2.5 rounded-md text-sm font-medium text-foreground/70 hover:text-foreground hover:bg-muted transition-colors"
              >
                {link.label}
              </Link>
            ))}
            <div className="border-t border-border my-2" />
            {!user && (
              <a href={getLoginUrl()} className="px-3">
                <Button className="w-full bg-[var(--color-navy)] text-white">Sign In</Button>
              </a>
            )}
          </nav>
        </div>
      )}
    </header>
  );
}
