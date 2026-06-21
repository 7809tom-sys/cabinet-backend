import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type CartItem = {
  masterCode: string;
  name: string;
  styleId: number;
  styleLabel: string;
  distributorId: number | null;
  tier: "Wholesale" | "Contractor";
  unitPrice: number | null; // null = quoted later
  qty: number;
};

type CartState = {
  items: CartItem[];
  zip: string | null;
  addItem: (item: CartItem) => void;
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

  const api = useMemo<CartState>(() => {
    const addItem = (item: CartItem) => {
      setItems((prev) => {
        const k = lineKey(item);
        const existing = prev.find((p) => lineKey(p) === k);
        if (existing) {
          return prev.map((p) => (lineKey(p) === k ? { ...p, qty: p.qty + item.qty } : p));
        }
        return [...prev, item];
      });
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

    return { items, zip, addItem, removeItem, setQty, clear, setZip, count, subtotal };
  }, [items, zip]);

  return <CartContext.Provider value={api}>{children}</CartContext.Provider>;
}

export function useCart(): CartState {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within a CartProvider");
  return ctx;
}
