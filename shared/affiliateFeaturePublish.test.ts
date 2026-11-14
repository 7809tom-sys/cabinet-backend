import { describe, expect, it } from "vitest";
import {
  AFFILIATE_FEATURE_KEYS,
  AFFILIATE_PUBLISH_WRITE_KEYS,
  GLOBAL_SUBJECT_ID,
  GLOBAL_SUBJECT_KIND,
  SUBJECT_KILL_FEATURE_KEY,
  isOffEverywhere,
  isSubjectShutOff,
  catalogFeatureKey,
  decideAffiliateFeatureRead,
  publishFlagOn,
  type PublishFlag,
} from "./affiliateFeaturePublish";

const row = (patch: Partial<PublishFlag> & Pick<PublishFlag, "subjectKind" | "subjectId" | "featureKey" | "published">): PublishFlag => patch;

describe("the admin shut-off switches", () => {
  it("a distributor all row stored as 0 turns every feature off", () => {
    const rows: PublishFlag[] = [
      row({ subjectKind: "distributor", subjectId: 270001, featureKey: "kitchen_designer", published: true }),
      row({ subjectKind: "distributor", subjectId: 270001, featureKey: SUBJECT_KILL_FEATURE_KEY, published: false }),
    ];
    expect(publishFlagOn(rows, { kind: "distributor", id: 270001 }, ["kitchen_designer"])).toBe(false);
    expect(isSubjectShutOff(rows, { kind: "distributor", id: 270001 })).toBe(true);
  });

  it("the global row stored as 0 turns that feature off everywhere", () => {
    const rows: PublishFlag[] = [
      row({ subjectKind: "distributor", subjectId: 270001, featureKey: "kitchen_designer", published: true }),
      row({ subjectKind: GLOBAL_SUBJECT_KIND, subjectId: GLOBAL_SUBJECT_ID, featureKey: "kitchen_designer", published: false }),
    ];
    expect(publishFlagOn(rows, { kind: "distributor", id: 270001 }, ["kitchen_designer"])).toBe(false);
    expect(isOffEverywhere(rows, "kitchen_designer")).toBe(true);
    expect(isOffEverywhere(rows, "quote")).toBe(false);
  });

  it("accepts the two switch keys the admin writes and still rejects a typo", () => {
    expect(AFFILIATE_PUBLISH_WRITE_KEYS).toContain(SUBJECT_KILL_FEATURE_KEY);
    expect(AFFILIATE_PUBLISH_WRITE_KEYS).toContain("kitchen_designer");
    expect((AFFILIATE_PUBLISH_WRITE_KEYS as readonly string[]).includes("kitchen_cabinets")).toBe(false);
  });
});

describe("affiliate feature publish decision", () => {
  it("lists the feature keys the Publish tab saves", () => {
    expect(AFFILIATE_FEATURE_KEYS).toEqual([
      "kitchen_designer",
      "bathroom_builder",
      "laundry_builder",
      "closet_builder",
      "closet_studio",
      "other_room_designer",
      "cabinet_catalog",
      "pelican_catalog",
      "hardware_catalog",
      "closet_catalog",
      "kitchen_packages",
      "samples",
      "promotions",
      "image_cabinet",
      "installation_estimates",
      "quote",
    ]);
    expect(catalogFeatureKey("surface")).toBe("pelican_catalog");
    expect(catalogFeatureKey("cabinet")).toBe("cabinet_catalog");
  });

  it("treats a missing row and an explicit off switch as unpublished", () => {
    const rows = [row({ subjectKind: "distributor", subjectId: 4, featureKey: "kitchen_designer", published: false })];
    expect(publishFlagOn(rows, { kind: "distributor", id: 4 }, ["kitchen_designer"])).toBe(false);
    expect(publishFlagOn([], { kind: "distributor", id: 4 }, ["kitchen_designer"])).toBe(false);
  });

  it("does not block an administrator or a house read", () => {
    const blocked = {
      affiliateId: 7,
      featureKeys: ["quote"],
      carriedDistributorIds: [4],
      vendorIdsWithoutLine: [],
      rows: [],
    };
    expect(decideAffiliateFeatureRead({ ...blocked, role: "admin" }).allowed).toBe(true);
    expect(decideAffiliateFeatureRead({ ...blocked, affiliateId: null }).allowed).toBe(true);
  });

  it("blocks an affiliate when no carried subject has the feature on", () => {
    expect(decideAffiliateFeatureRead({
      affiliateId: 7,
      featureKeys: ["samples"],
      carriedDistributorIds: [4],
      vendorIdsWithoutLine: [2],
      rows: [row({ subjectKind: "distributor", subjectId: 9, featureKey: "samples", published: true })],
    }).allowed).toBe(false);
  });

  it("checks cabinet catalog against that distributor id", () => {
    const rows = [row({ subjectKind: "distributor", subjectId: 4, featureKey: "cabinet_catalog", published: true })];
    const base = {
      affiliateId: 7,
      featureKeys: ["cabinet_catalog"],
      carriedDistributorIds: [4, 9],
      vendorIdsWithoutLine: [],
      rows,
    };
    expect(decideAffiliateFeatureRead({ ...base, distributorId: 4 }).allowed).toBe(true);
    expect(decideAffiliateFeatureRead({ ...base, distributorId: 9 }).allowed).toBe(false);
    expect(decideAffiliateFeatureRead({ ...base, distributorId: 4, carriedDistributorIds: [9] }).allowed).toBe(false);
  });

  it("does not let a vendor row publish the cabinet catalog", () => {
    expect(decideAffiliateFeatureRead({
      affiliateId: 7,
      featureKeys: ["cabinet_catalog"],
      carriedDistributorIds: [4],
      vendorIdsWithoutLine: [2],
      includeVendorsWithoutLine: false,
      rows: [row({ subjectKind: "vendor", subjectId: 2, featureKey: "cabinet_catalog", published: true })],
    }).allowed).toBe(false);
  });

  it("opens a feature for every affiliate when a vendor with no distributor line publishes it", () => {
    expect(decideAffiliateFeatureRead({
      affiliateId: 7,
      featureKeys: ["pelican_catalog"],
      carriedDistributorIds: [4],
      vendorIdsWithoutLine: [2],
      rows: [row({ subjectKind: "vendor", subjectId: 2, featureKey: "pelican_catalog", published: true })],
    }).allowed).toBe(true);
  });

  it("accepts any designer room feature when the palette is not pinned to one room", () => {
    expect(decideAffiliateFeatureRead({
      affiliateId: 7,
      featureKeys: ["kitchen_designer", "bathroom_builder"],
      carriedDistributorIds: [4],
      vendorIdsWithoutLine: [],
      rows: [row({ subjectKind: "distributor", subjectId: 4, featureKey: "bathroom_builder", published: true })],
    }).allowed).toBe(true);
  });
});
