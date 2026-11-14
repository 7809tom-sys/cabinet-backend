/**
 * Sample and colour sync from the manufacturer's catalog (Tom, Nov 13 2026:
 * "milestone is truth").
 *
 * Each Preston style's door photo was whatever had been uploaded, and some of
 * those disagree with the manufacturer (Slim Iron Black read #323232 from ours and
 * #1E1E1C from theirs). When the supplier is the source of truth, the IMAGE has to
 * come from the supplier too, otherwise the colour and the texture disagree.
 *
 * This module fetches the supplier image, measures its colour with the same
 * analyser the swatch tool uses, stores the image, and writes both fields. Run it
 * with dryRun first: it reports what it would change and touches nothing.
 */
import { eq, sql } from "drizzle-orm";
import { doorStyles } from "../../drizzle/schema";
import { analyzeSwatchBuffer, publicSwatchUrl } from "./analyzeSwatchImage";
import { storagePut } from "../storage";

export type SupplierDoorSample = {
  /** Our door_styles id. */
  id: number;
  name: string;
  /** The manufacturer's own door image. */
  imageUrl: string;
};

/**
 * The Milestone catalog door images for the Preston line, by our style id. Kept in
 * code so the sync needs no external config; the measured hex is never trusted
 * from here - it is always measured from the fetched image.
 */
export const MILESTONE_PRESTON_SAMPLES: readonly SupplierDoorSample[] = [
  { id: 390001, name: "Shaker White", imageUrl: "https://shop.milestonecabinetry.com/media/catalog/category/SW-SD-Front_2.jpg" },
  { id: 390002, name: "Shaker Espresso", imageUrl: "https://shop.milestonecabinetry.com/media/catalog/category/SE-SD-Front.jpg" },
  { id: 390003, name: "Navy Blue", imageUrl: "https://shop.milestonecabinetry.com/media/catalog/category/NB-SD-Front_1.jpg" },
  { id: 390004, name: "Aston Green", imageUrl: "https://shop.milestonecabinetry.com/media/catalog/category/03_AG.jpg" },
  { id: 390005, name: "Iron Black", imageUrl: "https://shop.milestonecabinetry.com/media/catalog/category/01_IB.jpg" },
  { id: 390006, name: "Smokey Ash", imageUrl: "https://shop.milestonecabinetry.com/media/catalog/category/05_SA.jpg" },
  { id: 390007, name: "Lunar Gray", imageUrl: "https://shop.milestonecabinetry.com/media/catalog/category/LG_-_Shaker_Luna_Grey_1.jpg" },
  { id: 390008, name: "Sage Breeze", imageUrl: "https://shop.milestonecabinetry.com/media/catalog/category/SB_-_Shaker_Sage_Breeze_1_1.jpg" },
  { id: 390009, name: "Treasure Chest", imageUrl: "https://shop.milestonecabinetry.com/media/catalog/category/07_TC.jpg" },
  { id: 390010, name: "Rustic Wood", imageUrl: "https://shop.milestonecabinetry.com/media/catalog/category/RW_-_Shaker_Rustic_Wood_1.jpg" },
  { id: 390011, name: "Aspen White", imageUrl: "https://shop.milestonecabinetry.com/media/catalog/category/AW-SD-Front_1_.jpg" },
  { id: 390012, name: "Aspen Charcoal", imageUrl: "https://shop.milestonecabinetry.com/media/catalog/category/AC-SD-Front.jpg" },
  { id: 390013, name: "Double Smokey Gray", imageUrl: "https://shop.milestonecabinetry.com/media/catalog/category/11_DSG.jpg" },
  { id: 390014, name: "Double Dove White", imageUrl: "https://shop.milestonecabinetry.com/media/catalog/category/13_DDW.jpg" },
  { id: 390016, name: "Slim Dove White", imageUrl: "https://shop.milestonecabinetry.com/media/catalog/category/SDW-SD_3.jpg" },
  { id: 390017, name: "Slim Aston Green", imageUrl: "https://shop.milestonecabinetry.com/media/catalog/category/09_SAG.jpg" },
  { id: 390018, name: "Slim Iron Black", imageUrl: "https://shop.milestonecabinetry.com/media/catalog/category/SIB_-_Slim_Iron_Black_1.jpg" },
  { id: 390019, name: "Slim Amber Oak", imageUrl: "https://shop.milestonecabinetry.com/media/catalog/category/SAO_-_Slim_Amber_Oak_1.jpg" },
  { id: 390020, name: "Slim White Oak", imageUrl: "https://shop.milestonecabinetry.com/media/catalog/category/SWO-SD_4.jpg" },
  { id: 390021, name: "High Glossy White", imageUrl: "https://shop.milestonecabinetry.com/media/catalog/category/HW-SD-Front_1_1_1.jpg" },
  { id: 390022, name: "High Glossy Gray", imageUrl: "https://shop.milestonecabinetry.com/media/catalog/category/HG-SD-Front_1_1_1.jpg" },
  { id: 390023, name: "Matte Black", imageUrl: "https://shop.milestonecabinetry.com/media/catalog/category/MB_-_Matt_Black_-_Front.jpg" },
  { id: 390024, name: "Matte Ivory", imageUrl: "https://shop.milestonecabinetry.com/media/catalog/category/MI_-_Matt_Ivory_-_Front_1.jpg" },
  { id: 390025, name: "Oak Blonde", imageUrl: "https://shop.milestonecabinetry.com/media/catalog/category/OB_-_Oak_Blonde_-_Front.jpg" },
  { id: 390026, name: "Oak Shade", imageUrl: "https://shop.milestonecabinetry.com/media/catalog/category/OS_-_Oak_Shade_-_Front.jpg" },
  { id: 390027, name: "Crystal Glass", imageUrl: "https://shop.milestonecabinetry.com/media/catalog/category/CG_-_Crystal_Glass_-_Front.jpg" },
  { id: 390028, name: "Midnight Glass", imageUrl: "https://shop.milestonecabinetry.com/media/catalog/category/MG_-_Midnight_Glass_-_Front.jpg" },
];

export type SupplierSampleResult = {
  id: number;
  name: string;
  ok: boolean;
  /** The colour measured from the fetched supplier image. */
  hex: string | null;
  imageUrl: string | null;
  /** What was written, or why it was skipped. */
  note: string;
};

const MAX_IMAGE_BYTES = 6_000_000;
const FETCH_TIMEOUT_MS = 20_000;

function extensionFor(contentType: string): string {
  if (/png/i.test(contentType)) return "png";
  if (/webp/i.test(contentType)) return "webp";
  return "jpg";
}

type SyncDb = { execute: (query: ReturnType<typeof sql>) => Promise<unknown> };

/**
 * Fetch, measure, store and write one style. Never throws: a sample that cannot be
 * fetched or read comes back as `ok: false` with the reason, so a batch run reports
 * every style instead of stopping at the first bad URL.
 */
export async function syncSupplierDoorSample(
  db: SyncDb,
  sample: SupplierDoorSample,
  options: { dryRun: boolean },
): Promise<SupplierSampleResult> {
  const url = publicSwatchUrl(sample.imageUrl);
  if (!url) {
    return { id: sample.id, name: sample.name, ok: false, hex: null, imageUrl: null, note: "supplier URL is not a public http(s) image" };
  }
  let response: Response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), headers: { "user-agent": "cabinetdealz-supplier-sync" } });
  } catch (error) {
    return { id: sample.id, name: sample.name, ok: false, hex: null, imageUrl: null, note: `fetch failed: ${(error as Error).message}` };
  }
  if (!response.ok) {
    return { id: sample.id, name: sample.name, ok: false, hex: null, imageUrl: null, note: `supplier image answered ${response.status}` };
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length === 0 || buffer.length > MAX_IMAGE_BYTES) {
    return { id: sample.id, name: sample.name, ok: false, hex: null, imageUrl: null, note: `image is ${buffer.length} bytes, which is outside what the analyser accepts` };
  }
  const color = await analyzeSwatchBuffer(buffer).catch(() => null);
  if (!color) {
    return { id: sample.id, name: sample.name, ok: false, hex: null, imageUrl: null, note: "the image could not be read as a door photo" };
  }
  if (options.dryRun) {
    return { id: sample.id, name: sample.name, ok: true, hex: color.hex, imageUrl: null, note: `dry run: would store ${buffer.length} bytes and set color ${color.hex}` };
  }
  // Tom, Nov 14 2026: "if we see the wrong image on the door we can manually add
  // the correct information". So the sync only fills what a person has not set.
  // A sample a human picked is a /manus-storage path that is not ours; a colour a
  // human set is a hex. Both are left alone and reported.
  const [current] = await (db as unknown as { select: (...a: unknown[]) => any })
    .select({ doorSampleImageUrl: sql<string | null>`doorSampleImageUrl`, color: sql<string | null>`color` })
    .from(doorStyles)
    .where(eq(doorStyles.id, sample.id))
    .limit(1) as Array<{ doorSampleImageUrl: string | null; color: string | null }>;
  const currentSample = (current?.doorSampleImageUrl ?? "").trim();
  const currentColor = (current?.color ?? "").trim();
  const keepSample = currentSample.length > 0 && !currentSample.startsWith("/door-samples/");
  const keepColor = /^#[0-9a-f]{6}$/i.test(currentColor);
  if (keepSample && keepColor) {
    return { id: sample.id, name: sample.name, ok: true, hex: currentColor, imageUrl: currentSample, note: "kept the hand-set sample and colour" };
  }

  const contentType = response.headers.get("content-type") || "image/jpeg";
  const stored = await storagePut(
    `door-samples/milestone/${sample.id}.${extensionFor(contentType)}`,
    buffer,
    contentType,
  );
  await db.execute(sql`
    UPDATE door_styles
    SET doorSampleImageUrl = ${keepSample ? currentSample : stored.url},
        color = ${keepColor ? currentColor : color.hex}
    WHERE id = ${sample.id}
  `);
  const kept: string[] = [];
  if (keepSample) kept.push("sample");
  if (keepColor) kept.push("colour");
  return {
    id: sample.id,
    name: sample.name,
    ok: true,
    hex: keepColor ? currentColor : color.hex,
    imageUrl: keepSample ? currentSample : stored.url,
    note: kept.length
      ? `written from the supplier image; kept the hand-set ${kept.join(" and ")}`
      : "sample and colour written from the supplier image",
  };
}

/** Run the whole crosswalk. Stops nothing on a single failure; reports every row. */
export async function syncSupplierDoorSamples(
  db: SyncDb,
  options: { dryRun: boolean; ids?: readonly number[] },
): Promise<SupplierSampleResult[]> {
  const wanted = options.ids && options.ids.length ? new Set(options.ids) : null;
  const samples = MILESTONE_PRESTON_SAMPLES.filter((sample) => !wanted || wanted.has(sample.id));
  const results: SupplierSampleResult[] = [];
  for (const sample of samples) {
    results.push(await syncSupplierDoorSample(db, sample, options));
  }
  return results;
}
