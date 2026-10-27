import { afterEach, describe, expect, it } from "vitest";
import {
  decryptW9TaxId,
  encryptW9TaxId,
  isEncryptedW9TaxId,
  maskW9TaxId,
  w9TaxIdLast4,
  W9_TAX_ID_ENCRYPTION_KEY_ENV,
} from "./w9TaxIdCrypto";

const previous = process.env[W9_TAX_ID_ENCRYPTION_KEY_ENV];

afterEach(() => {
  if (previous === undefined) delete process.env[W9_TAX_ID_ENCRYPTION_KEY_ENV];
  else process.env[W9_TAX_ID_ENCRYPTION_KEY_ENV] = previous;
});

describe("W-9 tax ID encryption", () => {
  it("encrypts a tax ID so the stored value is not the plaintext and still reveals only the last four", () => {
    process.env[W9_TAX_ID_ENCRYPTION_KEY_ENV] = "test-only-w9-key-value";
    const plaintext = "123456789";
    const stored = encryptW9TaxId(plaintext);
    expect(isEncryptedW9TaxId(stored)).toBe(true);
    expect(stored).not.toContain(plaintext);
    expect(decryptW9TaxId(stored)).toBe(plaintext);
    expect(w9TaxIdLast4(stored, "6789")).toBe("6789");
    expect(w9TaxIdLast4(stored, null)).toBeNull();
    expect(maskW9TaxId("6789")).toBe("***-**-6789");
  });

  it("refuses to encrypt when the encryption key is missing", () => {
    delete process.env[W9_TAX_ID_ENCRYPTION_KEY_ENV];
    expect(() => encryptW9TaxId("123456789")).toThrow(W9_TAX_ID_ENCRYPTION_KEY_ENV);
  });

  it("reads last four from legacy plaintext only", () => {
    expect(w9TaxIdLast4("123-45-6789", null)).toBe("6789");
    expect(maskW9TaxId("12")).toBeNull();
  });
});
