import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const homeSource = readFileSync(resolve(process.cwd(), "client/src/pages/Home.tsx"), "utf8");
const welcomeSource = readFileSync(resolve(process.cwd(), "client/src/components/home/HomepageWelcomeBanner.tsx"), "utf8");

describe("B2B homepage hierarchy", () => {
  it("keeps complete-kitchen planning primary and uses Kitchen Packages as the single offering label", () => {
    expect(homeSource).toContain('Plan a Complete Kitchen');
    expect(homeSource).toContain('bg-[var(--color-gold)] text-[var(--color-navy)]');
    expect(homeSource).toContain('Kitchen Packages');
    expect(homeSource).not.toContain('Bundle Deals');
    expect(homeSource).toContain('variant="outline" className="border-white/80 text-white');
    expect(welcomeSource).toContain('variant="ghost"');
  });

  it("uses stronger secondary actions and concise complete-kitchen hero copy", () => {
    expect(homeSource).toContain('Surfaces & Fixtures');
    expect(homeSource).toContain("Plumber's Choice");
    expect(homeSource).toContain('border-white/80 text-white');
    expect(homeSource).toContain('Start with a complete kitchen idea, select a style and package, then customize the layout, surfaces, fixtures, and quote for your space.');
    expect(homeSource).toContain('font-serif text-4xl md:text-5xl lg:text-6xl font-bold');
  });

  it("labels featured styles only with the verified active-catalog state and presents affiliate benefits in a responsive grid", () => {
    expect(homeSource).toContain('Active catalog');
    expect(homeSource).toContain('CircleCheck');
    expect(homeSource).toContain('grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3');
    expect(homeSource).not.toContain('In Stock');
    expect(homeSource).not.toContain('Ships in');
  });

  it("uses up to six verified room scenes per Door Style and stabilizes a signed-in visitor’s matching selection for the active session", () => {
    expect(homeSource).toContain('const MAX_FEATURED_STYLES = 6');
    expect(homeSource).toContain('if (!s.roomScenes?.length) return false;');
    expect(homeSource).toContain('cabinetdealz:featured-room-scene:');
    expect(homeSource).toContain('sessionStorage.setItem');
    expect(homeSource).toContain('sessionSceneIds[style.id]');
    expect(homeSource).toContain('rest.slice(0, MAX_FEATURED_STYLES - 1)');
  });

  it("keeps public featured room scenes free of distributor identity", () => {
    expect(homeSource).not.toContain('distributorName');
  });
});
