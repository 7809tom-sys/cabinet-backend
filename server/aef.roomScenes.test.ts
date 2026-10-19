import { and, eq, inArray } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { distributors, doorStyles } from "../drizzle/schema";
import { getDb } from "./db";

const ROOM_SCENES = {
  ZSA: { finish: "Zenit Classic", doorStyle: "Slab", imageUrl: "/manus-storage/aef-zsa-room-scene_147b55db.png" },
  ZSB: { finish: "Zenit Classic", doorStyle: "Slab", imageUrl: "/manus-storage/aef-zsb-room-scene_443fec97.png" },
  ZSC: { finish: "Zenit Classic", doorStyle: "Slab", imageUrl: "/manus-storage/aef-zsc-room-scene_2fa2f112.png" },
  ZSI: { finish: "Zenit Classic", doorStyle: "Slab", imageUrl: "/manus-storage/aef-zsi-room-scene_18568983.png" },
  ZSK: { finish: "Zenit Classic", doorStyle: "Slab", imageUrl: "/manus-storage/aef-zsk-room-scene_2c173501.png" },
  ZSL: { finish: "Zenit Classic", doorStyle: "Slab", imageUrl: "/manus-storage/aef-zsl-room-scene_76e94677.png" },
  ZSM: { finish: "Zenit Classic", doorStyle: "Slab", imageUrl: "/manus-storage/aef-zsm-room-scene_5b9a72a0.png" },
  ZSN: { finish: "Zenit Classic", doorStyle: "Slab", imageUrl: "/manus-storage/aef-zsn-room-scene_9d80b0e7.png" },
  ZSO: { finish: "Zenit Classic", doorStyle: "Slab", imageUrl: "/manus-storage/aef-zso-room-scene_17627471.png" },
  ZSP: { finish: "Zenit Classic", doorStyle: "Slab", imageUrl: "/manus-storage/aef-zsp-room-scene_e68914f2.png" },
  ZSU: { finish: "Zenit Classic", doorStyle: "Slab", imageUrl: "/manus-storage/aef-zsu-room-scene_22707259.png" },
  ZSV: { finish: "Zenit Classic", doorStyle: "Slab", imageUrl: "/manus-storage/aef-zsv-room-scene_d042ecd1.png" },
  ZSW: { finish: "Zenit Classic", doorStyle: "Slab", imageUrl: "/manus-storage/aef-zsw-room-scene_4a9dce34.png" },
  LSA: { finish: "Luxe Classic", doorStyle: "Slab", imageUrl: "/manus-storage/aef-lsa-room-scene_f6ab4fd5.png" },
  LSC: { finish: "Luxe Classic", doorStyle: "Slab", imageUrl: "/manus-storage/aef-lsc-room-scene_a6703f0c.png" },
  LSN: { finish: "Luxe Classic", doorStyle: "Slab", imageUrl: "/manus-storage/aef-lsn-room-scene_c24df504.png" },
  LSP: { finish: "Luxe Select", doorStyle: "Slab", imageUrl: "/manus-storage/aef-lsp-room-scene_29ae3f60.png" },
  LSR: { finish: "Luxe Select", doorStyle: "Slab", imageUrl: "/manus-storage/aef-lsr-room-scene_ae7833a1.png" },
  SSA: { finish: "Syncron Select", doorStyle: "Slab", imageUrl: "/manus-storage/aef-ssa-room-scene_b70610d5.png" },
  SSD: { finish: "Syncron Select", doorStyle: "Slab", imageUrl: "/manus-storage/aef-ssd-room-scene_4c16ca91.png" },
  SSE: { finish: "Syncron Select", doorStyle: "Slab", imageUrl: "/manus-storage/aef-sse-room-scene_d289664f.png" },
  SSH: { finish: "Syncron Select", doorStyle: "Slab", imageUrl: "/manus-storage/aef-ssh-room-scene_efe23727.png" },
  SSJ: { finish: "Syncron Select", doorStyle: "Slab", imageUrl: "/manus-storage/aef-ssj-room-scene_757d6242.png" },
  SSK: { finish: "Syncron Select", doorStyle: "Slab", imageUrl: "/manus-storage/aef-ssk-room-scene_12514ac0.png" },
  SSL: { finish: "Syncron Select", doorStyle: "Slab", imageUrl: "/manus-storage/aef-ssl-room-scene_d3528124.png" },
  SSM: { finish: "Syncron Select", doorStyle: "Slab", imageUrl: "/manus-storage/aef-ssm-room-scene_9c2782c0.png" },
  SSN: { finish: "Syncron Select", doorStyle: "Slab", imageUrl: "/manus-storage/aef-ssn-room-scene_6a165890.png" },
  SSO: { finish: "Syncron Select", doorStyle: "Slab", imageUrl: "/manus-storage/aef-sso-room-scene_27f1dfeb.png" },
  SSP: { finish: "Syncron Select", doorStyle: "Slab", imageUrl: "/manus-storage/aef-ssp-room-scene_8c4254c6.png" },
  SSQ: { finish: "Syncron Select", doorStyle: "Slab", imageUrl: "/manus-storage/aef-ssq-room-scene_701a7a5c.png" },
  SSR: { finish: "Syncron Select", doorStyle: "Slab", imageUrl: "/manus-storage/aef-ssr-room-scene_0615e229.png" },
  SSS: { finish: "Syncron Select", doorStyle: "Slab", imageUrl: "/manus-storage/aef-sss-room-scene_21ebe73a.png" },
  SSV: { finish: "Syncron Select", doorStyle: "Slab", imageUrl: "/manus-storage/aef-ssv-room-scene_c642d499.png" },
  SSX: { finish: "Syncron Select", doorStyle: "Slab", imageUrl: "/manus-storage/aef-ssx-room-scene_47ddd5d7.png" },
  SSZ: { finish: "Syncron Select", doorStyle: "Slab", imageUrl: "/manus-storage/aef-ssz-room-scene_aea3d3de.png" },
  SCA: { finish: "Syncron Slim Cava", doorStyle: "Slim Cava", imageUrl: "/manus-storage/aef-sca-room-scene_c748a5a3.png" },
  SCL: { finish: "Syncron Slim Cava", doorStyle: "Slim Cava", imageUrl: "/manus-storage/aef-scl-room-scene_36aeb790.png" },
  SCM: { finish: "Syncron Slim Cava", doorStyle: "Slim Cava", imageUrl: "/manus-storage/aef-scm-room-scene_e624dfed.png" },
  SCN: { finish: "Syncron Slim Cava", doorStyle: "Slim Cava", imageUrl: "/manus-storage/aef-scn-room-scene_3d6befc0.png" },
  SCQ: { finish: "Syncron Slim Cava", doorStyle: "Slim Cava", imageUrl: "/manus-storage/aef-scq-room-scene_3ca17962.png" },
  SCR: { finish: "Syncron Slim Cava", doorStyle: "Slim Cava", imageUrl: "/manus-storage/aef-scr-room-scene_55ff0ba7.png" },
  SCZ: { finish: "Syncron Slim Cava", doorStyle: "Slim Cava", imageUrl: "/manus-storage/aef-scz-room-scene_649634f6.png" },
} as const;
const CODES = Object.keys(ROOM_SCENES) as Array<keyof typeof ROOM_SCENES>;

describe("AEF clean swatch room scenes", () => {
  it("keeps one exact generated room scene and a separate clean door sample for every targeted active finish", async () => {
    const db = await getDb();
    if (!db) return;
    const [aef] = await db.select({ id: distributors.id }).from(distributors).where(eq(distributors.code, "AEF")).limit(1);
    expect(aef).toBeDefined();
    const rows = await db.select({
      styleCode: doorStyles.styleCode,
      finish: doorStyles.finish,
      doorStyle: doorStyles.doorStyle,
      active: doorStyles.isActive,
      verified: doorStyles.doorSampleVerified,
      door: doorStyles.doorSampleImageUrl,
      roomScene: doorStyles.roomSceneImageUrl,
    }).from(doorStyles).where(and(eq(doorStyles.distributorId, aef!.id), inArray(doorStyles.styleCode, CODES)));
    expect(rows).toHaveLength(CODES.length);
    expect(rows.filter((row) => row.finish === "Zenit Classic")).toHaveLength(13);
    expect(rows.filter((row) => row.finish === "Luxe Classic" || row.finish === "Luxe Select")).toHaveLength(5);
    expect(rows.filter((row) => row.finish === "Syncron Select")).toHaveLength(17);
    expect(rows.filter((row) => row.finish === "Syncron Slim Cava")).toHaveLength(7);
    for (const row of rows) {
      const expected = ROOM_SCENES[row.styleCode as keyof typeof ROOM_SCENES];
      expect(row).toMatchObject({
        finish: expected.finish,
        doorStyle: expected.doorStyle,
        active: true,
        verified: true,
        roomScene: expected.imageUrl,
      });
      expect(row.door).toMatch(/^\/manus-storage\/aef-(?:zenit|luxe|syncron)-.+-clean-swatch_/);
      expect(row.roomScene).not.toBe(row.door);
    }
  });
});
