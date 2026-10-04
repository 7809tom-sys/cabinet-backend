import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { planMasterTracTower, defaultTowerConfig } from "@/lib/masterTracTower";
import type { RoomData } from "@/lib/design";
import { MasterTracCornerElevation, masterTracCornerAssembly } from "./MasterTracCornerViews";

const room: RoomData = { width: 144, depth: 120, ceilingHeight: 96 };

describe("Closet-only illustrative MasterTrac corner views", () => {
  for (const side of ["start", "end"] as const) {
    it(`renders ${side} corner plus two bays in a measured SKU box with no kitchen geometry`, () => {
      const config = { ...defaultTowerConfig("Spiced Mahogany"), corner: side };
      const result = planMasterTracTower(config, room, "top", side === "start" ? 0 : 64.25, []);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const root = masterTracCornerAssembly(result.plan.boards)!;
      const corner = root.children.find((object) => object.userData.masterTracCorner) as THREE.Group;
      expect(corner.userData.masterTracCorner).toMatchObject({ sku: "432786", finish: "Spiced Mahogany", side, widthIn: 29.5, depthIn: 29.5, illustrative: true });
      const bounds = new THREE.Box3().setFromObject(corner);
      const size = new THREE.Vector3();
      bounds.getSize(size);
      expect(size.x * 12).toBeCloseTo(29.5);
      expect(size.z * 12).toBeCloseTo(29.5);
      expect(size.y * 12).toBeCloseTo(0.75);
      expect(root.children.filter((object) => object.userData.masterTracCorner)).toHaveLength(1);
      expect(root.children.filter((object) => object.userData.masterTracStraightBoard)).toHaveLength(11);
      expect(root.children.every((object) => !object.userData.toeKickHeightIn && !object.userData.countertop)).toBe(true);
      const markup = renderToStaticMarkup(createElement(MasterTracCornerElevation, { placed: result.plan.boards, wall: "top", onEdit: () => {} }));
      expect(markup).toContain('data-testid="mastertrac-corner-elevation"');
      expect(markup).toContain('data-testid="mastertrac-corner-elevation-shelf"');
      expect(markup).toContain('432786');
      expect(markup).toContain('433176');
      expect(markup).toContain('illustrative, not installation geometry');
    });
  }
});
