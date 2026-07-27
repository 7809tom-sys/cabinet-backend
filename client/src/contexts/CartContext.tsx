import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { canAddToCart } from "@shared/familyLock";

export type CartItem = {
  masterCode: string;
  name: string;
  styleId: number;
  styleLabel: string;
  distributorId: number | null;
  tier: import("@shared/pricingTier").PricingTier;
  unitPrice: number | null; // null = quoted later
  qty: number;
  // Optional bundle grouping (e.g. a Split Pantry made of a top + bottom part).
  // Both parts share the same bundleId so the cart UI can group them under one
  // heading; pricing/keying stay per-part. `bundleRole` marks top vs bottom.
  bundleId?: string;
  bundleLabel?: string;
  bundleRole?: "top" | "bottom";
  /** Explanation of box-quantity calculation (e.g. "30 sq ft × 15% → 4 boxes") */
  qtyNote?: string;
  /** Product image URL (for pelican products, surfaces, etc.) */
  imageUrl?: string | null;
  /** Catalog image URL for cabinet products (from catalogImageUrl field) */
  catalogImageUrl?: string | null;
  /** Product category (e.g. "Sinks & Faucets", "Flooring") — used for display grouping */
  category?: string | null;
};

// Result of an addItem attempt. The cart is locked to ONE DISTRIBUTOR (supply
// line) — NOT one door style/color. Colors and door styles mix freely within a
// distributor (two-tone kitchens are a first-class feature). The first item
// added sets the distributor lock; later items from a DIFFERENT distributor are
// rejected at add time (cross-distributor mixing breaks pricing/freight).
export type AddItemResult =
  | { ok: true }
  | {
      ok: false;
      reason: "distributor_locked";
      lockedDistributorId: number;
      lockedStyleLabel: string;
    };

type CartState = {
  items: CartItem[];
  zip: string | null;
  /** The distributor (supply line) the cart is currently locked to (null when empty). */
  lockedDistributorId: number | null;
  /** The door-style family of the FIRST item, kept only for friendly messages. */
  lockedStyleId: number | null;
  lockedStyleLabel: string | null;
  addItem: (item: CartItem) => AddItemResult;
  removeItem: (masterCode: string, styleId: number, tier: CartItem["tier"]) => void;
  setQty: (masterCode: string, styleId: number, tier: CartItem["tier"], qty: number) => void;
  clear: () => void;
  setZip: (zip: string | null) => void;
  count: number;
  subtotal: number;
};

const CartContext = createContext<CartState | null>(null);

const STORAGE_KEY = "cd_cart_v1";
const ZIP_KEY = "cd_cart_zip_v1";

function lineKey(
  i: Pick<CartItem, "masterCode" | "styleId" | "tier"> & { bundleId?: string },
) {
  // Bundle parts are keyed with their bundleId so two different Split Pantries
  // (or a loose part vs a bundled part) never collapse into one line.
  return `${i.masterCode}::${i.styleId}::${i.tier}::${i.bundleId ?? ""}`;
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>(() => {
    try {
      const raw = typeof localStorage !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
      return raw ? (JSON.parse(raw) as CartItem[]) : [];
    } catch {
      return [];
    }
  });
  const [zip, setZipState] = useState<string | null>(() => {
    try {
      return typeof localStorage !== "undefined" ? localStorage.getItem(ZIP_KEY) : null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {
      /* ignore quota / privacy-mode errors */
    }
  }, [items]);

  useEffect(() => {
    try {
      if (zip) localStorage.setItem(ZIP_KEY, zip);
      else localStorage.removeItem(ZIP_KEY);
    } catch {
      /* ignore */
    }
  }, [zip]);

  // The cart's lock is the DISTRIBUTOR of whatever is already in it. Style/color
  // are kept only for friendly messaging — they do NOT constrain adds.
  // NOTE: Only items WITH a distributorId participate in the lock. Pelican
  // products (faucets, sinks, surfaces) have distributorId = null and are
  // always allowed — they don't set or break the lock.
  const firstCabinetItem = items.find((i) => i.distributorId != null) ?? null;
  const lockedDistributorId = firstCabinetItem?.distributorId ?? null;
  const lockedStyleId = firstCabinetItem?.styleId ?? null;
  const lockedStyleLabel = firstCabinetItem?.styleLabel ?? null;

  const api = useMemo<CartState>(() => {
    const addItem = (item: CartItem): AddItemResult => {
      // Distributor-lock enforcement (pure rule in shared/familyLock.ts): colors
      // and door styles mix freely, but every line must come from the SAME
      // distributor. Reject only when the incoming item is from a DIFFERENT
      // distributor than what's already in the cart.
      //
      // Items with distributorId = null (pelican products, surfaces, accessories)
      // are ALWAYS allowed — they bypass the lock entirely.
      const decision = canAddToCart(
        lockedDistributorId,
        item.distributorId
      );
      if (!decision.ok && lockedDistributorId != null) {
        return {
          ok: false,
          reason: "distributor_locked",
          lockedDistributorId,
          lockedStyleLabel: lockedStyleLabel ?? "",
        };
      }
      setItems((prev) => {
        const k = lineKey(item);
        const existing = prev.find((p) => lineKey(p) === k);
        if (existing) {
          return prev.map((p) => (lineKey(p) === k ? { ...p, qty: p.qty + item.qty } : p));
        }
        return [...prev, item];
      });
      return { ok: true };
    };
    const removeItem: CartState["removeItem"] = (masterCode, styleId, tier) => {
      setItems((prev) => {
        const target = prev.find(
          (p) => p.masterCode === masterCode && p.styleId === styleId && p.tier === tier,
        );
        // Removing one part of a Split Pantry removes the whole bundle group.
        if (target?.bundleId) {
          return prev.filter((p) => p.bundleId !== target.bundleId);
        }
        return prev.filter(
          (p) => !(p.masterCode === masterCode && p.styleId === styleId && p.tier === tier && !p.bundleId),
        );
      });
    };
    const setQty: CartState["setQty"] = (masterCode, styleId, tier, qty) => {
      setItems((prev) => {
        const target = prev.find(
          (p) => p.masterCode === masterCode && p.styleId === styleId && p.tier === tier,
        );
        const next = Math.max(0, qty);
        // A Split Pantry's two parts move together (1 pantry = 1 top + 1 bottom).
        if (target?.bundleId) {
          return prev
            .map((p) => (p.bundleId === target.bundleId ? { ...p, qty: next } : p))
            .filter((p) => p.qty > 0);
        }
        return prev
          .map((p) =>
            p.masterCode === masterCode && p.styleId === styleId && p.tier === tier && !p.bundleId
              ? { ...p, qty: next }
              : p,
          )
          .filter((p) => p.qty > 0);
      });
    };
    const clear = () => setItems([]);
    const setZip = (z: string | null) => setZipState(z);

    const count = items.reduce((n, i) => n + i.qty, 0);
    const subtotal = items.reduce((s, i) => s + (i.unitPrice ?? 0) * i.qty, 0);

    return {
      items,
      zip,
      lockedDistributorId,
      lockedStyleId,
      lockedStyleLabel,
      addItem,
      removeItem,
      setQty,
      clear,
      setZip,
      count,
      subtotal,
    };
  }, [items, zip, lockedDistributorId, lockedStyleId, lockedStyleLabel]);

  return <CartContext.Provider value={api}>{children}</CartContext.Provider>;
}

export function useCart(): CartState {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within a CartProvider");
  return ctx;
}
