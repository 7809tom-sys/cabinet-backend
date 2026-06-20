import { getDb } from "./db.ts";
import * as schema from "../drizzle/schema.ts";
const db = await getDb();
import fs from "fs";

const out = [];
const styles = await db.select().from(schema.doorStyles);
out.push(`TOTAL door_styles: ${styles.length}`);
out.push("--- id | ourName | doorStyle | woodSpecies | finish | color ---");
for (const s of styles) {
  out.push(`${s.id} | ${s.ourName ?? ""} | ${s.doorStyle ?? ""} | ${s.woodSpecies ?? ""} | ${s.finish ?? ""} | ${s.color ?? ""}`);
}
fs.writeFileSync("/home/ubuntu/img_audit.txt", out.join("\n"));
console.log("done");
process.exit(0);
