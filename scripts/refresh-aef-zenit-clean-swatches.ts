import { runCleanSwatchRefresh } from "./lib/aefCleanSwatchRefresh";

/**
 * Zenit clean swatches. Source images are cropped with detectContentRegions
 * from --source-dir/<styleCode>.png. The door crop is never written into
 * drawerSampleImageUrl. Pass --apply to publish accepted crops.
 */
const CLEAN_SWATCHES = {
  ZSA: "/manus-storage/aef-zenit-zsa-clean-swatch_1d3dfdf1.png",
  ZSB: "/manus-storage/aef-zenit-zsb-clean-swatch_b59c0c68.png",
  ZSC: "/manus-storage/aef-zenit-zsc-clean-swatch_3c75174f.png",
  ZSI: "/manus-storage/aef-zenit-zsi-clean-swatch_e58dc58e.png",
  ZSK: "/manus-storage/aef-zenit-zsk-clean-swatch_5acee2dc.png",
  ZSL: "/manus-storage/aef-zenit-zsl-clean-swatch_4ae2f56c.png",
  ZSM: "/manus-storage/aef-zenit-zsm-clean-swatch_1f6daaeb.png",
  ZSN: "/manus-storage/aef-zenit-zsn-clean-swatch_77c31db4.png",
  ZSO: "/manus-storage/aef-zenit-zso-clean-swatch_fffeba8e.png",
  ZSP: "/manus-storage/aef-zenit-zsp-clean-swatch_86a61609.png",
  ZSU: "/manus-storage/aef-zenit-zsu-clean-swatch_a7f28bb7.png",
  ZSV: "/manus-storage/aef-zenit-zsv-clean-swatch_776313e5.png",
  ZSW: "/manus-storage/aef-zenit-zsw-clean-swatch_d505cf05.png",
} as const;

type StyleCode = keyof typeof CLEAN_SWATCHES;

runCleanSwatchRefresh({
  lineName: "Zenit",
  styles: (Object.keys(CLEAN_SWATCHES) as StyleCode[]).map(styleCode => ({
    styleCode,
    finish: "Zenit Classic",
    legacyDoorImageUrl: CLEAN_SWATCHES[styleCode],
  })),
}).catch(error => {
  console.error(error);
  process.exit(1);
});
