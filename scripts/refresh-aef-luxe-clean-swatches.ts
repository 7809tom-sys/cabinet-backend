import { runCleanSwatchRefresh } from "./lib/aefCleanSwatchRefresh";

/**
 * Luxe clean swatches. Source images are cropped with detectContentRegions
 * from --source-dir/<styleCode>.png. The door crop is never written into
 * drawerSampleImageUrl. Pass --apply to publish accepted crops.
 */
const CLEAN_SWATCHES = {
  LSA: {
    finish: "Luxe Classic",
    imageUrl: "/manus-storage/aef-luxe-lsa-clean-swatch_4154dedb.png",
  },
  LSC: {
    finish: "Luxe Classic",
    imageUrl: "/manus-storage/aef-luxe-lsc-clean-swatch_c92285a6.png",
  },
  LSN: {
    finish: "Luxe Classic",
    imageUrl: "/manus-storage/aef-luxe-lsn-clean-swatch_00031ec3.png",
  },
  LSP: {
    finish: "Luxe Select",
    imageUrl: "/manus-storage/aef-luxe-lsp-clean-swatch_7c5b26bf.png",
  },
  LSR: {
    finish: "Luxe Select",
    imageUrl: "/manus-storage/aef-luxe-lsr-clean-swatch_c47e44e1.png",
  },
} as const;

type StyleCode = keyof typeof CLEAN_SWATCHES;

runCleanSwatchRefresh({
  lineName: "Luxe",
  styles: (Object.keys(CLEAN_SWATCHES) as StyleCode[]).map(styleCode => ({
    styleCode,
    finish: CLEAN_SWATCHES[styleCode].finish,
    legacyDoorImageUrl: CLEAN_SWATCHES[styleCode].imageUrl,
  })),
}).catch(error => {
  console.error(error);
  process.exit(1);
});
