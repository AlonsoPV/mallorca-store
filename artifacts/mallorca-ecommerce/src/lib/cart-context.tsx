import { createContext, useContext, useRef, useState, ReactNode } from "react";
import { persistSelectedBranchId, readStoredBranchId } from "@/lib/branch-flow";

export type StorefrontFulfillmentMethod = "pickup" | "delivery";

interface CartContextType {
  cartId: string | null;
  branchId: number | null;
  selectedDate: string | null;
  selectedTime: string | null;
  fulfillmentMethod: StorefrontFulfillmentMethod;
  miniCartOpen: boolean;
  branchPickerOpen: boolean;
  setBranchId: (branchId: number | null) => void;
  setFulfillmentContext: (date: string, time: string) => void;
  clearFulfillmentContext: () => void;
  setFulfillmentMethod: (method: StorefrontFulfillmentMethod) => void;
  setCartSession: (cartId: string | null, branchId: number | null) => void;
  clearCartSession: () => void;
  openMiniCart: () => void;
  closeMiniCart: () => void;
  setMiniCartOpen: (open: boolean) => void;
  openBranchPicker: () => Promise<number | null>;
  notifyBranchPicked: (branchId: number | null) => void;
  setBranchPickerOpen: (open: boolean) => void;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

function readFulfillmentMethod(): StorefrontFulfillmentMethod {
  if (typeof window === "undefined") return "pickup";
  const stored = localStorage.getItem("mallorca_fulfillment_method")
    ?? sessionStorage.getItem("mallorca_fulfillment_method");
  return stored === "delivery" ? "delivery" : "pickup";
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [cartId, setCartId] = useState<string | null>(() =>
    typeof window === "undefined" ? null : localStorage.getItem("mallorca_cart_id"),
  );
  const [branchId, setBranchId] = useState<number | null>(() =>
    typeof window === "undefined" ? null : readStoredBranchId(localStorage),
  );
  const [selectedDate, setSelectedDate] = useState<string | null>(() =>
    typeof window === "undefined"
      ? null
      : localStorage.getItem("mallorca_selected_date") ?? sessionStorage.getItem("mallorca_selected_date"),
  );
  const [selectedTime, setSelectedTime] = useState<string | null>(() =>
    typeof window === "undefined"
      ? null
      : localStorage.getItem("mallorca_selected_time") ?? sessionStorage.getItem("mallorca_selected_time"),
  );
  const [fulfillmentMethod, setFulfillmentMethodState] = useState<StorefrontFulfillmentMethod>(readFulfillmentMethod);
  const [miniCartOpen, setMiniCartOpen] = useState(false);
  const [branchPickerOpen, setBranchPickerOpen] = useState(false);
  const branchWaiters = useRef<Array<(branchId: number | null) => void>>([]);

  const setCartSession = (newCartId: string | null, newBranchId: number | null) => {
    setCartId(newCartId);
    if (newBranchId !== branchId) {
      setSelectedDate(null);
      setSelectedTime(null);
      localStorage.removeItem("mallorca_selected_date");
      localStorage.removeItem("mallorca_selected_time");
      sessionStorage.removeItem("mallorca_selected_date");
      sessionStorage.removeItem("mallorca_selected_time");
    }
    setBranchId(newBranchId);

    if (newCartId) {
      localStorage.setItem("mallorca_cart_id", newCartId);
    } else {
      localStorage.removeItem("mallorca_cart_id");
    }
    persistSelectedBranchId(localStorage, newBranchId);
  };

  const setSelectedBranch = (newBranchId: number | null) => {
    if (newBranchId !== branchId) {
      setSelectedDate(null);
      setSelectedTime(null);
      localStorage.removeItem("mallorca_selected_date");
      localStorage.removeItem("mallorca_selected_time");
      sessionStorage.removeItem("mallorca_selected_date");
      sessionStorage.removeItem("mallorca_selected_time");
    }
    setBranchId(newBranchId);
    persistSelectedBranchId(localStorage, newBranchId);
  };

  const setFulfillmentContext = (date: string, time: string) => {
    setSelectedDate(date);
    setSelectedTime(time);
    localStorage.setItem("mallorca_selected_date", date);
    localStorage.setItem("mallorca_selected_time", time);
    sessionStorage.setItem("mallorca_selected_date", date);
    sessionStorage.setItem("mallorca_selected_time", time);
  };

  const clearFulfillmentContext = () => {
    setSelectedDate(null);
    setSelectedTime(null);
    localStorage.removeItem("mallorca_selected_date");
    localStorage.removeItem("mallorca_selected_time");
    sessionStorage.removeItem("mallorca_selected_date");
    sessionStorage.removeItem("mallorca_selected_time");
  };

  const setFulfillmentMethod = (method: StorefrontFulfillmentMethod) => {
    setFulfillmentMethodState(method);
    localStorage.setItem("mallorca_fulfillment_method", method);
    sessionStorage.setItem("mallorca_fulfillment_method", method);
  };

  const clearCartSession = () => {
    setCartId(null);
    localStorage.removeItem("mallorca_cart_id");
    clearFulfillmentContext();
  };

  const notifyBranchPicked = (pickedBranchId: number | null) => {
    const waiters = branchWaiters.current.splice(0);
    waiters.forEach((resolve) => resolve(pickedBranchId));
    setBranchPickerOpen(false);
  };

  const openBranchPicker = () => {
    setBranchPickerOpen(true);
    return new Promise<number | null>((resolve) => {
      branchWaiters.current.push(resolve);
    });
  };

  return (
    <CartContext.Provider
      value={{
        cartId,
        branchId,
        selectedDate,
        selectedTime,
        fulfillmentMethod,
        miniCartOpen,
        branchPickerOpen,
        setBranchId: setSelectedBranch,
        setFulfillmentContext,
        clearFulfillmentContext,
        setFulfillmentMethod,
        setCartSession,
        clearCartSession,
        openMiniCart: () => setMiniCartOpen(true),
        closeMiniCart: () => setMiniCartOpen(false),
        setMiniCartOpen,
        openBranchPicker,
        notifyBranchPicked,
        setBranchPickerOpen,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);
  if (context === undefined) {
    throw new Error("useCart must be used within a CartProvider");
  }
  return context;
}
