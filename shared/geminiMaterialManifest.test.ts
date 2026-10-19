import { describe, expect, it } from "vitest";
import {
  GEMINI_MATERIAL_MANIFEST_PROVENANCE_MAX,
  GEMINI_MATERIAL_MANIFEST_WIRE_VERSION,
  hasCurrentGeminiMaterialManifestWireVersion,
  serializeGeminiImageTestProvenanceForWire,
  serializeGeminiMaterialManifestForWire,
} from "./geminiMaterialManifest";

describe("Gemini material manifest wire serialization", () => {
  it("compacts every schema-bound provenance field while retaining full cabinet, flooring, and hardware source evidence", () => {
    const longSourceUrl = `https://www.cabinetdealz.com/manus-storage/${"deep-source-path/".repeat(24)}exact-selected-swatch.webp`;
    const longProvenance = `Imported supplier evidence: ${longSourceUrl}; ${"verified source metadata ".repeat(30)}`;
    const manifest = serializeGeminiMaterialManifestForWire([
      {
        id: "cabinet:perimeter:preston-aero-blanc",
        role: "cabinet door/finish",
        label: "Preston Aero Blanc Shaker",
        itemIds: ["cabinet:wall-1", "cabinet:island-2"],
        referenceUrl: longSourceUrl,
        referenceSource: "catalog-image" as const,
        provenance: longProvenance,
        provenanceDetails: longProvenance,
      },
      {
        id: "cabinet:island:midnight-ink",
        role: "cabinet door/finish",
        label: "Midnight Ink Shaker",
        itemIds: ["cabinet:island-3"],
        referenceUrl: longSourceUrl,
        referenceSource: "catalog-image" as const,
        provenance: longProvenance,
      },
      {
        id: "surface:flooring:harbor-oak-20mil",
        role: "flooring",
        label: "Harbor Oak 20mil Flooring",
        itemIds: ["surface:flooring"],
        referenceUrl: longSourceUrl,
        referenceSource: "catalog-image" as const,
        provenance: longProvenance,
      },
      {
        id: "hardware:handles:brushed-gold-bar-pull",
        role: "hardware/handles",
        label: "Brushed Gold Bar Pull",
        itemIds: ["cabinet:wall-1", "cabinet:island-2", "cabinet:island-3"],
        referenceUrl: longSourceUrl,
        referenceSource: "catalog-image" as const,
        provenance: longProvenance,
      },
    ]);

    expect(manifest).toHaveLength(4);
    expect(manifest.every((entry) => entry.provenance.length <= GEMINI_MATERIAL_MANIFEST_PROVENANCE_MAX)).toBe(true);
    expect(manifest.map((entry) => entry.provenance)).toEqual([
      "source:catalog-image;ref:cabinet:perimeter:preston-aero-blanc;cat:cabinet-door-finish",
      "source:catalog-image;ref:cabinet:island:midnight-ink;cat:cabinet-door-finish",
      "source:catalog-image;ref:surface:flooring:harbor-oak-20mil;cat:flooring",
      "source:catalog-image;ref:hardware:handles:brushed-gold-bar-pull;cat:hardware-handles",
    ]);
    for (const [index, entry] of manifest.entries()) {
      expect(entry.id).toContain(["preston", "midnight", "flooring", "hardware"][index]!);
      expect(entry.itemIds.length).toBeGreaterThan(0);
      expect(entry.provenanceDetails).toContain(longSourceUrl);
      expect(entry.provenanceDetails).toContain(longProvenance);
    }
  });

  it("uses a deterministic hashed compact reference when an old entry ID exceeds the wire budget without changing the actual ID", () => {
    const id = `cabinet:${"legacy-long-id-".repeat(30)}a`;
    const first = serializeGeminiMaterialManifestForWire([{
      id,
      role: "cabinet door/finish",
      label: "Long legacy cabinet identity",
      itemIds: ["cabinet:1"],
      referenceUrl: "https://www.cabinetdealz.com/manus-storage/exact.jpg",
      referenceSource: "catalog-image" as const,
      provenance: `cabinet door/finish: ${id}`,
    }])[0]!;
    const second = serializeGeminiMaterialManifestForWire([{ ...first, provenance: "some stale client provenance" }])[0]!;

    expect(first.id).toBe(id);
    expect(first.provenance).toContain("~");
    expect(first.provenance.length).toBeLessThanOrEqual(GEMINI_MATERIAL_MANIFEST_PROVENANCE_MAX);
    expect(second.provenance).toBe(first.provenance);
    expect(first.provenanceDetails).toContain(id);
  });

  it("recognizes the compact wire version so earlier invalid payload jobs can never reopen as current", () => {
    expect(hasCurrentGeminiMaterialManifestWireVersion({ materialManifestWireVersion: GEMINI_MATERIAL_MANIFEST_WIRE_VERSION })).toBe(true);
    expect(hasCurrentGeminiMaterialManifestWireVersion({ materialManifestWireVersion: "legacy-long-provenance-v1" })).toBe(false);
    expect(hasCurrentGeminiMaterialManifestWireVersion({})).toBe(false);
    expect(hasCurrentGeminiMaterialManifestWireVersion(null)).toBe(false);
  });

  it("produces a JSON-safe final Google test request with no oversized provenance values", () => {
    const longProvenance = `https://www.cabinetdealz.com/manus-storage/${"complete-source-evidence/".repeat(30)}exact.webp`;
    const provenance = serializeGeminiImageTestProvenanceForWire({
      contractVersion: "exact-plan-v1" as const,
      materialManifest: [
        { id: "cabinet:one", role: "cabinet door/finish", label: "Preston Aero Blanc", itemIds: ["b24"], referenceUrl: longProvenance, referenceSource: "catalog-image" as const, provenance: longProvenance },
        { id: "surface:flooring", role: "flooring", label: "Harbor Oak", itemIds: ["surface:flooring"], referenceUrl: longProvenance, referenceSource: "catalog-image" as const, provenance: longProvenance },
        { id: "hardware:handles", role: "hardware/handles", label: "Brushed Gold Bar Pull", itemIds: ["b24"], referenceUrl: longProvenance, referenceSource: "catalog-image" as const, provenance: longProvenance },
      ],
    });
    const requestBody = JSON.parse(JSON.stringify({
      sceneSignature: "a".repeat(64) + "-gemini-test-v2",
      sceneImageDataUrl: "data:image/jpeg;base64,locked-reference",
      provenance,
      restartPending: false,
    }));

    expect(requestBody.provenance.materialManifestWireVersion).toBe(GEMINI_MATERIAL_MANIFEST_WIRE_VERSION);
    expect(requestBody.provenance.materialManifest.map((entry: { provenance: string }) => entry.provenance.length)).toEqual([60, 54, 62]);
    expect(requestBody.provenance.materialManifest.every((entry: { provenance: string }) => entry.provenance.length <= 160)).toBe(true);
    expect(requestBody.provenance.materialManifest.every((entry: { provenanceDetails: string }) => entry.provenanceDetails.includes(longProvenance))).toBe(true);
  });
});
