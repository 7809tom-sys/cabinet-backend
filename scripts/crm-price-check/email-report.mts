// Emails the weekly report (report.md + report.csv) because disk on the host is temporary.
// Sends nothing to the database. Recipient: CRM_CHECK_REPORT_EMAIL, else OWNER_EMAIL.
//   usage: email-report.mts <outDir> [--dry-run]
import "dotenv/config";
import fs from "fs";
import { sendEmail } from "../../server/email";
import { ENV } from "../../server/_core/env";

const outDir = process.argv[2];
const dryRun = process.argv.includes("--dry-run");
if (!outDir) throw new Error("usage: email-report.mts <outDir> [--dry-run]");

const to = (process.env.CRM_CHECK_REPORT_EMAIL || ENV.ownerEmail || "").trim();
if (!to) throw new Error("set CRM_CHECK_REPORT_EMAIL or OWNER_EMAIL");

const md = fs.readFileSync(`${outDir}/report.md`, "utf8");
const csv = fs.readFileSync(`${outDir}/report.csv`);
const date = outDir.replace(/\/+$/, "").split("/").pop();
const unchanged = (() => {
  try { return JSON.parse(fs.readFileSync(`${outDir}/snapshot_check.json`, "utf8")).unchanged === true; } catch { return null; }
})();
const subject = `[Cabinet Dealz] Weekly CRM price check ${date}${unchanged === false ? " — DATA CHANGED, REVIEW" : ""}`;

if (dryRun) {
  console.log(`DRY RUN would email ${to}: "${subject}" (report.md ${md.length} chars, report.csv ${csv.length} bytes, unchanged=${unchanged})`);
  process.exit(0);
}

const result = await sendEmail({
  to,
  subject,
  text: md,
  attachments: [
    { filename: `crm-price-check-${date}.md`, content: md, contentType: "text/markdown" },
    { filename: `crm-price-check-${date}.csv`, content: csv, contentType: "text/csv" },
  ],
});
if (!result.success) {
  console.error(`EMAIL FAILED: ${result.error ?? "unknown error"}`);
  process.exit(1);
}
console.log(`EMAILED report to ${to}`);
process.exit(0);
