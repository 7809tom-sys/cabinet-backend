import { and, eq, inArray } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { distributors, doorStyles } from "../drizzle/schema";
import { getDb } from "./db";

const CLEAN_SWATCHES = {
  SSM: { finish: "Syncron Select", imageUrl: "/manus-storage/aef-syncron-ssm-clean-swatch_8665105d.png" }, SSO: { finish: "Syncron Select", imageUrl: "/manus-storage/aef-syncron-sso-clean-swatch_734057fd.png" }, SSH: { finish: "Syncron Select", imageUrl: "/manus-storage/aef-syncron-ssh-clean-swatch_e07f22f8.png" }, SSR: { finish: "Syncron Select", imageUrl: "/manus-storage/aef-syncron-ssr-clean-swatch_9ad18bf7.png" }, SSV: { finish: "Syncron Select", imageUrl: "/manus-storage/aef-syncron-ssv-clean-swatch_187be4fd.png" },
  SSJ: { finish: "Syncron Select", imageUrl: "/manus-storage/aef-syncron-ssj-clean-swatch_912f2be6.png" }, SSP: { finish: "Syncron Select", imageUrl: "/manus-storage/aef-syncron-ssp-clean-swatch_8bd6ff89.png" }, SSQ: { finish: "Syncron Select", imageUrl: "/manus-storage/aef-syncron-ssq-clean-swatch_83b1016c.png" }, SSN: { finish: "Syncron Select", imageUrl: "/manus-storage/aef-syncron-ssn-clean-swatch_5536b021.png" }, SSA: { finish: "Syncron Select", imageUrl: "/manus-storage/aef-syncron-ssa-clean-swatch_85e088a5.png" }, SSD: { finish: "Syncron Select", imageUrl: "/manus-storage/aef-syncron-ssd-clean-swatch_2588c244.png" }, SSZ: { finish: "Syncron Select", imageUrl: "/manus-storage/aef-syncron-ssz-clean-swatch_5649dac0.png" },
  SSK: { finish: "Syncron Select", imageUrl: "/manus-storage/aef-syncron-ssk-clean-swatch_15ffb3fb.png" }, SSE: { finish: "Syncron Select", imageUrl: "/manus-storage/aef-syncron-sse-clean-swatch_84b82286.png" }, SSS: { finish: "Syncron Select", imageUrl: "/manus-storage/aef-syncron-sss-clean-swatch_a34e03c2.png" }, SSL: { finish: "Syncron Select", imageUrl: "/manus-storage/aef-syncron-ssl-clean-swatch_118bfeb1.png" }, SSX: { finish: "Syncron Select", imageUrl: "/manus-storage/aef-syncron-ssx-clean-swatch_f8f0c367.png" },
  SCM: { finish: "Syncron Slim Cava", imageUrl: "/manus-storage/aef-syncron-scm-clean-swatch_66df202b.png" }, SCR: { finish: "Syncron Slim Cava", imageUrl: "/manus-storage/aef-syncron-scr-clean-swatch_3a780919.png" }, SCN: { finish: "Syncron Slim Cava", imageUrl: "/manus-storage/aef-syncron-scn-clean-swatch_20158e92.png" }, SCQ: { finish: "Syncron Slim Cava", imageUrl: "/manus-storage/aef-syncron-scq-clean-swatch_23c9fc55.png" }, SCA: { finish: "Syncron Slim Cava", imageUrl: "/manus-storage/aef-syncron-sca-clean-swatch_1e00ca8f.png" }, SCZ: { finish: "Syncron Slim Cava", imageUrl: "/manus-storage/aef-syncron-scz-clean-swatch_2c89c79e.png" }, SCL: { finish: "Syncron Slim Cava", imageUrl: "/manus-storage/aef-syncron-scl-clean-swatch_18b6fd64.png" },
} as const;
const CODES = Object.keys(CLEAN_SWATCHES) as Array<keyof typeof CLEAN_SWATCHES>;

describe("AEF Syncron clean door swatches", () => {
  it("preserves exact Select and Slim Cava clean source-door samples for all 24 official product-key codes", async () => {
    const db = await getDb();
    if (!db) return;
    const [aef] = await db.select({ id: distributors.id }).from(distributors).where(eq(distributors.code, "AEF")).limit(1);
    expect(aef).toBeDefined();
    const rows = await db.select({ styleCode: doorStyles.styleCode, finish: doorStyles.finish, active: doorStyles.isActive, verified: doorStyles.doorSampleVerified, door: doorStyles.doorSampleImageUrl, drawer: doorStyles.drawerSampleImageUrl, thumbnail: doorStyles.thumbnailImageUrl, roomScene: doorStyles.roomSceneImageUrl }).from(doorStyles).where(and(eq(doorStyles.distributorId, aef!.id), inArray(doorStyles.styleCode, CODES)));
    expect(rows).toHaveLength(CODES.length);
    expect(rows.filter((row) => row.finish === "Syncron Select")).toHaveLength(17);
    expect(rows.filter((row) => row.finish === "Syncron Slim Cava")).toHaveLength(7);
    for (const row of rows) {
      const expected = CLEAN_SWATCHES[row.styleCode as keyof typeof CLEAN_SWATCHES];
      expect(row).toMatchObject({ finish: expected.finish, active: true, verified: true, door: expected.imageUrl, drawer: expected.imageUrl, thumbnail: expected.imageUrl });
    }
    expect(rows.find((row) => row.styleCode === "SCA")?.roomScene).toBeNull();
  });
});
