import { describe, expect, it } from "vitest";
import { countertopOrderLines, countertopPlanForOrder, designerPlanForDesign, isCountertopOrderLine } from "./countertopQuoteIntake";
import type { OrderLineItem } from "../../drizzle/schema";

function line(overrides: Partial<OrderLineItem>): OrderLineItem {
  return {
    cabinetId: 1,
    masterCode: "PL-WHT-3CM",
    rawCode: null,
    description: "Pure White 3cm Quartz Slab",
    qty: 2,
    unitPrice: 650,
    linePrice: 1300,
    doorStyle: null,
    styleId: null,
    distributorId: null,
    productKind: "surface",
    category: "Quartz Slabs (Countertops)",
    pelicanProductId: 10,
    vendorProductId: null,
    tier: "Homeowner",
    matched: true,
    ...overrides,
  } as OrderLineItem;
}

const cabinet: OrderLineItem = line({
  cabinetId: 2,
  masterCode: "B36",
  description: '36" Base Cabinet',
  qty: 3,
  unitPrice: 210,
  linePrice: 630,
  productKind: null,
  category: "Base Cabinets",
  pelicanProductId: null,
});

describe("countertop order intake", () => {
  it("recognises a countertop line and only a countertop line", () => {
    expect(isCountertopOrderLine(line({}))).toBe(true);
    expect(isCountertopOrderLine(cabinet)).toBe(false);
    // A surface line that is not a countertop (a sink) is not a quote trigger.
    expect(isCountertopOrderLine(line({ masterCode: "SINK-1", description: "Stainless sink", category: "Kitchen Sinks" }))).toBe(false);
  });

  it("builds the countertop plan from the ordered surface lines", () => {
    const plan = countertopPlanForOrder({
      orderRequestId: 77,
      requestNumber: "CD-77",
      lines: [cabinet, line({})],
      notes: "L-shaped top",
    });
    expect(plan).not.toBeNull();
    expect(plan!.planId).toBe("order:77");
    expect(plan!.materialSku).toBe("PL-WHT-3CM");
    expect(plan!.materialName).toBe("Pure White 3cm Quartz Slab");
    expect(plan!.lines).toHaveLength(1);
    expect(plan!.lines[0]).toMatchObject({ quantity: 2, unitPrice: 650, lineTotal: 1300 });
    expect(plan!.slabCount).toBe(2);
    expect(plan!.truckloadCapacity).toBe(40);
    expect(plan!.truckloads).toBe(1);
    expect(plan!.notes).toBe("L-shaped top");
  });

  it("splits a large job across truckloads of 40 slabs", () => {
    const plan = countertopPlanForOrder({
      orderRequestId: 79,
      requestNumber: "CD-79",
      lines: [line({ qty: 45 })],
    })!;
    expect(plan.slabCount).toBe(45);
    expect(plan.truckloads).toBe(2);
  });

  it("returns null when the order has no countertop", () => {
    expect(countertopPlanForOrder({ orderRequestId: 78, requestNumber: "CD-78", lines: [cabinet] })).toBeNull();
    expect(countertopOrderLines([cabinet])).toEqual([]);
  });

  it("snapshots the saved 3D designer plan with both the room and the layout", () => {
    const design = {
      id: 501,
      name: "Maple L",
      roomType: "kitchen",
      roomData: { width: 144, depth: 120, ceilingHeight: 96 },
      placedCabinets: [{ cabinetId: 1, x: 0, y: 0 }],
      selectedSurfaces: [{ role: "countertop", productId: 10 }],
      selectedStyleId: 12,
      updatedAt: new Date("2026-11-28T12:00:00.000Z"),
    } as never;
    const plan = designerPlanForDesign(design)!;
    expect(plan.designId).toBe("501");
    expect(plan.designName).toBe("Maple L");
    expect(plan.layoutType).toBe("kitchen");
    expect(plan.roomDimensionsIn).toMatchObject({ width: 144 });
    expect(plan.sceneSnapshot.placedCabinets).toHaveLength(1);
    expect(plan.sceneSnapshot.selectedSurfaces).toHaveLength(1);
    expect(plan.sceneSnapshot.styleId).toBe(12);
    expect(plan.planExportUrl).toBeNull();
    expect(plan.updatedAt).toBe("2026-11-28T12:00:00.000Z");
    expect(designerPlanForDesign(null)).toBeNull();
  });
});
