import { describe, expect, it } from "vitest";
import { catalogPublicCopy } from "./catalogPublicDescription";
import {
  resolveEditableProductDescription,
  resolveProductPageDescription,
} from "./productPageDescription";

const OWN = "Cabinetdealz three-drawer base, soft-close, 24 inch";
const MASTER = "Master base cabinet 24 inch";
const SUPPLIER = '24" W × 34.75" H × 24" D Two Drawer Base with One Inner Drawer. AltaEuro / U.S. Cabinet Depot Frameless Collection Full Spec Book V8.2, p. 21.';
const CODE = "3DB24";

describe("product page description precedence", () => {
  it("shows Cabinetdealz's distributor description ahead of the master, supplier, and code", () => {
    const supplier = SUPPLIER;
    const chosen = resolveProductPageDescription({
      distributorDescription: `  ${OWN}  `,
      masterDescription: MASTER,
      supplierDescription: supplier,
      masterCode: CODE,
    });

    expect(chosen).toBe(OWN);
    expect(supplier).toBe(SUPPLIER);
    const copy = catalogPublicCopy(chosen, CODE);
    expect(copy.title).toBe("Cabinetdealz three-drawer base Cabinet, soft-close, 24 inch");
    expect(copy.description).toContain("Cabinetdealz three-drawer base");
    expect(copy.description).not.toMatch(/altaeuro|spec book|two drawer base with one inner drawer/i);
  });

  it("uses the master description when the selected distributor has no Cabinetdealz copy", () => {
    for (const distributorDescription of [undefined, null, "", "   "]) {
      expect(resolveProductPageDescription({
        distributorDescription,
        masterDescription: MASTER,
        supplierDescription: SUPPLIER,
        masterCode: CODE,
      })).toBe(MASTER);
    }
  });

  it("uses the supplier description only after our copy and the master are blank", () => {
    expect(resolveProductPageDescription({
      distributorDescription: null,
      masterDescription: "  ",
      supplierDescription: SUPPLIER,
      masterCode: CODE,
    })).toBe(SUPPLIER);
  });

  it("uses the master code when every description is blank", () => {
    expect(resolveProductPageDescription({
      distributorDescription: null,
      masterDescription: null,
      supplierDescription: " \n ",
      masterCode: ` ${CODE} `,
    })).toBe(CODE);
  });

  it("returns an empty string when nothing is available", () => {
    expect(resolveProductPageDescription({})).toBe("");
  });

  it("reopens the editor on the saved Cabinetdealz text, not the supplier source", () => {
    expect(resolveEditableProductDescription({
      distributorDescription: OWN,
      masterDescription: MASTER,
    })).toBe(OWN);
    expect(resolveEditableProductDescription({
      distributorDescription: "  ",
      masterDescription: MASTER,
    })).toBe(MASTER);
    expect(resolveEditableProductDescription({
      distributorDescription: null,
      masterDescription: null,
    })).toBe("");
  });

  it("keeps SEO derivation on the chosen text when the supplier description would otherwise win", () => {
    const chosen = resolveProductPageDescription({
      distributorDescription: 'Sink Base Cabinet - 30"W x 34-1/2"H x 24"D - 2 Doors - 1 False Drawer Faces',
      masterDescription: MASTER,
      supplierDescription: SUPPLIER,
      masterCode: CODE,
    });
    expect(catalogPublicCopy(chosen, CODE)).toEqual({
      title: "Sink Base Cabinet - 2 Doors - 1 False Drawer Faces",
      description: "Sink Base Cabinet - 2 Doors - 1 False Drawer Faces. Dimensions: 30\" W × 34-1/2\" H × 24\" D.",
    });
  });
});
