import { runCleanSwatchRefresh } from "./lib/aefCleanSwatchRefresh";

/**
 * Syncron clean swatches. Source images are cropped with detectContentRegions
 * from --source-dir/<styleCode>.png. A fixed brochure slice is not used.
 * The door crop is never written into drawerSampleImageUrl.
 * Pass --apply to publish accepted crops. Without it, this only prints a report.
 */
const CLEAN_SWATCHES = {
  SSM: {
    finish: "Syncron Select",
    sourceName: "Muratti 4",
    imageUrl: "/manus-storage/aef-syncron-ssm-clean-swatch_8665105d.png",
  },
  SSO: {
    finish: "Syncron Select",
    sourceName: "Como Ash 2",
    imageUrl: "/manus-storage/aef-syncron-sso-clean-swatch_734057fd.png",
  },
  SSH: {
    finish: "Syncron Select",
    sourceName: "Alhambra 1",
    imageUrl: "/manus-storage/aef-syncron-ssh-clean-swatch_e07f22f8.png",
  },
  SSR: {
    finish: "Syncron Select",
    sourceName: "Rosales 1",
    imageUrl: "/manus-storage/aef-syncron-ssr-clean-swatch_9ad18bf7.png",
  },
  SSV: {
    finish: "Syncron Select",
    sourceName: "Velazquez 1",
    imageUrl: "/manus-storage/aef-syncron-ssv-clean-swatch_187be4fd.png",
  },
  SSJ: {
    finish: "Syncron Select",
    sourceName: "Alhambra 2",
    imageUrl: "/manus-storage/aef-syncron-ssj-clean-swatch_912f2be6.png",
  },
  SSP: {
    finish: "Syncron Select",
    sourceName: "Picasso 1",
    imageUrl: "/manus-storage/aef-syncron-ssp-clean-swatch_8bd6ff89.png",
  },
  SSQ: {
    finish: "Syncron Select",
    sourceName: "Picasso 2",
    imageUrl: "/manus-storage/aef-syncron-ssq-clean-swatch_83b1016c.png",
  },
  SSN: {
    finish: "Syncron Select",
    sourceName: "Nocce 1",
    imageUrl: "/manus-storage/aef-syncron-ssn-clean-swatch_5536b021.png",
  },
  SSA: {
    finish: "Syncron Select",
    sourceName: "Rosales 2",
    imageUrl: "/manus-storage/aef-syncron-ssa-clean-swatch_85e088a5.png",
  },
  SSD: {
    finish: "Syncron Select",
    sourceName: "Rosales 4",
    imageUrl: "/manus-storage/aef-syncron-ssd-clean-swatch_2588c244.png",
  },
  SSZ: {
    finish: "Syncron Select",
    sourceName: "Velazquez 2",
    imageUrl: "/manus-storage/aef-syncron-ssz-clean-swatch_5649dac0.png",
  },
  SSK: {
    finish: "Syncron Select",
    sourceName: "Alhambra 3",
    imageUrl: "/manus-storage/aef-syncron-ssk-clean-swatch_15ffb3fb.png",
  },
  SSE: {
    finish: "Syncron Select",
    sourceName: "Nocce 3",
    imageUrl: "/manus-storage/aef-syncron-sse-clean-swatch_84b82286.png",
  },
  SSS: {
    finish: "Syncron Select",
    sourceName: "Picasso 3",
    imageUrl: "/manus-storage/aef-syncron-sss-clean-swatch_a34e03c2.png",
  },
  SSL: {
    finish: "Syncron Select",
    sourceName: "Rosales 3",
    imageUrl: "/manus-storage/aef-syncron-ssl-clean-swatch_118bfeb1.png",
  },
  SSX: {
    finish: "Syncron Select",
    sourceName: "Velazquez 5",
    imageUrl: "/manus-storage/aef-syncron-ssx-clean-swatch_f8f0c367.png",
  },
  SCM: {
    finish: "Syncron Slim Cava",
    sourceName: "Muratti 4",
    imageUrl: "/manus-storage/aef-syncron-scm-clean-swatch_66df202b.png",
  },
  SCR: {
    finish: "Syncron Slim Cava",
    sourceName: "Rosales 1",
    imageUrl: "/manus-storage/aef-syncron-scr-clean-swatch_3a780919.png",
  },
  SCN: {
    finish: "Syncron Slim Cava",
    sourceName: "Nocce 1",
    imageUrl: "/manus-storage/aef-syncron-scn-clean-swatch_20158e92.png",
  },
  SCQ: {
    finish: "Syncron Slim Cava",
    sourceName: "Picasso 2",
    imageUrl: "/manus-storage/aef-syncron-scq-clean-swatch_23c9fc55.png",
  },
  SCA: {
    finish: "Syncron Slim Cava",
    sourceName: "Rosales 2",
    imageUrl: "/manus-storage/aef-syncron-sca-clean-swatch_1e00ca8f.png",
  },
  SCZ: {
    finish: "Syncron Slim Cava",
    sourceName: "Velazquez 2",
    imageUrl: "/manus-storage/aef-syncron-scz-clean-swatch_2c89c79e.png",
  },
  SCL: {
    finish: "Syncron Slim Cava",
    sourceName: "Rosales 3",
    imageUrl: "/manus-storage/aef-syncron-scl-clean-swatch_18b6fd64.png",
  },
} as const;

type StyleCode = keyof typeof CLEAN_SWATCHES;

runCleanSwatchRefresh({
  lineName: "Syncron",
  styles: (Object.keys(CLEAN_SWATCHES) as StyleCode[]).map(styleCode => ({
    styleCode,
    finish: CLEAN_SWATCHES[styleCode].finish,
    legacyDoorImageUrl: CLEAN_SWATCHES[styleCode].imageUrl,
  })),
}).catch(error => {
  console.error(error);
  process.exit(1);
});
