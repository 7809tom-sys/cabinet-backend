/**
 * Connect the complete US Cabinet Depot frameless (AEF) catalog to its verified
 * Atlanta-area fulfillment origin and the existing US Cabinet Depot Supplier
 * Portal profile.
 *
 * Scope: AEF distributor + its 49 AEF door styles + the established US Cabinet
 * Depot vendor_lines record. It does not modify any SKU, price, geometry,
 * visibility, customer, contact details, or login credentials.
 *
 * Review first:
 *   pnpm exec tsx scripts/configure-aef-atlanta-fulfillment.ts
 * Apply only after review:
 *   pnpm exec tsx scripts/configure-aef-atlanta-fulfillment.ts --apply
 */
import mysql from "mysql2/promise";

const APPLY = process.argv.includes("--apply");
const DISTRIBUTOR_CODE = "AEF";
const ATLANTA_ZIP = "30071";
const ATLANTA_NAME = "U.S. Cabinet Depot — Atlanta warehouse";
const ATLANTA_ADDRESS = "1950 North Norcross-Tucker Rd, Norcross, GA 30071";
const PORTAL_NAME = "US Cabinet Depot";
const GENERATED_DUPLICATE_PORTAL_NAME = "US Cabinet Depot — Atlanta Frameless";

type DistributorRow = { id: number; code: string; name: string; isActive: number; warehouseName: string | null; warehouseAddress: string | null; warehouseZips: unknown };
type CountRow = { count: number };
type PortalRow = { id: number; name: string; sourceKey: string | null; contactEmail: string | null; totalSalesCents: number; isApproved: number };

function json(value: unknown) {
  return typeof value === "string" ? JSON.parse(value) : value;
}

async function main() {
  const connection = await mysql.createConnection(process.env.DATABASE_URL!);
  try {
    const [[line]] = await connection.query<DistributorRow[]>(
      "SELECT id, code, name, isActive, warehouseName, warehouseAddress, warehouseZips FROM distributors WHERE code=? LIMIT 1",
      [DISTRIBUTOR_CODE],
    );
    if (!line || line.isActive !== 1) throw new Error("Active AEF US Cabinet Depot Frameless distributor line is required.");

    const [[styleCount]] = await connection.query<CountRow[]>(
      "SELECT COUNT(*) AS count FROM door_styles WHERE distributorId=? AND isActive=1",
      [line.id],
    );
    const [[framelessCount]] = await connection.query<CountRow[]>(
      "SELECT COUNT(*) AS count FROM distributor_skus WHERE distributorId=? AND constructionType='frameless' AND isPublished=1 AND isAvailable=1",
      [line.id],
    );
    if (Number(styleCount?.count) !== 49) throw new Error(`Expected 49 active AEF door styles; found ${styleCount?.count ?? 0}.`);
    if (Number(framelessCount?.count) !== 13_413) throw new Error(`Expected 13,413 active AEF frameless SKU rows; found ${framelessCount?.count ?? 0}.`);

    const [officialRows] = await connection.query<PortalRow[]>(
      "SELECT id, name, sourceKey, contactEmail, totalSalesCents, isApproved FROM vendor_lines WHERE name=? LIMIT 2",
      [PORTAL_NAME],
    );
    if (officialRows.length !== 1 || officialRows[0]!.isApproved !== 1) {
      throw new Error("Exactly one approved US Cabinet Depot Supplier Portal profile is required.");
    }
    const officialPortal = officialRows[0]!;
    const sourceKey = `dist:${line.id}`;
    const [mappedRows] = await connection.query<PortalRow[]>(
      "SELECT id, name, sourceKey, contactEmail, totalSalesCents, isApproved FROM vendor_lines WHERE sourceKey=?",
      [sourceKey],
    );
    const generatedDuplicates = mappedRows.filter((row) => row.id !== officialPortal.id && row.name === GENERATED_DUPLICATE_PORTAL_NAME && !row.contactEmail?.trim() && Number(row.totalSalesCents) === 0);
    const unexpectedMappings = mappedRows.filter((row) => row.id !== officialPortal.id && !generatedDuplicates.some((duplicate) => duplicate.id === row.id));
    if (unexpectedMappings.length > 0) throw new Error(`Another supplier portal is mapped to ${sourceKey}; refusing to guess.`);

    const before = {
      distributor: { id: line.id, code: line.code, name: line.name, warehouseName: line.warehouseName, warehouseAddress: line.warehouseAddress, warehouseZips: json(line.warehouseZips) },
      activeStyleCount: Number(styleCount.count),
      publishedFramelessSkuCount: Number(framelessCount.count),
      officialPortal,
      generatedDuplicates,
    };
    const after = {
      distributor: { warehouseName: ATLANTA_NAME, warehouseAddress: ATLANTA_ADDRESS, warehouseZips: [ATLANTA_ZIP] },
      everyActiveDoorStyle: { warehouseZip: ATLANTA_ZIP, warehouseZips: [ATLANTA_ZIP] },
      portal: { name: PORTAL_NAME, sourceKey, isApproved: true },
    };
    console.log(JSON.stringify({ mode: APPLY ? "apply" : "preflight", before, after }, null, 2));
    if (!APPLY) return;

    await connection.beginTransaction();
    try {
      await connection.query(
        "UPDATE distributors SET warehouseName=?, warehouseAddress=?, warehouseZips=JSON_ARRAY(?) WHERE id=?",
        [ATLANTA_NAME, ATLANTA_ADDRESS, ATLANTA_ZIP, line.id],
      );
      await connection.query(
        "UPDATE door_styles SET warehouseZip=?, warehouseZips=JSON_ARRAY(?) WHERE distributorId=?",
        [ATLANTA_ZIP, ATLANTA_ZIP, line.id],
      );
      for (const duplicate of generatedDuplicates) {
        await connection.query(
          "DELETE FROM vendor_lines WHERE id=? AND name=? AND (contactEmail='' OR contactEmail IS NULL) AND totalSalesCents=0",
          [duplicate.id, GENERATED_DUPLICATE_PORTAL_NAME],
        );
      }
      await connection.query(
        "UPDATE vendor_lines SET sourceKey=?, category='Cabinets', isApproved=1 WHERE id=?",
        [sourceKey, officialPortal.id],
      );
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    }
  } finally {
    await connection.end();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
