import { describe, expect, it } from "vitest";
import {
  auditPelicanDesignerReadiness,
  hasApprovedPelicanMaterialSwatch,
  hasVerifiedPelicanFixtureProfile,
  isPelicanDesignerReady,
  isPelicanDesignerSelectable,
  pelicanDesignerReadinessReason,
  pelicanDesignerRenderFlags,
  pelicanDesignerRole,
} from "./pelicanDesignerReadiness";

describe("Pelican Designer readiness policy", () => {
  it("selects a flooring plank without a swatch and keeps exact 3D rendering strict", () => {
    const readyFloor = {
      category: "Flooring",
      subCategory: "Planks & Flooring",
      pelicanCode: "PL-FLOOR-EXAMPLE",
      materialImageUrl: "/manus-storage/approved-floor-swatch.webp",
    };
    const catalogPhotoOnly = { ...readyFloor, materialImageUrl: null };
    const blankSwatch = { ...readyFloor, materialImageUrl: "  " };

    expect(pelicanDesignerRole(readyFloor)).toBe("flooring");
    expect(hasApprovedPelicanMaterialSwatch(readyFloor)).toBe(true);
    expect(isPelicanDesignerReady(readyFloor)).toBe(true);
    expect(isPelicanDesignerSelectable(readyFloor)).toBe(true);
    expect(pelicanDesignerRenderFlags(readyFloor)).toEqual({ designerRenderReady: true, hasSwatch: true });

    expect(isPelicanDesignerReady(catalogPhotoOnly)).toBe(false);
    expect(isPelicanDesignerSelectable(catalogPhotoOnly)).toBe(true);
    expect(pelicanDesignerRenderFlags(catalogPhotoOnly)).toEqual({ designerRenderReady: false, hasSwatch: false });
    expect(pelicanDesignerRenderFlags(blankSwatch)).toEqual({ designerRenderReady: false, hasSwatch: false });
    expect(pelicanDesignerReadinessReason(catalogPhotoOnly)).toBe("Approved repeatable material swatch required");
  });

  it("does not let moldings, underlayment, or swatch-less tile into the Designer palette", () => {
    const molding = { category: "Flooring", subCategory: "Moldings & Trim", materialImageUrl: "/swatch.webp" };
    const underlayment = { category: "Flooring", subCategory: "Underlayment", materialImageUrl: null };
    const tileWithoutSwatch = { category: "Tile & Mosaic", subCategory: "Mosaic", materialImageUrl: null };

    expect(pelicanDesignerRole(molding)).toBeNull();
    expect(isPelicanDesignerSelectable(molding)).toBe(false);
    expect(isPelicanDesignerSelectable(underlayment)).toBe(false);
    expect(isPelicanDesignerReady(tileWithoutSwatch)).toBe(false);
    expect(isPelicanDesignerSelectable(tileWithoutSwatch)).toBe(false);
    expect(isPelicanDesignerSelectable({ ...tileWithoutSwatch, materialImageUrl: "/tile.webp" })).toBe(true);
  });

  it("allows a source-priced countertop to be selected and quoted without promoting its catalog photo to a 3D swatch", () => {
    const countertopWithoutSwatch = {
      category: "Quartz Slabs (Countertops)",
      subCategory: "Quartz Slab",
      name: "Apollo 3cm",
      materialImageUrl: null,
    };

    expect(isPelicanDesignerReady(countertopWithoutSwatch)).toBe(false);
    expect(isPelicanDesignerSelectable(countertopWithoutSwatch)).toBe(true);
    expect(pelicanDesignerReadinessReason(countertopWithoutSwatch)).toBe("Approved repeatable material swatch required");
  });

  it("does not convert moldings, range tops, or other catalog categories into unsupported Designer roles", () => {
    expect(isPelicanDesignerReady({ category: "Flooring", subCategory: "Moldings & Trim", materialImageUrl: "/swatch.webp" })).toBe(false);
    expect(isPelicanDesignerReady({ category: "Range Tops", subCategory: "Gas", materialImageUrl: "/range.webp" })).toBe(false);
    expect(pelicanDesignerReadinessReason({ category: "Range Tops", subCategory: "Gas" })).toBe("No exact supported Designer role");
  });

  it("admits a sink or faucet only when its technical profile is exact and verified", () => {
    const sink = { category: "Sinks & Faucets", subCategory: "Sinks", pelicanCode: "PL-HA128 R15 16G" };
    const faucet = { category: "Sinks & Faucets", subCategory: "Faucets", pelicanCode: "PL-8203 BN" };
    const unmeasuredSink = { category: "Sinks & Faucets", subCategory: "Sinks", pelicanCode: "PL-NO-GEOMETRY" };

    expect(hasVerifiedPelicanFixtureProfile(sink)).toBe(true);
    expect(isPelicanDesignerReady(sink)).toBe(true);
    expect(hasVerifiedPelicanFixtureProfile(faucet)).toBe(true);
    expect(isPelicanDesignerReady(faucet)).toBe(true);
    expect(isPelicanDesignerReady(unmeasuredSink)).toBe(false);
    expect(pelicanDesignerReadinessReason(unmeasuredSink)).toBe("Measured technical fixture profile required");
  });

  it("uses PL-8461's verified source identity rather than its stale local Shower & Bath category", () => {
    const wallFaucet = { category: "Shower & Bath", subCategory: "Shower Accessories", pelicanCode: "PL-8461 BN" };
    expect(pelicanDesignerRole(wallFaucet)).toBe("faucet");
    expect(hasVerifiedPelicanFixtureProfile(wallFaucet)).toBe(true);
    expect(isPelicanDesignerReady(wallFaucet)).toBe(true);
  });

  it("keeps a verified PL-8369 wall pot filler out of the Designer until a range-wall mounting workflow records its project-specific datum", () => {
    const potFiller = {
      category: "Sinks & Faucets",
      subCategory: "Faucets",
      pelicanCode: "PL-8369 MB",
      name: "PL-8369 Fountain Series Kitchen Pot Filler — Matte Black",
    };

    expect(pelicanDesignerRole(potFiller)).toBe("pot-filler");
    expect(hasVerifiedPelicanFixtureProfile(potFiller)).toBe(true);
    expect(isPelicanDesignerReady(potFiller)).toBe(false);
    expect(pelicanDesignerReadinessReason(potFiller)).toBe("Range-associated wall-mount workflow and project mounting datum required");
  });

  it("audits every configured row without inventing material, coverage, price, or fixture evidence", () => {
    const audit = auditPelicanDesignerReadiness([
      {
        id: 1,
        category: "Flooring",
        subCategory: "Planks & Flooring",
        pelicanCode: "PL-FLOOR-READY",
        name: "Ready floor",
        isActive: true,
        showInDesigner: true,
        listPrice: "45.00",
        imageUrl: "/catalog/ready-floor.webp",
        materialImageUrl: "/manus-storage/ready-floor-swatch.webp",
        size: '9" x 60"',
        coverageSqFt: "22.1",
      },
      {
        id: 2,
        category: "Quartz Slabs (Countertops)",
        subCategory: "Quartz Slab",
        pelicanCode: "PL-COUNTER-BLOCKED",
        name: "Unverified counter",
        isActive: true,
        showInDesigner: true,
        listPrice: "500.00",
        imageUrl: "/catalog/counter.webp",
        materialImageUrl: null,
        size: '126" x 63"',
        unsupportedOverhangLimitIn: null,
      },
      {
        id: 3,
        category: "Sinks & Faucets",
        subCategory: "Sinks",
        pelicanCode: "PL-HA128 R15 16G",
        name: "Measured sink",
        isActive: true,
        showInDesigner: true,
        yourCost: "275.00",
        imageUrl: "/catalog/sink.webp",
      },
      {
        id: 4,
        category: "Range Tops",
        subCategory: "Gas",
        pelicanCode: "PL-RANGE-NOT-READY",
        name: "Range without geometry",
        isActive: true,
        showInDesigner: true,
        listPrice: "900.00",
        imageUrl: "/catalog/range.webp",
        size: '30" x 24"',
      },
    ]);

    expect(audit.totals).toMatchObject({ configured: 4, paletteReady: 2, unsupportedRole: 1, missingStructuralOverhangLimit: 1 });
    expect(audit.rows.find((row) => row.id === 1)).toMatchObject({ role: "flooring", paletteReady: true, sourceCoverage: true });
    expect(audit.rows.find((row) => row.id === 2)).toMatchObject({ role: "countertop", paletteReady: false, structuralOverhangLimit: false });
    expect(audit.rows.find((row) => row.id === 3)).toMatchObject({ role: "sink", sourceDimensions: true, approvedRepresentation: true, paletteReady: true });
    expect(audit.rows.find((row) => row.id === 4)?.blockers).toContain("No exact supported Designer role");
    expect(audit.blockers.find((blocker) => blocker.reason === "No exact supported Designer role")?.count).toBe(1);
  });

  it("keeps a photo-only flooring plank out of the strict palette audit", () => {
    const audit = auditPelicanDesignerReadiness([
      {
        id: 9,
        category: "Flooring",
        subCategory: "Planks & Flooring",
        pelicanCode: "PL-FLOOR-PHOTO",
        name: "Photo-only plank",
        isActive: true,
        showInDesigner: true,
        listPrice: "45.00",
        imageUrl: "/catalog/photo-only.webp",
        materialImageUrl: null,
        size: '7" x 48"',
        coverageSqFt: "20",
      },
    ]);

    expect(isPelicanDesignerSelectable({ category: "Flooring", subCategory: "Planks & Flooring", materialImageUrl: null })).toBe(true);
    expect(audit.totals).toMatchObject({ configured: 1, paletteReady: 0 });
    expect(audit.rows[0]).toMatchObject({ role: "flooring", paletteReady: false, approvedRepresentation: false, catalogImage: true });
    expect(audit.rows[0]?.blockers).toContain("Approved repeatable material swatch required");
  });
});
