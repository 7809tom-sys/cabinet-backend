import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./TopNav.tsx", import.meta.url), "utf8");
const css = () => readFileSync(new URL("./TopNav.css", import.meta.url), "utf8");

describe("site toolbar account visibility", () => {
  it("gives the site toolbar an auto-height wrapping row rather than a clipped fixed-height row", () => {
    expect(source).toContain('import "./TopNav.css"');
    expect(source).toContain('data-testid="site-toolbar-row"');
    expect(source).toContain("min-h-16");
    expect(source).not.toContain('className="container flex h-16 items-center justify-between gap-2"');
    expect(css()).toContain("flex-wrap: wrap;");
  });

  it("reserves a separate bounded row for shopping links and keeps account actions in the first row", () => {
    expect(source).toContain('data-testid="site-toolbar-navigation"');
    expect(source).toContain('data-testid="site-toolbar-actions"');
    expect(source).toContain('data-testid="site-toolbar-account-actions"');
    expect(css()).toContain('[data-testid="site-toolbar-navigation"]');
    expect(css()).toContain("order: 4;");
    expect(css()).toContain("flex-basis: 100%;");
    expect(css()).toContain("max-width: 100%;");
    expect(css()).not.toMatch(/overflow(?:-x)?:\s*(?:hidden|auto|scroll)/);
  });

  it("keeps every desktop action visible without collisions at common computer widths", () => {
    const styles = css();

    // The visual content container remains 1280px wide even on a larger
    // monitor. Keep account controls in the first row and the complete
    // shopping row beneath it instead of re-enabling two colliding clusters.
    expect(styles).not.toContain("@media (min-width: 1280px) and (max-width: 1599px)");
    expect(styles).toContain('[data-designer-route="true"] [data-testid="site-toolbar-navigation"]');
    expect(styles).toContain("order: 4;");
    expect(styles).toContain("flex-basis: 100%;");
    expect(styles).toContain("font-size: 0.75rem;");
    expect(styles).toContain("min-height: 2rem;");
  });

  it("preserves direct affiliate, admin, account and sign-out actions and all original destinations", () => {
    for (const destination of ["/kitchens", "/styles", "/catalog", "/countertops", "/surfaces", "/stonecreek", "/plumbers-choice", "/design", "/affiliate", "/account", "/admin"]) {
      expect(source).toContain(destination);
    }
    expect(source).toContain("Affiliate Portal");
    expect(source).toContain("My Account");
    expect(source).toContain('aria-label="Sign out"');
    expect(source).toContain('onClick={handleLogout}');
    expect(source).toContain('data-testid="designer-immersive-header"');
    expect(source).toContain('aria-label="Toggle menu"');
  });
});
