import express from "express";
import type { AddressInfo } from "net";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("../db", () => ({ getDb: async () => null }));
vi.mock("../storage", () => ({ storageFetchObject: async () => new Response(null, { status: 404 }) }));

import {
  affiliateAppIconPath,
  affiliateManifestPath,
  buildAffiliateWebManifest,
  letterIconSvg,
  registerAffiliateHomeScreenRoutes,
  renderAffiliateAppIcon,
  storageKeyForBrandImage,
  type AffiliateHomeScreenBrand,
} from "./affiliateHomeScreen";

const reaves: AffiliateHomeScreenBrand = {
  slug: "reaves-way-cabinet-shop",
  storeName: "Reaves Way Cabinet Shop",
  tagline: "Cabinets designed for your home",
  primaryColor: "#225577",
  backgroundColor: "#F8F4EE",
};

async function pngInfo(png: Buffer) {
  const meta = await sharp(png).metadata();
  return { format: meta.format, width: meta.width, height: meta.height };
}

describe("per-affiliate web manifest", () => {
  it("names, scopes, and colors the install after the store", () => {
    const manifest = buildAffiliateWebManifest(reaves);
    expect(manifest).toMatchObject({
      id: "/store/reaves-way-cabinet-shop/",
      name: "Reaves Way Cabinet Shop",
      short_name: "Reaves Way Cabinet Shop",
      description: "Cabinets designed for your home",
      start_url: "/store/reaves-way-cabinet-shop/",
      scope: "/store/reaves-way-cabinet-shop/",
      display: "standalone",
      theme_color: "#225577",
      background_color: "#f8f4ee",
    });
    expect(manifest.icons).toEqual([
      { src: "/store/reaves-way-cabinet-shop/app-icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/store/reaves-way-cabinet-shop/app-icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    ]);
    expect(JSON.stringify(manifest)).not.toMatch(/cabinet ?dealz/i);
  });

  it("falls back to neutral colors and name when the store has none", () => {
    const manifest = buildAffiliateWebManifest({ slug: "plain", primaryColor: "navy", backgroundColor: null });
    expect(manifest.name).toBe("Kitchen & Bath Store");
    expect(manifest.theme_color).toBe("#1a2b4a");
    expect(manifest.background_color).toBe("#ffffff");
    expect(manifest).not.toHaveProperty("description");
  });

  it("builds store-scoped paths", () => {
    expect(affiliateManifestPath("oak")).toBe("/store/oak/manifest.webmanifest");
    expect(affiliateAppIconPath("oak", 180)).toBe("/store/oak/app-icon-180.png");
  });
});

describe("home-screen icons", () => {
  it("draws a letter-on-color PNG from embedded outlines when there is no usable image", async () => {
    const svg = letterIconSvg("reaves way", "#225577", 512);
    expect(svg).toContain('fill="#225577"');
    expect(svg).toContain("<path");
    expect(svg).not.toContain("<text");
    for (const size of [180, 192, 512] as const) {
      const png = await renderAffiliateAppIcon(reaves, size, async () => null);
      expect(await pngInfo(png)).toEqual({ format: "png", width: size, height: size });
    }
    const { data } = await sharp(await renderAffiliateAppIcon(reaves, 192, async () => null)).raw().toBuffer({ resolveWithObject: true });
    expect([data[0], data[1], data[2]]).toEqual([0x22, 0x55, 0x77]);
  });

  it("prefers the favicon, then the logo, and squares a wide logo onto an opaque background", async () => {
    const wideLogo = await sharp({ create: { width: 600, height: 150, channels: 4, background: { r: 200, g: 0, b: 0, alpha: 1 } } }).png().toBuffer();
    const seen: Array<string | null | undefined> = [];
    const png = await renderAffiliateAppIcon(
      { ...reaves, faviconUrl: "/manus-storage/affiliate-favicon/x.svg", logoUrl: "/manus-storage/affiliate-logo/x.png" },
      512,
      async (url) => {
        seen.push(url);
        return url?.endsWith(".png") ? wideLogo : null;
      },
    );
    expect(seen).toEqual(["/manus-storage/affiliate-favicon/x.svg", "/manus-storage/affiliate-logo/x.png"]);
    const meta = await sharp(png).metadata();
    expect([meta.format, meta.width, meta.height, meta.hasAlpha]).toEqual(["png", 512, 512, false]);
  });

  it("only reads uploaded raster files from platform storage", () => {
    expect(storageKeyForBrandImage("/manus-storage/affiliate-logo/a_1.png")).toBe("affiliate-logo/a_1.png");
    expect(storageKeyForBrandImage("/manus-storage/affiliate-favicon/a.svg")).toBeNull();
    expect(storageKeyForBrandImage("https://example.com/logo.png")).toBeNull();
    expect(storageKeyForBrandImage("/manus-storage/../secret.png")).toBeNull();
    expect(storageKeyForBrandImage(null)).toBeNull();
  });
});

describe("home-screen routes", () => {
  let base = "";
  let close: () => void = () => undefined;

  beforeAll(async () => {
    const app = express();
    registerAffiliateHomeScreenRoutes(app, async (slug) => (slug === reaves.slug ? reaves : null));
    app.get("/_shell/*", (_req, res) => res.type("html").send("<html>shell</html>"));
    const server = app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server.once("listening", () => resolve()));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    close = () => server.close();
  });
  afterAll(() => close());

  it("serves the manifest on the direct and Vercel-forwarded paths before the page shell", async () => {
    for (const path of ["/store/reaves-way-cabinet-shop/manifest.webmanifest", "/_shell/store/reaves-way-cabinet-shop/manifest.webmanifest"]) {
      const response = await fetch(`${base}${path}`);
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("application/manifest+json");
      expect((await response.json()).name).toBe("Reaves Way Cabinet Shop");
    }
  });

  it("serves PNG icons and rejects unknown sizes and stores", async () => {
    const icon = await fetch(`${base}/_shell/store/reaves-way-cabinet-shop/app-icon-192.png`);
    expect(icon.status).toBe(200);
    expect(icon.headers.get("content-type")).toBe("image/png");
    expect(await pngInfo(Buffer.from(await icon.arrayBuffer()))).toEqual({ format: "png", width: 192, height: 192 });
    expect((await fetch(`${base}/store/reaves-way-cabinet-shop/app-icon-64.png`)).status).toBe(404);
    expect((await fetch(`${base}/store/nobody/manifest.webmanifest`)).status).toBe(404);
    expect((await fetch(`${base}/_shell/store/nobody/app-icon-512.png`)).status).toBe(404);
  });
});
