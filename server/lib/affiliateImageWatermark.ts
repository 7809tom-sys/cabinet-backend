import sharp from "sharp";

const MAX_LOGO_WIDTH_RATIO = 0.18;
const MAX_LOGO_HEIGHT_RATIO = 0.12;
const MIN_MARGIN = 24;

export type AffiliateWatermarkOptions = {
  opacityBps?: number;
  position?: "bottom-right";
};

/**
 * Applies only the affiliate brand mark. The source pixels are never modified
 * in place: callers receive a new image buffer and can preserve the original.
 * The watermark is deliberately limited to the fixed safe corner so every
 * affiliate asset has a predictable brand position without covering cabinetry.
 */
export async function applyAffiliateLogoWatermark(
  source: Buffer,
  logo: Buffer,
  options: AffiliateWatermarkOptions = {},
): Promise<{ data: Buffer; format: "png" | "jpeg"; width: number; height: number }> {
  const sourceImage = sharp(source, { failOn: "error" });
  const metadata = await sourceImage.metadata();
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  if (width < 64 || height < 64) throw new Error("The generated image is too small to watermark safely.");

  const opacity = Math.min(0.9, Math.max(0.35, (options.opacityBps ?? 7200) / 10000));
  const margin = Math.max(MIN_MARGIN, Math.round(Math.min(width, height) * 0.025));
  const maxLogoWidth = Math.max(32, Math.round(width * MAX_LOGO_WIDTH_RATIO));
  const maxLogoHeight = Math.max(24, Math.round(height * MAX_LOGO_HEIGHT_RATIO));
  const logoPng = await sharp(logo, { failOn: "error" })
    .ensureAlpha()
    .resize({ width: maxLogoWidth, height: maxLogoHeight, fit: "inside", withoutEnlargement: true })
    .png()
    .toBuffer();
  const logoMeta = await sharp(logoPng).metadata();
  const logoWidth = logoMeta.width ?? maxLogoWidth;
  const logoHeight = logoMeta.height ?? maxLogoHeight;
  const left = Math.max(0, width - logoWidth - margin);
  const top = Math.max(0, height - logoHeight - margin);
  const encodedLogo = logoPng.toString("base64");
  const overlay = Buffer.from(
    `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><image href="data:image/png;base64,${encodedLogo}" x="${left}" y="${top}" width="${logoWidth}" height="${logoHeight}" opacity="${opacity}" preserveAspectRatio="none"/></svg>`,
  );
  const outputFormat = metadata.format === "png" ? "png" : "jpeg";
  const rendered = await sourceImage
    .composite([{ input: overlay, blend: "over" }])
    [outputFormat]({ quality: outputFormat === "jpeg" ? 92 : undefined })
    .toBuffer();
  return { data: rendered, format: outputFormat, width, height };
}
