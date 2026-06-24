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
};

// Result of an addItem attempt. The cart is family-locked: every line must
// share ONE door-style family (styleId). The first item added sets the lock;
// later items from a different family are rejected so the lock is enforced at
// the point of adding (not silently allowed and only caught at checkout).
export type AddItemResult =
  | { ok: true }
  | { ok: false; reason: "family_locked"; lockedStyleId: number; lockedStyleLabel: string };

type CartState = {
  items: CartItem[];
  zip: string | null;
  /** The door-style family the cart is currently locked to (null when empty). */
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

function lineKey(i: Pick<CartItem, "masterCode" | "styleId" | "tier">) {
  return `${i.masterCode}::${i.styleId}::${i.tier}`;
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

  // The cart's locked family is simply the styleId of whatever is already in it.
  const lockedStyleId = items.length > 0 ? items[0].styleId : null;
  const lockedStyleLabel = items.length > 0 ? items[0].styleLabel : null;

  const api = useMemo<CartState>(() => {
    const addItem = (item: CartItem): AddItemResult => {
      // Family-lock enforcement (pure rule in shared/familyLock.ts): if the cart
      // already holds a different door-style family, reject the add. Caller
      // decides how to recover (switch style or start a new cart). An empty cart
      // accepts anything (and sets the lock).
      const current = items[0];
      const decision = canAddToCart(current ? current.styleId : null, item.styleId);
      if (!decision.ok && current) {
        return {
          ok: false,
          reason: "family_locked",
          lockedStyleId: current.styleId,
          lockedStyleLabel: current.styleLabel,
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
      const k = lineKey({ masterCode, styleId, tier });
      setItems((prev) => prev.filter((p) => lineKey(p) !== k));
    };
    const setQty: CartState["setQty"] = (masterCode, styleId, tier, qty) => {
      const k = lineKey({ masterCode, styleId, tier });
      setItems((prev) =>
        prev
          .map((p) => (lineKey(p) === k ? { ...p, qty: Math.max(0, qty) } : p))
          .filter((p) => p.qty > 0)
      );
    };
    const clear = () => setItems([]);
    const setZip = (z: string | null) => setZipState(z);

    const count = items.reduce((n, i) => n + i.qty, 0);
    const subtotal = items.reduce((s, i) => s + (i.unitPrice ?? 0) * i.qty, 0);

    return {
      items,
      zip,
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
  }, [items, zip, lockedStyleId, lockedStyleLabel]);

  return <CartContext.Provider value={api}>{children}</CartContext.Provider>;
}

export function useCart(): CartState {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within a CartProvider");
  return ctx;
}
