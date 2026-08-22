export type CrmCustomerImportRow = {
  contactName: string;
  contactEmail: string | null;
  contactPhone: string | null;
  company: string | null;
  location: string | null;
  notes: string | null;
};

export type ParsedCrmCustomerList = {
  rows: CrmCustomerImportRow[];
  rejected: number;
};

function clean(value: string | undefined): string | null {
  const result = value?.trim() ?? "";
  return result || null;
}

function cell(record: Record<string, string>, aliases: string[]): string | undefined {
  return aliases.map((alias) => record[alias]).find((value) => value != null);
}

/** A small CSV reader for customer lists exported from common spreadsheet tools. */
export function parseCsvRecords(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"') {
      if (quoted && text[index + 1] === '"') { value += '"'; index += 1; }
      else quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(value); value = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      row.push(value); value = "";
      if (row.some((entry) => entry.trim())) rows.push(row);
      row = [];
    } else value += char;
  }
  row.push(value);
  if (row.some((entry) => entry.trim())) rows.push(row);
  return rows;
}

export function parseCrmCustomerListCsv(text: string): ParsedCrmCustomerList {
  const records = parseCsvRecords(text);
  if (records.length < 2) return { rows: [], rejected: records.length ? 0 : 0 };
  const headers = records[0].map((header) => header.trim().toLowerCase().replace(/[^a-z0-9]+/g, ""));
  const seen = new Set<string>();
  const rows: CrmCustomerImportRow[] = [];
  let rejected = 0;
  for (const source of records.slice(1)) {
    const record = Object.fromEntries(headers.map((header, index) => [header, source[index] ?? ""]));
    const contactName = clean(cell(record, ["contactname", "name", "customername", "fullname"]));
    const contactEmail = clean(cell(record, ["email", "emailaddress", "customeremail"]))?.toLowerCase() ?? null;
    const contactPhone = clean(cell(record, ["phone", "telephone", "mobile", "customerphone"]));
    const identity = contactEmail ? `email:${contactEmail}` : contactPhone ? `phone:${contactPhone.replace(/\D/g, "")}` : null;
    if (!identity || !contactName || seen.has(identity)) { rejected += 1; continue; }
    seen.add(identity);
    rows.push({
      contactName,
      contactEmail,
      contactPhone,
      company: clean(cell(record, ["company", "business", "companyname"])),
      location: clean(cell(record, ["location", "city", "zip", "zipcode", "postalcode", "address"])),
      notes: clean(cell(record, ["notes", "note", "comments"])),
    });
  }
  return { rows, rejected };
}

export function crmCustomerImportIdentity(row: Pick<CrmCustomerImportRow, "contactEmail" | "contactPhone">): string | null {
  if (row.contactEmail?.trim()) return `email:${row.contactEmail.trim().toLowerCase()}`;
  const phone = row.contactPhone?.replace(/\D/g, "");
  return phone ? `phone:${phone}` : null;
}
