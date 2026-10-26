const SECRET_KEYS = new Set([
  "passwordHash",
  "tokenHash",
  "setupToken",
  "w9TaxId",
  "accessToken",
  "refreshToken",
  "clientKey",
  "apiKey",
  "secret",
  "serviceRoleKey",
]);

/** Backup JSON keeps the row shape and strips credential fields. */
export function redactRow(row: Record<string, unknown>): Record<string, unknown> {
  const copy: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (SECRET_KEYS.has(key) || /password|token|secret|apiKey/i.test(key)) {
      copy[key] = value == null ? null : "[redacted]";
      continue;
    }
    copy[key] = value instanceof Date ? value.toISOString() : value;
  }
  return copy;
}
