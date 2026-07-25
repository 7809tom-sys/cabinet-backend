/**
 * insert_missing_capital_items.mjs
 *
 * Inserts the 82 missing Capital/USCD cabinet items as:
 *   - cabinets row (isActive=1, showInCatalog=0, showInDesigner=0)
 *   - distributor_skus rows for each applicable style (isPublished=0, isAvailable=1)
 *
 * Rollout-shelf items (RS suffix) are flagged with a note for owner review.
 * All others are also unpublished but ready to publish.
 */

import { createConnection } from 'mysql2/promise';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DISTRIBUTOR_ID = 210002;

// Style code → price column + styleId mapping
// styleId values from the door_styles table for distributorId=210002
const STYLES = [
  // Col A
  { code: 'SW', id: 330014, col: 'a' },
  { code: 'SA', id: 330015, col: 'a' },
  { code: 'SG', id: 330016, col: 'a' },
  { code: 'SD', id: 330017, col: 'a' },
  // Col B
  { code: 'SI', id: 330018, col: 'b' },
  { code: 'SN', id: 330019, col: 'b' },
  { code: 'SB', id: 330020, col: 'b' },
  { code: 'SH', id: 330021, col: 'b' },
  { code: 'SC', id: 330022, col: 'b' },
  { code: 'EW', id: 330023, col: 'b' },
  // Col C
  { code: 'OW', id: 330024, col: 'c' },
  { code: 'OS', id: 330025, col: 'c' },
  { code: 'CW', id: 330026, col: 'c' },
  { code: 'CS', id: 330027, col: 'c' },
  { code: 'HD', id: 330028, col: 'c' },
  { code: 'OM', id: 330029, col: 'd' },
  { code: 'OT', id: 330030, col: 'd' },
  { code: 'HE', id: 330031, col: 'd' },
  { code: 'SEO', id: 330032, col: 'd' },
];

// SW-only styles (for items marked †)
const SW_ONLY_STYLES = STYLES.filter(s => s.code === 'SW');

/**
 * Item definitions extracted from the Capital spec book.
 * Format: { sku, description, category, subCategory, width, height, depth, weight,
 *           priceA, priceB, priceC, priceD, swOnly, isRollout, isKit }
 *
 * width/height/depth in inches. priceX in dollars.
 * swOnly = true means only SW style available (marked †)
 * isRollout = true = rollout shelf item (owner wants to review these)
 */
const ITEMS = [
  // ─── Pullout Organizer Shelf Base Kit ───
  { sku: 'BT9PO', description: '9" Pullout Organizer Shelf Base Kit', category: 'Base', subCategory: 'Specialty Base', width: 9, height: 34.5, depth: 24, weight: 60, priceA: 1297, priceB: 1338, priceC: 1359, priceD: 1379, isKit: true },

  // ─── Trash Can Pullout Base Kits ───
  { sku: 'B15FHTCPO', description: '15" Full Height Trash Can Pullout Base Kit', category: 'Base', subCategory: 'Specialty Base', width: 15, height: 34.5, depth: 24, weight: 82, priceA: 1835, priceB: 1910, priceC: 1970, priceD: 2015, isKit: true },
  { sku: 'B18FHTCPO', description: '18" Full Height Trash Can Pullout Base Kit', category: 'Base', subCategory: 'Specialty Base', width: 18, height: 34.5, depth: 24, weight: 90, priceA: 1959, priceB: 2043, priceC: 2110, priceD: 2158, isKit: true },
  { sku: 'B21FHTCPO', description: '21" Full Height Trash Can Pullout Base Kit', category: 'Base', subCategory: 'Specialty Base', width: 21, height: 34.5, depth: 24, weight: 98, priceA: 2069, priceB: 2160, priceC: 2234, priceD: 2286, isKit: true },
  { sku: 'B15TCPO', description: '15" Trash Can Pullout Base Kit', category: 'Base', subCategory: 'Specialty Base', width: 15, height: 34.5, depth: 24, weight: 80, priceA: 1587, priceB: 1649, priceC: 1682, priceD: 1714, isKit: true },
  { sku: 'B18TCPO', description: '18" Trash Can Pullout Base Kit', category: 'Base', subCategory: 'Specialty Base', width: 18, height: 34.5, depth: 24, weight: 87, priceA: 1675, priceB: 1743, priceC: 1779, priceD: 1813, isKit: true },
  { sku: 'B21TCPO', description: '21" Trash Can Pullout Base Kit', category: 'Base', subCategory: 'Specialty Base', width: 21, height: 34.5, depth: 24, weight: 94, priceA: 1747, priceB: 1821, priceC: 1860, priceD: 1896, isKit: true },

  // ─── Tray Divider Base Kits ───
  { sku: 'B12FHTD', description: '12" Full Height Tray Divider Base Kit', category: 'Base', subCategory: 'Specialty Base', width: 12, height: 34.5, depth: 24, weight: 63, priceA: 885, priceB: 953, priceC: 1006, priceD: 1046, isKit: true },
  { sku: 'B15FHTD', description: '15" Full Height Tray Divider Base Kit', category: 'Base', subCategory: 'Specialty Base', width: 15, height: 34.5, depth: 24, weight: 71, priceA: 986, priceB: 1060, priceC: 1121, priceD: 1165, isKit: true },
  { sku: 'B18FHTD', description: '18" Full Height Tray Divider Base Kit', category: 'Base', subCategory: 'Specialty Base', width: 18, height: 34.5, depth: 24, weight: 85, priceA: 1136, priceB: 1219, priceC: 1287, priceD: 1335, isKit: true },
  { sku: 'B12TD', description: '12" Tray Divider Base Kit', category: 'Base', subCategory: 'Specialty Base', width: 12, height: 34.5, depth: 24, weight: 48, priceA: 693, priceB: 749, priceC: 779, priceD: 808, isKit: true },
  { sku: 'B15TD', description: '15" Tray Divider Base Kit', category: 'Base', subCategory: 'Specialty Base', width: 15, height: 34.5, depth: 24, weight: 53, priceA: 755, priceB: 817, priceC: 850, priceD: 883, isKit: true },
  { sku: 'B18TD', description: '18" Tray Divider Base Kit', category: 'Base', subCategory: 'Specialty Base', width: 18, height: 34.5, depth: 24, weight: 58, priceA: 876, priceB: 945, priceC: 981, priceD: 1015, isKit: true },

  // ─── Single Rollout Shelf Base Kits (1RS) ─── isRollout = true
  { sku: 'B18FH1RS', description: '18" Full Height Single Rollout Shelf Base Kit', category: 'Base', subCategory: 'Rollout Shelf Base', width: 18, height: 34.5, depth: 24, weight: 68, priceA: 1095, priceB: 1179, priceC: 1246, priceD: 1294, isKit: true, isRollout: true },
  { sku: 'B21FH1RS', description: '21" Full Height Single Rollout Shelf Base Kit', category: 'Base', subCategory: 'Rollout Shelf Base', width: 21, height: 34.5, depth: 24, weight: 73, priceA: 1198, priceB: 1290, priceC: 1364, priceD: 1416, isKit: true, isRollout: true },
  { sku: 'B24FH1RS', description: '24" Full Height Single Rollout Shelf Base Kit', category: 'Base', subCategory: 'Rollout Shelf Base', width: 24, height: 34.5, depth: 24, weight: 80, priceA: 1341, priceB: 1444, priceC: 1528, priceD: 1586, isKit: true, isRollout: true },
  { sku: 'B27FH1RS', description: '27" Full Height Single Rollout Shelf Base Kit', category: 'Base', subCategory: 'Rollout Shelf Base', width: 27, height: 34.5, depth: 24, weight: 87, priceA: 1465, priceB: 1577, priceC: 1669, priceD: 1734, isKit: true, isRollout: true },
  { sku: 'B30FH1RS', description: '30" Full Height Single Rollout Shelf Base Kit', category: 'Base', subCategory: 'Rollout Shelf Base', width: 30, height: 34.5, depth: 24, weight: 98, priceA: 1601, priceB: 1725, priceC: 1826, priceD: 1896, isKit: true, isRollout: true },
  { sku: 'B33FH1RS', description: '33" Full Height Single Rollout Shelf Base Kit', category: 'Base', subCategory: 'Rollout Shelf Base', width: 33, height: 34.5, depth: 24, weight: 104, priceA: 1760, priceB: 1896, priceC: 2008, priceD: 2085, isKit: true, isRollout: true },
  { sku: 'B36FH1RS', description: '36" Full Height Single Rollout Shelf Base Kit', category: 'Base', subCategory: 'Rollout Shelf Base', width: 36, height: 34.5, depth: 24, weight: 120, priceA: 1876, priceB: 2022, priceC: 2141, priceD: 2225, isKit: true, isRollout: true },
  { sku: 'B181RS', description: '18" Single Rollout Shelf Base Kit', category: 'Base', subCategory: 'Rollout Shelf Base', width: 18, height: 34.5, depth: 24, weight: 58, priceA: 811, priceB: 879, priceC: 916, priceD: 949, isKit: true, isRollout: true },
  { sku: 'B211RS', description: '21" Single Rollout Shelf Base Kit', category: 'Base', subCategory: 'Rollout Shelf Base', width: 21, height: 34.5, depth: 24, weight: 62, priceA: 877, priceB: 951, priceC: 990, priceD: 1026, isKit: true, isRollout: true },
  { sku: 'B241RS', description: '24" Single Rollout Shelf Base Kit', category: 'Base', subCategory: 'Rollout Shelf Base', width: 24, height: 34.5, depth: 24, weight: 68, priceA: 958, priceB: 1041, priceC: 1083, priceD: 1122, isKit: true, isRollout: true },
  { sku: 'B271RS', description: '27" Single Rollout Shelf Base Kit', category: 'Base', subCategory: 'Rollout Shelf Base', width: 27, height: 34.5, depth: 24, weight: 73, priceA: 1046, priceB: 1135, priceC: 1182, priceD: 1226, isKit: true, isRollout: true },
  { sku: 'B30S1RS', description: '30" Single Rollout Shelf Base Kit', category: 'Base', subCategory: 'Rollout Shelf Base', width: 30, height: 34.5, depth: 24, weight: 84, priceA: 1145, priceB: 1244, priceC: 1296, priceD: 1343, isKit: true, isRollout: true },
  { sku: 'B331RS', description: '33" Single Rollout Shelf Base Kit', category: 'Base', subCategory: 'Rollout Shelf Base', width: 33, height: 34.5, depth: 24, weight: 89, priceA: 1267, priceB: 1377, priceC: 1435, priceD: 1489, isKit: true, isRollout: true },
  { sku: 'B361RS', description: '36" Single Rollout Shelf Base Kit', category: 'Base', subCategory: 'Rollout Shelf Base', width: 36, height: 34.5, depth: 24, weight: 94, priceA: 1346, priceB: 1465, priceC: 1527, priceD: 1583, isKit: true, isRollout: true },
  { sku: 'B18ADA1RS', description: '18" ADA Single Rollout Shelf Base Kit', category: 'Base', subCategory: 'Rollout Shelf Base', width: 18, height: 32, depth: 24, weight: 58, priceA: 886, priceB: null, priceC: null, priceD: null, isKit: true, isRollout: true, swOnly: true },
  { sku: 'B24ADA1RS', description: '24" ADA Single Rollout Shelf Base Kit', category: 'Base', subCategory: 'Rollout Shelf Base', width: 24, height: 32, depth: 24, weight: 68, priceA: 1047, priceB: null, priceC: null, priceD: null, isKit: true, isRollout: true, swOnly: true },
  { sku: 'B30SADA1RS', description: '30" ADA Single Rollout Shelf Base Kit', category: 'Base', subCategory: 'Rollout Shelf Base', width: 30, height: 32, depth: 24, weight: 84, priceA: 1253, priceB: null, priceC: null, priceD: null, isKit: true, isRollout: true, swOnly: true },
  { sku: 'B36ADA1RS', description: '36" ADA Single Rollout Shelf Base Kit', category: 'Base', subCategory: 'Rollout Shelf Base', width: 36, height: 32, depth: 24, weight: 94, priceA: 1475, priceB: null, priceC: null, priceD: null, isKit: true, isRollout: true, swOnly: true },

  // ─── Double Rollout Shelf Base Kits (2RS) ─── isRollout = true
  { sku: 'B18FH2RS', description: '18" Full Height Double Rollout Shelf Base Kit', category: 'Base', subCategory: 'Rollout Shelf Base', width: 18, height: 34.5, depth: 24, weight: 79, priceA: 1252, priceB: 1336, priceC: 1403, priceD: 1451, isKit: true, isRollout: true },
  { sku: 'B21FH2RS', description: '21" Full Height Double Rollout Shelf Base Kit', category: 'Base', subCategory: 'Rollout Shelf Base', width: 21, height: 34.5, depth: 24, weight: 84, priceA: 1368, priceB: 1459, priceC: 1533, priceD: 1585, isKit: true, isRollout: true },
  { sku: 'B24FH2RS', description: '24" Full Height Double Rollout Shelf Base Kit', category: 'Base', subCategory: 'Rollout Shelf Base', width: 24, height: 34.5, depth: 24, weight: 94, priceA: 1523, priceB: 1626, priceC: 1710, priceD: 1768, isKit: true, isRollout: true },
  { sku: 'B27FH2RS', description: '27" Full Height Double Rollout Shelf Base Kit', category: 'Base', subCategory: 'Rollout Shelf Base', width: 27, height: 34.5, depth: 24, weight: 102, priceA: 1659, priceB: 1770, priceC: 1862, priceD: 1927, isKit: true, isRollout: true },
  { sku: 'B30FH2RS', description: '30" Full Height Double Rollout Shelf Base Kit', category: 'Base', subCategory: 'Rollout Shelf Base', width: 30, height: 34.5, depth: 24, weight: 114, priceA: 1805, priceB: 1928, priceC: 2029, priceD: 2100, isKit: true, isRollout: true },
  { sku: 'B33FH2RS', description: '33" Full Height Double Rollout Shelf Base Kit', category: 'Base', subCategory: 'Rollout Shelf Base', width: 33, height: 34.5, depth: 24, weight: 121, priceA: 1975, priceB: 2111, priceC: 2224, priceD: 2300, isKit: true, isRollout: true },
  { sku: 'B36FH2RS', description: '36" Full Height Double Rollout Shelf Base Kit', category: 'Base', subCategory: 'Rollout Shelf Base', width: 36, height: 34.5, depth: 24, weight: 138, priceA: 2101, priceB: 2247, priceC: 2367, priceD: 2450, isKit: true, isRollout: true },
  { sku: 'B182RS', description: '18" Double Rollout Shelf Base Kit', category: 'Base', subCategory: 'Rollout Shelf Base', width: 18, height: 34.5, depth: 24, weight: 84, priceA: 968, priceB: 1036, priceC: 1073, priceD: 1106, isKit: true, isRollout: true },
  { sku: 'B212RS', description: '21" Double Rollout Shelf Base Kit', category: 'Base', subCategory: 'Rollout Shelf Base', width: 21, height: 34.5, depth: 24, weight: 90, priceA: 1046, priceB: 1121, priceC: 1160, priceD: 1195, isKit: true, isRollout: true },
  { sku: 'B242RS', description: '24" Double Rollout Shelf Base Kit', category: 'Base', subCategory: 'Rollout Shelf Base', width: 24, height: 34.5, depth: 24, weight: 100, priceA: 1140, priceB: 1222, priceC: 1265, priceD: 1304, isKit: true, isRollout: true },
  { sku: 'B272RS', description: '27" Double Rollout Shelf Base Kit', category: 'Base', subCategory: 'Rollout Shelf Base', width: 27, height: 34.5, depth: 24, weight: 108, priceA: 1239, priceB: 1328, priceC: 1376, priceD: 1419, isKit: true, isRollout: true },
  { sku: 'B30S2RS', description: '30" Double Rollout Shelf Base Kit', category: 'Base', subCategory: 'Rollout Shelf Base', width: 30, height: 34.5, depth: 24, weight: 121, priceA: 1349, priceB: 1448, priceC: 1500, priceD: 1547, isKit: true, isRollout: true },
  { sku: 'B332RS', description: '33" Double Rollout Shelf Base Kit', category: 'Base', subCategory: 'Rollout Shelf Base', width: 33, height: 34.5, depth: 24, weight: 128, priceA: 1482, priceB: 1593, priceC: 1651, priceD: 1704, isKit: true, isRollout: true },
  { sku: 'B362RS', description: '36" Double Rollout Shelf Base Kit', category: 'Base', subCategory: 'Rollout Shelf Base', width: 36, height: 34.5, depth: 24, weight: 136, priceA: 1572, priceB: 1690, priceC: 1752, priceD: 1809, isKit: true, isRollout: true },
  { sku: 'B18ADA2RS', description: '18" ADA Double Rollout Shelf Base Kit', category: 'Base', subCategory: 'Rollout Shelf Base', width: 18, height: 32, depth: 24, weight: 84, priceA: 1043, priceB: null, priceC: null, priceD: null, isKit: true, isRollout: true, swOnly: true },
  { sku: 'B24ADA2RS', description: '24" ADA Double Rollout Shelf Base Kit', category: 'Base', subCategory: 'Rollout Shelf Base', width: 24, height: 32, depth: 24, weight: 100, priceA: 1229, priceB: null, priceC: null, priceD: null, isKit: true, isRollout: true, swOnly: true },
  { sku: 'B30SADA2RS', description: '30" ADA Double Rollout Shelf Base Kit', category: 'Base', subCategory: 'Rollout Shelf Base', width: 30, height: 32, depth: 24, weight: 121, priceA: 1457, priceB: null, priceC: null, priceD: null, isKit: true, isRollout: true, swOnly: true },
  { sku: 'B36ADA2RS', description: '36" ADA Double Rollout Shelf Base Kit', category: 'Base', subCategory: 'Rollout Shelf Base', width: 36, height: 32, depth: 24, weight: 136, priceA: 1701, priceB: null, priceC: null, priceD: null, isKit: true, isRollout: true, swOnly: true },

  // ─── Triple Rollout Shelf Base Kits (3RS) ─── isRollout = true
  { sku: 'B18FH3RS', description: '18" Full Height Triple Rollout Shelf Base Kit', category: 'Base', subCategory: 'Rollout Shelf Base', width: 18, height: 34.5, depth: 24, weight: 90, priceA: 1409, priceB: 1493, priceC: 1560, priceD: 1608, isKit: true, isRollout: true },
  { sku: 'B21FH3RS', description: '21" Full Height Triple Rollout Shelf Base Kit', category: 'Base', subCategory: 'Rollout Shelf Base', width: 21, height: 34.5, depth: 24, weight: 96, priceA: 1537, priceB: 1629, priceC: 1702, priceD: 1755, isKit: true, isRollout: true },
  { sku: 'B24FH3RS', description: '24" Full Height Triple Rollout Shelf Base Kit', category: 'Base', subCategory: 'Rollout Shelf Base', width: 24, height: 34.5, depth: 24, weight: 108, priceA: 1705, priceB: 1808, priceC: 1892, priceD: 1950, isKit: true, isRollout: true },
  { sku: 'B27FH3RS', description: '27" Full Height Triple Rollout Shelf Base Kit', category: 'Base', subCategory: 'Rollout Shelf Base', width: 27, height: 34.5, depth: 24, weight: 117, priceA: 1852, priceB: 1964, priceC: 2056, priceD: 2121, isKit: true, isRollout: true },
  { sku: 'B30FH3RS', description: '30" Full Height Triple Rollout Shelf Base Kit', category: 'Base', subCategory: 'Rollout Shelf Base', width: 30, height: 34.5, depth: 24, weight: 130, priceA: 2009, priceB: 2132, priceC: 2233, priceD: 2304, isKit: true, isRollout: true },
  { sku: 'B33FH3RS', description: '33" Full Height Triple Rollout Shelf Base Kit', category: 'Base', subCategory: 'Rollout Shelf Base', width: 33, height: 34.5, depth: 24, weight: 138, priceA: 2190, priceB: 2326, priceC: 2439, priceD: 2516, isKit: true, isRollout: true },
  { sku: 'B36FH3RS', description: '36" Full Height Triple Rollout Shelf Base Kit', category: 'Base', subCategory: 'Rollout Shelf Base', width: 36, height: 34.5, depth: 24, weight: 156, priceA: 2327, priceB: 2473, priceC: 2592, priceD: 2676, isKit: true, isRollout: true },

  // ─── Glass Door Wall Cabinets ───
  { sku: 'W1530GD', description: '15" x 30" Single Glass Door Wall Cabinet', category: 'Wall', subCategory: 'Glass Door Wall', width: 15, height: 30, depth: 12, weight: 36, priceA: 409, priceB: 451, priceC: 474, priceD: 496 },
  { sku: 'W1536GD', description: '15" x 36" Single Glass Door Wall Cabinet', category: 'Wall', subCategory: 'Glass Door Wall', width: 15, height: 36, depth: 12, weight: 41, priceA: 459, priceB: 507, priceC: 533, priceD: 556 },
  { sku: 'W1542GD', description: '15" x 42" Single Glass Door Wall Cabinet', category: 'Wall', subCategory: 'Glass Door Wall', width: 15, height: 42, depth: 12, weight: 47, priceA: 536, priceB: 593, priceC: 622, priceD: 650 },
  { sku: 'W2430GD', description: '24" x 30" Double Glass Door Wall Cabinet', category: 'Wall', subCategory: 'Glass Door Wall', width: 24, height: 30, depth: 12, weight: 51, priceA: 590, priceB: 652, priceC: 684, priceD: 714 },
  { sku: 'W2436GD', description: '24" x 36" Double Glass Door Wall Cabinet', category: 'Wall', subCategory: 'Glass Door Wall', width: 24, height: 36, depth: 12, weight: 59, priceA: 683, priceB: 756, priceC: 794, priceD: 827 },
  { sku: 'W2442GD', description: '24" x 42" Double Glass Door Wall Cabinet', category: 'Wall', subCategory: 'Glass Door Wall', width: 24, height: 42, depth: 12, weight: 60, priceA: 784, priceB: 866, priceC: 909, priceD: 950 },
  { sku: 'W3030GD', description: '30" x 30" Double Glass Door Wall Cabinet', category: 'Wall', subCategory: 'Glass Door Wall', width: 30, height: 30, depth: 12, weight: 56, priceA: 684, priceB: 757, priceC: 795, priceD: 828 },
  { sku: 'W3036GD', description: '30" x 36" Double Glass Door Wall Cabinet', category: 'Wall', subCategory: 'Glass Door Wall', width: 30, height: 36, depth: 12, weight: 63, priceA: 787, priceB: 870, priceC: 914, priceD: 953 },
  { sku: 'W3042GD', description: '30" x 42" Double Glass Door Wall Cabinet', category: 'Wall', subCategory: 'Glass Door Wall', width: 30, height: 42, depth: 12, weight: 75, priceA: 901, priceB: 996, priceC: 1046, priceD: 1090 },
  { sku: 'DCW2430GD', description: '24" x 30" Glass Door Diagonal Corner Wall Cabinet', category: 'Wall', subCategory: 'Glass Door Wall', width: 24, height: 30, depth: 24, weight: 70, priceA: 752, priceB: 832, priceC: 873, priceD: 912 },
  { sku: 'DCW2436GD', description: '24" x 36" Glass Door Diagonal Corner Wall Cabinet', category: 'Wall', subCategory: 'Glass Door Wall', width: 24, height: 36, depth: 24, weight: 77, priceA: 850, priceB: 939, priceC: 986, priceD: 1030 },
  { sku: 'DCW2442GD', description: '24" x 42" Glass Door Diagonal Corner Wall Cabinet', category: 'Wall', subCategory: 'Glass Door Wall', width: 24, height: 42, depth: 24, weight: 92, priceA: 981, priceB: 1084, priceC: 1138, priceD: 1187 },

  // ─── Four Rollout Shelf Utility Cabinet Kits ─── isRollout = true
  { sku: 'U1884244RS', description: '18" x 84" Four Rollout Shelf Utility Cabinet Kit', category: 'Tall', subCategory: 'Utility Cabinet', width: 18, height: 84, depth: 24, weight: 132, priceA: 2164, priceB: 2326, priceC: 2411, priceD: 2489, isKit: true, isRollout: true },
  { sku: 'U1890244RS', description: '18" x 90" Four Rollout Shelf Utility Cabinet Kit', category: 'Tall', subCategory: 'Utility Cabinet', width: 18, height: 90, depth: 24, weight: 138, priceA: 2217, priceB: 2384, priceC: 2471, priceD: 2552, isKit: true, isRollout: true },
  { sku: 'U1896244RS', description: '18" x 96" Four Rollout Shelf Utility Cabinet Kit', category: 'Tall', subCategory: 'Utility Cabinet', width: 18, height: 96, depth: 24, weight: 145, priceA: 2291, priceB: 2466, priceC: 2558, priceD: 2641, isKit: true, isRollout: true },
  { sku: 'U2484244RS', description: '24" x 84" Four Rollout Shelf Utility Cabinet Kit', category: 'Tall', subCategory: 'Utility Cabinet', width: 24, height: 84, depth: 24, weight: 161, priceA: 2543, priceB: 2734, priceC: 2834, priceD: 2925, isKit: true, isRollout: true },
  { sku: 'U2490244RS', description: '24" x 90" Four Rollout Shelf Utility Cabinet Kit', category: 'Tall', subCategory: 'Utility Cabinet', width: 24, height: 90, depth: 24, weight: 169, priceA: 2616, priceB: 2815, priceC: 2919, priceD: 3014, isKit: true, isRollout: true },
  { sku: 'U2496244RS', description: '24" x 96" Four Rollout Shelf Utility Cabinet Kit', category: 'Tall', subCategory: 'Utility Cabinet', width: 24, height: 96, depth: 24, weight: 176, priceA: 2710, priceB: 2917, priceC: 3026, priceD: 3128, isKit: true, isRollout: true },
  { sku: 'U3084244RS', description: '30" x 84" Four Rollout Shelf Utility Cabinet Kit', category: 'Tall', subCategory: 'Utility Cabinet', width: 30, height: 84, depth: 24, weight: 190, priceA: 2756, priceB: 2960, priceC: 3068, priceD: 3165, isKit: true, isRollout: true },
  { sku: 'U3090244RS', description: '30" x 90" Four Rollout Shelf Utility Cabinet Kit', category: 'Tall', subCategory: 'Utility Cabinet', width: 30, height: 90, depth: 24, weight: 210, priceA: 2837, priceB: 3050, priceC: 3162, priceD: 3264, isKit: true, isRollout: true },
  { sku: 'U3096244RS', description: '30" x 96" Four Rollout Shelf Utility Cabinet Kit', category: 'Tall', subCategory: 'Utility Cabinet', width: 30, height: 96, depth: 24, weight: 250, priceA: 2941, priceB: 3165, priceC: 3283, priceD: 3389, isKit: true, isRollout: true },

  // ─── Oven Cabinets ───
  { sku: 'O338424', description: '33" x 84" x 24" Oven Cabinet', category: 'Tall', subCategory: 'Oven Cabinet', width: 33, height: 84, depth: 24, weight: 215, priceA: 2243, priceB: 2479, priceC: 2603, priceD: 2715 },
  { sku: 'O339024', description: '33" x 90" x 24" Oven Cabinet', category: 'Tall', subCategory: 'Oven Cabinet', width: 33, height: 90, depth: 24, weight: 233, priceA: 2467, priceB: 2727, priceC: 2863, priceD: 2986 },
  { sku: 'O339624', description: '33" x 96" x 24" Oven Cabinet', category: 'Tall', subCategory: 'Oven Cabinet', width: 33, height: 96, depth: 24, weight: 242, priceA: 2648, priceB: 2926, priceC: 3073, priceD: 3206 },

  // ─── Vanity Double Drawer Base ───
  { sku: 'VDDB42', description: '42" Vanity Double Drawer Base Cabinet', category: 'Vanity', subCategory: 'Vanity Drawer Base', width: 42, height: 34.5, depth: 21, weight: 80, priceA: 1780, priceB: 1967, priceC: 2065, priceD: 2155 },
  { sku: 'VDDB48', description: '48" Vanity Double Drawer Base Cabinet', category: 'Vanity', subCategory: 'Vanity Drawer Base', width: 48, height: 34.5, depth: 21, weight: 82, priceA: 1834, priceB: 2027, priceC: 2128, priceD: 2220 },
];

async function main() {
  const conn = await createConnection(process.env.DATABASE_URL);

  // Check which items already exist (safety check)
  const skus = ITEMS.map(i => i.sku);
  const [existing] = await conn.query(
    'SELECT masterCode FROM cabinets WHERE masterCode IN (?)',
    [skus]
  );
  const existingSet = new Set(existing.map(r => r.masterCode));
  const toInsert = ITEMS.filter(i => !existingSet.has(i.sku));

  console.log(`Items to insert: ${toInsert.length} (${existingSet.size} already exist)`);

  let cabInserted = 0;
  let skuInserted = 0;
  let rolloutCount = 0;

  for (const item of toInsert) {
    // 1. Insert cabinet record
    const [cabResult] = await conn.query(
      `INSERT INTO cabinets
        (masterCode, description, category, subCategory, width, height, depth,
         weight, isActive, showInCatalog, showInDesigner, showIn2020)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 0, 0, 0)`,
      [item.sku, item.description, item.category, item.subCategory,
       item.width, item.height, item.depth, item.weight]
    );
    const cabinetId = cabResult.insertId;
    cabInserted++;

    // 2. Determine which styles to create SKUs for
    const stylesToUse = item.swOnly ? SW_ONLY_STYLES : STYLES;

    for (const style of stylesToUse) {
      const price = style.col === 'a' ? item.priceA
                  : style.col === 'b' ? item.priceB
                  : style.col === 'c' ? item.priceC
                  : item.priceD;

      if (price === null) continue; // X / N/A

      const platformSku = `${style.code}-${item.sku}`;
      await conn.query(
        `INSERT INTO distributor_skus
          (cabinetId, distributorId, styleId, platformSku, distributorSku,
           listPrice, isAvailable, isPublished, status)
         VALUES (?, ?, ?, ?, ?, ?, 1, 0, 'approved')`,
        [cabinetId, DISTRIBUTOR_ID, style.id, platformSku, item.sku, price]
      );
      skuInserted++;
    }

    if (item.isRollout) rolloutCount++;
  }

  await conn.end();

  console.log('\n=== INSERT RESULTS ===');
  console.log(`Cabinet records inserted:  ${cabInserted}`);
  console.log(`SKU rows inserted:         ${skuInserted}`);
  console.log(`Rollout shelf items:       ${rolloutCount} (pending your review)`);
  console.log(`Other specialty items:     ${cabInserted - rolloutCount} (pending your review)`);
  console.log('\nAll items inserted as isPublished=0 — visible in the Pending Review tab.');
}

main().catch(err => { console.error(err); process.exit(1); });
