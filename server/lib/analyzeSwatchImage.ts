import sharp from "sharp";
import { analyzeSwatchPixels, type SwatchColor } from "../../shared/swatchColor";

const MAX_BYTES = 6_000_000;

export async function analyzeSwatchBuffer(buffer: Buffer): Promise<SwatchColor | null> {
  if (buffer.length === 0 || buffer.length > MAX_BYTES) return null;
  const { data, info } = await sharp(buffer)
    .rotate()
    .resize(240, 240, { fit: "inside", withoutEnlargement: true })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return analyzeSwatchPixels({
    data,
    width: info.width,
    height: info.height,
    channels: 4,
  });
}

export function swatchBufferFromDataUrl(dataUrl: string): Buffer | null {
  const match = /^data:image\/[a-zA-Z0-9.+-]+;base64,([a-zA-Z0-9+/=\s]+)$/.exec(dataUrl.trim());
  if (!match) return null;
  const buffer = Buffer.from(match[1]!.replace(/\s/g, ""), "base64");
  return buffer.length > 0 && buffer.length <= MAX_BYTES ? buffer : null;
}

/** Public http(s) image URL. Blocks local and link-local hosts. */
export function publicSwatchUrl(value: string): string | null {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".local") || host === "0.0.0.0") return null;
  if (/^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(host)) return null;
  if (host.includes(":")) return null;
  return url.toString();
}

export async function fetchSwatchBuffer(imageUrl: string): Promise<Buffer | null> {
  const url = publicSwatchUrl(imageUrl);
  if (!url) return null;
  const response = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(20_000) });
  if (!response.ok) return null;
  const length = Number(response.headers.get("content-length") ?? "0");
  if (length > MAX_BYTES) return null;
  const buffer = Buffer.from(await response.arrayBuffer());
  return buffer.length > 0 && buffer.length <= MAX_BYTES ? buffer : null;
}
