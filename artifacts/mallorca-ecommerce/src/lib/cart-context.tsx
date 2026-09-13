import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { persistSelectedBranchId, readStoredBranchId } from "@/lib/branch-flow";

interface CartContextType {
  cartId: string | null;
  branchId: number | null;
  selectedDate: string | null;
  selectedTime: string | null;
  setBranchId: (branchId: number | null) => void;
  setFulfillmentContext: (date: string, time: string) => void;
  clearFulfillmentContext: () => void;
  setCartSession: (cartId: string | null, branchId: number | null) => void;
  clearCartSession: () => void;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export function CartProvider({ children }: { children: ReactNode }) {
  const [cartId, setCartId] = useState<string | null>(null);
  const [branchId, setBranchId] = useState<number | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);

  useEffect(() => {
    const storedCartId = localStorage.getItem("mallorca_cart_id");
    const storedDate = sessionStorage.getItem("mallorca_selected_date");
    const storedTime = sessionStorage.getItem("mallorca_selected_time");

    if (storedCartId) setCartId(storedCartId);
    const storedBranchId = readStoredBranchId(localStorage);
    if (storedBranchId !== null) setBranchId(storedBranchId);
    if (storedDate) setSelectedDate(storedDate);
    if (storedTime) setSelectedTime(storedTime);
  }, []);

  const setCartSession = (newCartId: string | null, newBranchId: number | null) => {
    setCartId(newCartId);
    if (newBranchId !== branchId) {
      setSelectedDate(null);
      setSelectedTime(null);
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
      sessionStorage.removeItem("mallorca_selected_date");
      sessionStorage.removeItem("mallorca_selected_time");
    }
    setBranchId(newBranchId);
    persistSelectedBranchId(localStorage, newBranchId);
  };

  const setFulfillmentContext = (date: string, time: string) => {
    setSelectedDate(date);
    setSelectedTime(time);
    sessionStorage.setItem("mallorca_selected_date", date);
    sessionStorage.setItem("mallorca_selected_time", time);
  };

  const clearFulfillmentContext = () => {
    setSelectedDate(null);
    setSelectedTime(null);
    sessionStorage.removeItem("mallorca_selected_date");
    sessionStorage.removeItem("mallorca_selected_time");
  };

  const clearCartSession = () => {
    setCartId(null);
    localStorage.removeItem("mallorca_cart_id");
    clearFulfillmentContext();
  };

  return (
    <CartContext.Provider value={{ cartId, branchId, selectedDate, selectedTime, setBranchId: setSelectedBranch, setFulfillmentContext, clearFulfillmentContext, setCartSession, clearCartSession }}>
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
