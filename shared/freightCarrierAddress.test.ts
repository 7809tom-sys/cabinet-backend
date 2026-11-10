import { describe, expect, it } from "vitest";
import { buildSpeedshipShopFlowPayload } from "../server/_core/worldwideexpress";
import {
  knownOriginLocality,
  parseStoredOriginAddress,
  postalLocality,
  resolveOriginLocality,
  shopperCarrierAddress,
} from "./freightCarrierAddress";

const pallet = { lengthIn: 48, widthIn: 40, heightIn: 48, weightLbs: 400 };

describe("shopper carrier city and state", () => {
  it("trims the city and normalizes a full or lowercase state to two letters", () => {
    expect(shopperCarrierAddress({
      line1: " 100 Main Street ",
      line2: " Apt 2 ",
      city: "  Dallas ",
      state: "tx",
    })).toEqual({
      locality: "Dallas",
      region: "TX",
      countryCode: "US",
      addressLineList: ["100 Main Street", "Apt 2"],
    });
    expect(shopperCarrierAddress({ city: "Mokena", state: "Illinois" })?.region).toBe("IL");
  });

  it("is missing when the shopper did not enter a city or a real state", () => {
    expect(shopperCarrierAddress(null)).toBeNull();
    expect(shopperCarrierAddress({ city: " ", state: "TX" })).toBeNull();
    expect(shopperCarrierAddress({ city: "Dallas", state: "Texasville" })).toBeNull();
    expect(shopperCarrierAddress({ city: "Dallas", state: "XX" })).toBeNull();
  });
});

describe("origin carrier city and state", () => {
  it("reads the city and state stored on a warehouse address for that ZIP", () => {
    expect(parseStoredOriginAddress(
      "100 Warehouse Rd, Joliet, Illinois 60448",
      "60448",
    )).toMatchObject({
      locality: "Joliet",
      region: "IL",
      addressLineList: ["100 Warehouse Rd"],
    });
    expect(resolveOriginLocality({
      zip: "60448",
      warehouseAddress: "1950 North Norcross-Tucker Rd, Norcross, GA 30071",
      pickupAddress: "100 Warehouse Rd, Joliet, IL 60448",
    })?.locality).toBe("Joliet");
  });

  it("does not use a warehouse address that belongs to a different ZIP", () => {
    expect(parseStoredOriginAddress(
      "1950 North Norcross-Tucker Rd, Norcross, GA 30071",
      "60448",
    )).toBeNull();
    expect(resolveOriginLocality({
      zip: "60448",
      warehouseAddress: "1950 North Norcross-Tucker Rd, Norcross, GA 30071",
    })).toEqual({ locality: "Mokena", region: "IL", countryCode: "US" });
  });

  it("uses the documented postal city when no warehouse address is stored", () => {
    expect(knownOriginLocality("60448")).toEqual({ locality: "Mokena", region: "IL", countryCode: "US" });
    expect(knownOriginLocality("77064")).toEqual({ locality: "Houston", region: "TX", countryCode: "US" });
    expect(knownOriginLocality("75234")).toEqual({ locality: "Dallas", region: "TX", countryCode: "US" });
    expect(knownOriginLocality("30071")?.locality).toBe("Norcross");
    expect(knownOriginLocality("33760")?.locality).toBe("Clearwater");
    expect(resolveOriginLocality({ zip: "60448" })?.locality).toBe("Mokena");
    expect(resolveOriginLocality({ zip: "77064" })?.locality).toBe("Houston");
    expect(resolveOriginLocality({ zip: "75234" })?.region).toBe("TX");
    expect(resolveOriginLocality({ zip: "99999" })).toBeNull();
  });
});

describe("offline ZIP dataset", () => {
  it("resolves origin and destination ZIPs that are not in the named warehouse list", () => {
    expect(postalLocality("10001")).toEqual({ locality: "New York", region: "NY", countryCode: "US" });
    expect(postalLocality("02766")).toEqual({ locality: "Norton", region: "MA", countryCode: "US" });
    expect(postalLocality("33054")).toEqual({ locality: "Opa Locka", region: "FL", countryCode: "US" });
    expect(postalLocality("78701")).toEqual({ locality: "Austin", region: "TX", countryCode: "US" });
    expect(postalLocality("99999")).toBeNull();
  });
});

describe("Worldwide Express address requirement", () => {
  it("sends the request once both cities and states are present", () => {
    expect(() => buildSpeedshipShopFlowPayload({
      fromZip: "60448",
      toZip: "75201",
      pallets: [pallet],
      freightClass: "175",
      fromAddress: knownOriginLocality("60448") ?? undefined,
    })).toThrow(/verified city and state/);

    const payload = buildSpeedshipShopFlowPayload({
      fromZip: "60448",
      toZip: "75201",
      pallets: [pallet],
      freightClass: "175",
      residential: true,
      fromAddress: knownOriginLocality("60448") ?? undefined,
      toAddress: shopperCarrierAddress({ city: "Dallas", state: "TX", line1: "100 Main Street" }) ?? undefined,
    });
    const shipment = payload.request.shipment;
    expect(shipment.originAddress.address.locality).toBe("Mokena");
    expect(shipment.originAddress.address.region).toBe("IL");
    expect(shipment.originAddress.address.postalCode).toBe("60448");
    expect(shipment.destinationAddress.address.locality).toBe("Dallas");
    expect(shipment.destinationAddress.address.region).toBe("TX");
    expect(shipment.destinationAddress.address.postalCode).toBe("75201");
    expect(shipment.destinationAddress.address.addressLineList).toEqual(["100 Main Street"]);
    expect(shipment.destinationAddress.locationType).toBe("RESIDENTIAL");
  });
});
