import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
const topNavSource = readFileSync(new URL("./components/TopNav.tsx", import.meta.url), "utf8");
const footerSource = readFileSync(new URL("./components/SiteFooter.tsx", import.meta.url), "utf8");

describe("public navigation and update notification", () => {
  it("keeps the deployed-version notice persistent and dismissible until a user chooses to refresh", () => {
    expect(appSource).toContain("duration: Infinity");
    expect(appSource).toContain('cancel: { label: "Later", onClick: () => undefined }');
    expect(appSource).toContain('action: { label: "Refresh now", onClick: onReload }');
  });

  it("registers the About page and exposes a working navigation route", () => {
    expect(appSource).toContain('const About = lazy(() => import("@/pages/About"))');
    expect(appSource).toContain('<Route path="/about">');
    expect(footerSource).toContain('{ label: "About Cabinet Dealz", href: "/about" }');
  });

  it("exposes a public vendor and supplier application route in the footer", () => {
    expect(footerSource).toContain('{ label: "Become a Vendor / Supplier", href: "/become-a-vendor" }');
    expect(appSource).toContain('<Route path="/become-a-vendor">');
  });

  it("uses the compact navigation before the header can overflow at standard desktop widths", () => {
    expect(topNavSource).toContain('className="hidden xl:flex items-center gap-0"');
    expect(topNavSource).toContain('className="xl:hidden"');
    expect(topNavSource).toContain('className="xl:hidden border-t border-border bg-background slide-up"');
  });
});
