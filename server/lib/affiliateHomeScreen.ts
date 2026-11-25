/**
 * Per-affiliate "Add to Home Screen" assets.
 *
 * The platform ships one static PWA manifest (client/public/manifest.json)
 * named CabinetDealz. A customer who installs an affiliate storefront must see
 * the affiliate's own name and icon instead, so each storefront gets its own
 * manifest and PNG icons under its own route tree:
 *
 *   /store/:slug/manifest.webmanifest
 *   /store/:slug/app-icon-180.png   (apple-touch-icon)
 *   /store/:slug/app-icon-192.png
 *   /store/:slug/app-icon-512.png
 *
 * Vercel forwards /store/* to the backend as /_shell/store/*, so both prefixes
 * are served. Icons prefer the affiliate's uploaded favicon, then the uploaded
 * logo. SVG sources, external URLs, and unreadable files fall back to a
 * server-drawn letter-on-color PNG. Letter shapes are embedded outlines, so the
 * icon renders the same on a server with no fonts installed.
 */
import type { Express, Request, Response } from "express";
import sharp from "sharp";
import { eq } from "drizzle-orm";
import { affiliates } from "../../drizzle/schema";
import { getDb } from "../db";
import { storageFetchObject } from "../storage";

export const AFFILIATE_APP_ICON_SIZES = [180, 192, 512] as const;
export type AffiliateAppIconSize = (typeof AFFILIATE_APP_ICON_SIZES)[number];

const DEFAULT_PRIMARY = "#1a2b4a";
const DEFAULT_BACKGROUND = "#ffffff";
const DEFAULT_STORE_NAME = "Kitchen & Bath Store";
const MAX_SOURCE_BYTES = 5 * 1024 * 1024;
const ICON_CACHE_TTL_MS = 10 * 60 * 1000;
const ICON_CACHE_MAX = 300;

export type AffiliateHomeScreenBrand = {
  slug: string;
  storeName?: string | null;
  tagline?: string | null;
  primaryColor?: string | null;
  backgroundColor?: string | null;
  faviconUrl?: string | null;
  logoUrl?: string | null;
};

function hexOr(value: string | null | undefined, fallback: string): string {
  return /^#[0-9a-fA-F]{6}$/.test(value || "") ? value!.toLowerCase() : fallback;
}

export function affiliateStoreBasePath(slug: string): string {
  return `/store/${encodeURIComponent(slug)}`;
}

export function affiliateManifestPath(slug: string): string {
  return `${affiliateStoreBasePath(slug)}/manifest.webmanifest`;
}

export function affiliateAppIconPath(slug: string, size: AffiliateAppIconSize): string {
  return `${affiliateStoreBasePath(slug)}/app-icon-${size}.png`;
}

export function affiliateHomeScreenName(storeName: string | null | undefined): string {
  return (storeName?.trim() || DEFAULT_STORE_NAME).replace(/[.]+$/, "");
}

/** The web app manifest for one affiliate storefront. */
export function buildAffiliateWebManifest(brand: AffiliateHomeScreenBrand): Record<string, unknown> {
  const name = affiliateHomeScreenName(brand.storeName);
  const base = affiliateStoreBasePath(brand.slug);
  const primary = hexOr(brand.primaryColor, DEFAULT_PRIMARY);
  return {
    id: `${base}/`,
    name,
    short_name: name,
    ...(brand.tagline?.trim() ? { description: brand.tagline.trim() } : {}),
    start_url: `${base}/`,
    scope: `${base}/`,
    display: "standalone",
    theme_color: primary,
    background_color: hexOr(brand.backgroundColor, DEFAULT_BACKGROUND),
    lang: "en",
    icons: [192, 512].map((size) => ({
      src: affiliateAppIconPath(brand.slug, size as AffiliateAppIconSize),
      sizes: `${size}x${size}`,
      type: "image/png",
      purpose: "any",
    })),
  };
}

// DejaVu Sans Bold outlines (font units, 2048 per em, y up). DejaVu fonts are
// free to embed and redistribute under the Bitstream Vera / DejaVu license.
const GLYPHS: Record<string, { d: string; bounds: [number, number, number, number] }> = {
  "A": { d: "M1094 272H492L397 0H10L563 1493H1022L1575 0H1188ZM588 549H997L793 1143Z", bounds: [10, 0, 1575, 1493] },
  "B": { d: "M786 915Q877 915 924 955Q971 995 971 1073Q971 1150 924 1190.5Q877 1231 786 1231H573V915ZM799 262Q915 262 973.5 311Q1032 360 1032 459Q1032 556 974 604.5Q916 653 799 653H573V262ZM1157 799Q1281 763 1349 666Q1417 569 1417 428Q1417 212 1271 106Q1125 0 827 0H188V1493H766Q1077 1493 1216.5 1399Q1356 1305 1356 1098Q1356 989 1305 912.5Q1254 836 1157 799Z", bounds: [188, 0, 1417, 1493] },
  "C": { d: "M1372 82Q1266 27 1151 -1Q1036 -29 911 -29Q538 -29 320 179.5Q102 388 102 745Q102 1103 320 1311.5Q538 1520 911 1520Q1036 1520 1151 1492Q1266 1464 1372 1409V1100Q1265 1173 1161 1207Q1057 1241 942 1241Q736 1241 618 1109Q500 977 500 745Q500 514 618 382Q736 250 942 250Q1057 250 1161 284Q1265 318 1372 391Z", bounds: [102, -29, 1372, 1520] },
  "D": { d: "M573 1202V291H711Q947 291 1071.5 408Q1196 525 1196 748Q1196 970 1072 1086Q948 1202 711 1202ZM188 1493H594Q934 1493 1100.5 1444.5Q1267 1396 1386 1280Q1491 1179 1542 1047Q1593 915 1593 748Q1593 579 1542 446.5Q1491 314 1386 213Q1266 97 1098 48.5Q930 0 594 0H188Z", bounds: [188, 0, 1593, 1493] },
  "E": { d: "M188 1493H1227V1202H573V924H1188V633H573V291H1249V0H188Z", bounds: [188, 0, 1249, 1493] },
  "F": { d: "M188 1493H1227V1202H573V924H1188V633H573V0H188Z", bounds: [188, 0, 1227, 1493] },
  "G": { d: "M1530 111Q1386 41 1231 6Q1076 -29 911 -29Q538 -29 320 179.5Q102 388 102 745Q102 1106 324 1313Q546 1520 932 1520Q1081 1520 1217.5 1492Q1354 1464 1475 1409V1100Q1350 1171 1226.5 1206Q1103 1241 979 1241Q749 1241 624.5 1112.5Q500 984 500 745Q500 508 620 379Q740 250 961 250Q1021 250 1072.5 257.5Q1124 265 1165 281V571H930V829H1530Z", bounds: [102, -29, 1530, 1520] },
  "H": { d: "M188 1493H573V924H1141V1493H1526V0H1141V633H573V0H188Z", bounds: [188, 0, 1526, 1493] },
  "I": { d: "M188 1493H573V0H188Z", bounds: [188, 0, 573, 1493] },
  "J": { d: "M188 1493H573V145Q573 -134 421.5 -272Q270 -410 -37 -410H-115V-119H-55Q65 -119 126.5 -52Q188 15 188 145Z", bounds: [-115, -410, 573, 1493] },
  "K": { d: "M188 1493H573V948L1128 1493H1575L856 786L1649 0H1167L573 588V0H188Z", bounds: [188, 0, 1649, 1493] },
  "L": { d: "M188 1493H573V291H1249V0H188Z", bounds: [188, 0, 1249, 1493] },
  "M": { d: "M188 1493H678L1018 694L1360 1493H1849V0H1485V1092L1141 287H897L553 1092V0H188Z", bounds: [188, 0, 1849, 1493] },
  "N": { d: "M188 1493H618L1161 469V1493H1526V0H1096L553 1024V0H188Z", bounds: [188, 0, 1526, 1493] },
  "O": { d: "M870 1241Q694 1241 597 1111Q500 981 500 745Q500 510 597 380Q694 250 870 250Q1047 250 1144 380Q1241 510 1241 745Q1241 981 1144 1111Q1047 1241 870 1241ZM870 1520Q1230 1520 1434 1314Q1638 1108 1638 745Q1638 383 1434 177Q1230 -29 870 -29Q511 -29 306.5 177Q102 383 102 745Q102 1108 306.5 1314Q511 1520 870 1520Z", bounds: [102, -29, 1638, 1520] },
  "P": { d: "M188 1493H827Q1112 1493 1264.5 1366.5Q1417 1240 1417 1006Q1417 771 1264.5 644.5Q1112 518 827 518H573V0H188ZM573 1214V797H786Q898 797 959 851.5Q1020 906 1020 1006Q1020 1106 959 1160Q898 1214 786 1214Z", bounds: [188, 0, 1417, 1493] },
  "Q": { d: "M911 -27H881Q512 -27 307 177Q102 381 102 745Q102 1108 306.5 1314Q511 1520 870 1520Q1233 1520 1435.5 1316Q1638 1112 1638 745Q1638 493 1530.5 311Q1423 129 1221 37L1522 -299H1155ZM870 1241Q694 1241 597 1111Q500 981 500 745Q500 505 595 377.5Q690 250 870 250Q1047 250 1144 380Q1241 510 1241 745Q1241 981 1144 1111Q1047 1241 870 1241Z", bounds: [102, -299, 1638, 1520] },
  "R": { d: "M735 831Q856 831 908.5 876Q961 921 961 1024Q961 1126 908.5 1170Q856 1214 735 1214H573V831ZM573 565V0H188V1493H776Q1071 1493 1208.5 1394Q1346 1295 1346 1081Q1346 933 1274.5 838Q1203 743 1059 698Q1138 680 1200.5 616.5Q1263 553 1327 424L1536 0H1126L944 371Q889 483 832.5 524Q776 565 682 565Z", bounds: [188, 0, 1536, 1493] },
  "S": { d: "M1227 1446V1130Q1104 1185 987 1213Q870 1241 766 1241Q628 1241 562 1203Q496 1165 496 1085Q496 1025 540.5 991.5Q585 958 702 934L866 901Q1115 851 1220 749Q1325 647 1325 459Q1325 212 1178.5 91.5Q1032 -29 731 -29Q589 -29 446 -2Q303 25 160 78V403Q303 327 436.5 288.5Q570 250 694 250Q820 250 887 292Q954 334 954 412Q954 482 908.5 520Q863 558 727 588L578 621Q354 669 250.5 774Q147 879 147 1057Q147 1280 291 1400Q435 1520 705 1520Q828 1520 958 1501.5Q1088 1483 1227 1446Z", bounds: [147, -29, 1325, 1520] },
  "T": { d: "M10 1493H1386V1202H891V0H506V1202H10Z", bounds: [10, 0, 1386, 1493] },
  "U": { d: "M188 1493H573V598Q573 413 633.5 333.5Q694 254 831 254Q969 254 1029.5 333.5Q1090 413 1090 598V1493H1475V598Q1475 281 1316 126Q1157 -29 831 -29Q506 -29 347 126Q188 281 188 598Z", bounds: [188, -29, 1475, 1493] },
  "V": { d: "M10 1493H397L793 391L1188 1493H1575L1022 0H563Z", bounds: [10, 0, 1575, 1493] },
  "W": { d: "M61 1493H430L688 408L944 1493H1315L1571 408L1829 1493H2195L1843 0H1399L1128 1135L860 0H416Z", bounds: [61, 0, 2195, 1493] },
  "X": { d: "M1020 762 1538 0H1137L788 510L442 0H39L557 762L59 1493H461L788 1012L1114 1493H1518Z", bounds: [39, 0, 1538, 1493] },
  "Y": { d: "M-20 1493H401L741 961L1081 1493H1503L934 629V0H549V629Z", bounds: [-20, 0, 1503, 1493] },
  "Z": { d: "M115 1493H1370V1260L569 291H1393V0H92V233L893 1202H115Z", bounds: [92, 0, 1393, 1493] },
  "0": { d: "M942 748Q942 1028 889.5 1142.5Q837 1257 713 1257Q589 1257 536 1142.5Q483 1028 483 748Q483 465 536 349Q589 233 713 233Q836 233 889 349Q942 465 942 748ZM1327 745Q1327 374 1167 172.5Q1007 -29 713 -29Q418 -29 258 172.5Q98 374 98 745Q98 1117 258 1318.5Q418 1520 713 1520Q1007 1520 1167 1318.5Q1327 1117 1327 745Z", bounds: [98, -29, 1327, 1520] },
  "1": { d: "M240 266H580V1231L231 1159V1421L578 1493H944V266H1284V0H240Z", bounds: [231, 0, 1284, 1493] },
  "2": { d: "M590 283H1247V0H162V283L707 764Q780 830 815 893Q850 956 850 1024Q850 1129 779.5 1193Q709 1257 592 1257Q502 1257 395 1218.5Q288 1180 166 1104V1432Q296 1475 423 1497.5Q550 1520 672 1520Q940 1520 1088.5 1402Q1237 1284 1237 1073Q1237 951 1174 845.5Q1111 740 909 563Z", bounds: [162, 0, 1247, 1520] },
  "3": { d: "M954 805Q1105 766 1183.5 669.5Q1262 573 1262 424Q1262 202 1092 86.5Q922 -29 596 -29Q481 -29 365.5 -10.5Q250 8 137 45V342Q245 288 351.5 260.5Q458 233 561 233Q714 233 795.5 286Q877 339 877 438Q877 540 793.5 592.5Q710 645 547 645H393V893H555Q700 893 771 938.5Q842 984 842 1077Q842 1163 773 1210Q704 1257 578 1257Q485 1257 390 1236Q295 1215 201 1174V1456Q315 1488 427 1504Q539 1520 647 1520Q938 1520 1082.5 1424.5Q1227 1329 1227 1137Q1227 1006 1158 922.5Q1089 839 954 805Z", bounds: [137, -29, 1262, 1520] },
  "4": { d: "M754 1176 332 551H754ZM690 1493H1118V551H1331V272H1118V0H754V272H92V602Z", bounds: [92, 0, 1331, 1493] },
  "5": { d: "M217 1493H1174V1210H524V979Q568 991 612.5 997.5Q657 1004 705 1004Q978 1004 1130 867.5Q1282 731 1282 487Q1282 245 1116.5 108Q951 -29 657 -29Q530 -29 405.5 -4.5Q281 20 158 70V373Q280 303 389.5 268Q499 233 596 233Q736 233 816.5 301.5Q897 370 897 487Q897 605 816.5 673Q736 741 596 741Q513 741 419 719.5Q325 698 217 653Z", bounds: [158, -29, 1282, 1493] },
  "6": { d: "M741 737Q640 737 589.5 671.5Q539 606 539 475Q539 344 589.5 278.5Q640 213 741 213Q843 213 893.5 278.5Q944 344 944 475Q944 606 893.5 671.5Q843 737 741 737ZM1217 1454V1178Q1122 1223 1038 1244.5Q954 1266 874 1266Q702 1266 606 1170.5Q510 1075 494 887Q560 936 637 960.5Q714 985 805 985Q1034 985 1174.5 851Q1315 717 1315 500Q1315 260 1158 115.5Q1001 -29 737 -29Q446 -29 286.5 167.5Q127 364 127 725Q127 1095 313.5 1306.5Q500 1518 825 1518Q928 1518 1025 1502Q1122 1486 1217 1454Z", bounds: [127, -29, 1315, 1518] },
  "7": { d: "M137 1493H1262V1276L680 0H305L856 1210H137Z", bounds: [137, 0, 1262, 1493] },
  "8": { d: "M713 668Q605 668 547 609Q489 550 489 440Q489 330 547 271.5Q605 213 713 213Q820 213 877 271.5Q934 330 934 440Q934 551 877 609.5Q820 668 713 668ZM432 795Q296 836 227 921Q158 1006 158 1133Q158 1322 299 1421Q440 1520 713 1520Q984 1520 1125 1421.5Q1266 1323 1266 1133Q1266 1006 1196.5 921Q1127 836 991 795Q1143 753 1220.5 658.5Q1298 564 1298 420Q1298 198 1150.5 84.5Q1003 -29 713 -29Q422 -29 273.5 84.5Q125 198 125 420Q125 564 202.5 658.5Q280 753 432 795ZM522 1094Q522 1005 571.5 957Q621 909 713 909Q803 909 852 957Q901 1005 901 1094Q901 1183 852 1230.5Q803 1278 713 1278Q621 1278 571.5 1230Q522 1182 522 1094Z", bounds: [125, -29, 1298, 1520] },
  "9": { d: "M205 33V309Q297 266 381 244.5Q465 223 547 223Q719 223 815 318.5Q911 414 928 602Q860 552 783 527Q706 502 616 502Q387 502 246.5 635.5Q106 769 106 987Q106 1228 262.5 1373Q419 1518 682 1518Q974 1518 1134 1321Q1294 1124 1294 764Q1294 394 1107 182.5Q920 -29 594 -29Q489 -29 393 -13.5Q297 2 205 33ZM680 752Q781 752 832 817.5Q883 883 883 1014Q883 1144 832 1210Q781 1276 680 1276Q579 1276 528 1210Q477 1144 477 1014Q477 883 528 817.5Q579 752 680 752Z", bounds: [106, -29, 1294, 1518] },
};

export function letterIconInitial(storeName: string | null | undefined): string | null {
  const match = affiliateHomeScreenName(storeName).toUpperCase().match(/[A-Z0-9]/);
  return match ? match[0] : null;
}

/** SVG markup for a letter-on-color icon. Uses outlines, never a system font. */
export function letterIconSvg(storeName: string | null | undefined, primaryColor: string | null | undefined, size: number): string {
  const color = hexOr(primaryColor, DEFAULT_PRIMARY);
  const initial = letterIconInitial(storeName);
  const glyph = initial ? GLYPHS[initial] : undefined;
  let mark = "";
  if (glyph) {
    const [x0, y0, x1, y1] = glyph.bounds;
    const glyphHeight = Math.max(1, y1 - y0);
    const glyphWidth = Math.max(1, x1 - x0);
    const scale = Math.min((size * 0.5) / glyphHeight, (size * 0.62) / glyphWidth);
    const tx = (size - glyphWidth * scale) / 2 - x0 * scale;
    const ty = (size + glyphHeight * scale) / 2 + y0 * scale;
    mark = `<path fill="#ffffff" transform="translate(${tx.toFixed(2)} ${ty.toFixed(2)}) scale(${scale.toFixed(5)} ${(-scale).toFixed(5)})" d="${glyph.d}"/>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><rect width="${size}" height="${size}" fill="${color}"/>${mark}</svg>`;
}

export async function renderLetterIconPng(
  storeName: string | null | undefined,
  primaryColor: string | null | undefined,
  size: number,
): Promise<Buffer> {
  return sharp(Buffer.from(letterIconSvg(storeName, primaryColor, size)))
    .flatten({ background: hexOr(primaryColor, DEFAULT_PRIMARY) })
    .png()
    .toBuffer();
}

/**
 * Fit an uploaded raster image into a square, opaque PNG. iOS paints
 * transparent touch-icon pixels black, so the icon is flattened on the
 * storefront background color with a small margin.
 */
export async function renderSourceIconPng(source: Buffer, background: string, size: number): Promise<Buffer> {
  const inner = Math.round(size * 0.84);
  const fitted = await sharp(source, { failOn: "error" })
    .resize({ width: inner, height: inner, fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  const composed = await sharp({ create: { width: size, height: size, channels: 4, background } })
    .composite([{ input: fitted, gravity: "center" }])
    .png()
    .toBuffer();
  return sharp(composed).flatten({ background }).png().toBuffer();
}

/** Only uploaded raster files in platform storage are used; never fetch an arbitrary URL. */
export function storageKeyForBrandImage(url: string | null | undefined): string | null {
  const value = (url || "").trim();
  const match = value.match(/^\/manus-storage\/([^?#]+)$/);
  if (!match) return null;
  const key = decodeURIComponent(match[1]);
  if (key.includes("..") || /\.svg$/i.test(key)) return null;
  return key;
}

async function loadBrandImage(url: string | null | undefined): Promise<Buffer | null> {
  const key = storageKeyForBrandImage(url);
  if (!key) return null;
  try {
    const response = await storageFetchObject(key);
    if (!response.ok) return null;
    const type = response.headers.get("content-type") || "";
    if (/svg/i.test(type)) return null;
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_SOURCE_BYTES) return null;
    const meta = await sharp(bytes, { failOn: "error" }).metadata();
    if (!meta.format || meta.format === "svg") return null;
    return bytes;
  } catch {
    return null;
  }
}

export async function renderAffiliateAppIcon(
  brand: AffiliateHomeScreenBrand,
  size: AffiliateAppIconSize,
  loader: (url: string | null | undefined) => Promise<Buffer | null> = loadBrandImage,
): Promise<Buffer> {
  const background = hexOr(brand.backgroundColor, DEFAULT_BACKGROUND);
  for (const candidate of [brand.faviconUrl, brand.logoUrl]) {
    const source = await loader(candidate);
    if (!source) continue;
    try {
      return await renderSourceIconPng(source, background, size);
    } catch {
      // unreadable image: try the next source, then the letter icon
    }
  }
  return renderLetterIconPng(brand.storeName, brand.primaryColor, size);
}

type ServingRow = AffiliateHomeScreenBrand & { status?: string | null; storefrontEnabled?: boolean | null };

async function findServingAffiliate(slug: string): Promise<AffiliateHomeScreenBrand | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = (await db
    .select({
      slug: affiliates.slug,
      storeName: affiliates.storeName,
      tagline: affiliates.tagline,
      primaryColor: affiliates.primaryColor,
      backgroundColor: affiliates.backgroundColor,
      faviconUrl: affiliates.faviconUrl,
      logoUrl: affiliates.logoUrl,
      status: affiliates.status,
      storefrontEnabled: affiliates.storefrontEnabled,
    })
    .from(affiliates)
    .where(eq(affiliates.slug, slug))
    .limit(1)) as ServingRow[];
  const row = rows[0];
  if (!row || row.status === "inactive" || row.storefrontEnabled === false) return null;
  return row;
}

const iconCache = new Map<string, { at: number; png: Buffer }>();

function cacheKey(brand: AffiliateHomeScreenBrand, size: number): string {
  return [brand.slug, size, brand.storeName, brand.primaryColor, brand.backgroundColor, brand.faviconUrl, brand.logoUrl].join("|");
}

export type AffiliateHomeScreenLookup = (slug: string) => Promise<AffiliateHomeScreenBrand | null>;

export function createAffiliateHomeScreenHandlers(lookup: AffiliateHomeScreenLookup = findServingAffiliate) {
  async function manifest(req: Request, res: Response) {
    const slug = String(req.params.slug || "");
    const brand = slug ? await lookup(slug).catch(() => null) : null;
    if (!brand) return res.status(404).type("text/plain").send("Store not found");
    res.setHeader("Content-Type", "application/manifest+json; charset=UTF-8");
    res.setHeader("Cache-Control", "public, max-age=300, must-revalidate");
    return res.send(JSON.stringify(buildAffiliateWebManifest({ ...brand, slug: brand.slug || slug })));
  }

  async function icon(req: Request, res: Response) {
    const slug = String(req.params.slug || "");
    const size = Number(req.params.size) as AffiliateAppIconSize;
    if (!AFFILIATE_APP_ICON_SIZES.includes(size)) return res.status(404).type("text/plain").send("Not found");
    const brand = slug ? await lookup(slug).catch(() => null) : null;
    if (!brand) return res.status(404).type("text/plain").send("Store not found");
    const key = cacheKey(brand, size);
    const cached = iconCache.get(key);
    let png = cached && Date.now() - cached.at < ICON_CACHE_TTL_MS ? cached.png : null;
    if (!png) {
      png = await renderAffiliateAppIcon(brand, size);
      if (iconCache.size >= ICON_CACHE_MAX) iconCache.clear();
      iconCache.set(key, { at: Date.now(), png });
    }
    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "public, max-age=3600");
    return res.send(png);
  }

  return { manifest, icon };
}

/**
 * Register before the /_shell/* HTML route and the SPA fallback so these
 * paths never return the page shell.
 */
export function registerAffiliateHomeScreenRoutes(app: Express, lookup?: AffiliateHomeScreenLookup): void {
  const handlers = createAffiliateHomeScreenHandlers(lookup);
  const wrap = (fn: (req: Request, res: Response) => Promise<unknown>) => (req: Request, res: Response) => {
    fn(req, res).catch(() => {
      if (!res.headersSent) res.status(500).type("text/plain").send("Unavailable");
    });
  };
  for (const prefix of ["", "/_shell"]) {
    app.get(`${prefix}/store/:slug/manifest.webmanifest`, wrap(handlers.manifest));
    app.get(`${prefix}/store/:slug/app-icon-:size.png`, wrap(handlers.icon));
  }
}
