import { describe, expect, it } from "vitest";
import { checkMailDomainRecords } from "./emailDomainRecords";
import { emailDomain, isFreeMailDomain, ownMailDomain } from "@shared/affiliateEmailDomain";

const missing = () => Object.assign(new Error("nx"), { code: "ENOTFOUND" });

function fake(txtMap: Record<string, string[][]>, cnameMap: Record<string, string[]> = {}) {
  return {
    resolveTxt: async (name: string) => { if (txtMap[name]) return txtMap[name]; throw missing(); },
    resolveCname: async (name: string) => { if (cnameMap[name]) return cnameMap[name]; throw missing(); },
  };
}

describe("checkMailDomainRecords", () => {
  it("finds SPF, DMARC and a CNAME DKIM selector", async () => {
    const result = await checkMailDomainRecords("shop.com", fake(
      { "shop.com": [["v=spf1 include:_spf.mail.hostinger.com ~all"]], "_dmarc.shop.com": [["v=DMARC1; p=none"]] },
      { "hostingermail-a._domainkey.shop.com": ["hostingermail-a.dkim.mail.hostinger.com"] },
    ));
    expect(result).toEqual({ domain: "shop.com", spf: true, dmarc: true, dkimSelector: "hostingermail-a", reliable: true });
  });

  it("reports missing records as missing when DNS answered", async () => {
    const result = await checkMailDomainRecords("shop.com", fake({ "shop.com": [["google-site-verification=abc"]] }));
    expect(result).toMatchObject({ spf: false, dmarc: false, dkimSelector: null, reliable: true });
  });

  it("marks the result unreliable when DNS cannot be reached", async () => {
    const down = {
      resolveTxt: async () => { throw Object.assign(new Error("t"), { code: "ETIMEOUT" }); },
      resolveCname: async () => { throw Object.assign(new Error("t"), { code: "ETIMEOUT" }); },
    };
    expect((await checkMailDomainRecords("shop.com", down)).reliable).toBe(false);
  });
});

describe("mail domain helpers", () => {
  it("separates free mail from an own domain", () => {
    expect(emailDomain("A@Gmail.com")).toBe("gmail.com");
    expect(isFreeMailDomain("googlemail.com")).toBe(true);
    expect(ownMailDomain("me@gmail.com", "rich@reaveswaycabinets.com")).toBe("reaveswaycabinets.com");
    expect(ownMailDomain("me@gmail.com", "")).toBeNull();
    expect(emailDomain("nope")).toBeNull();
  });
});
