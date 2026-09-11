import { createContext, useContext, useEffect, useState, ReactNode } from "react";

interface CartContextType {
  cartId: string | null;
  branchId: number | null;
  setCartSession: (cartId: string | null, branchId: number | null) => void;
  clearCartSession: () => void;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export function CartProvider({ children }: { children: ReactNode }) {
  const [cartId, setCartId] = useState<string | null>(null);
  const [branchId, setBranchId] = useState<number | null>(null);

  useEffect(() => {
    const storedCartId = localStorage.getItem("mallorca_cart_id");
    const storedBranchId = localStorage.getItem("mallorca_branch_id");
    
    if (storedCartId) setCartId(storedCartId);
    if (storedBranchId) setBranchId(parseInt(storedBranchId, 10));
  }, []);

  const setCartSession = (newCartId: string | null, newBranchId: number | null) => {
    setCartId(newCartId);
    setBranchId(newBranchId);
    
    if (newCartId) {
      localStorage.setItem("mallorca_cart_id", newCartId);
    } else {
      localStorage.removeItem("mallorca_cart_id");
    }
    
    if (newBranchId !== null) {
      localStorage.setItem("mallorca_branch_id", newBranchId.toString());
    } else {
      localStorage.removeItem("mallorca_branch_id");
    }
  };

  const clearCartSession = () => {
    setCartId(null);
    setBranchId(null);
    localStorage.removeItem("mallorca_cart_id");
    localStorage.removeItem("mallorca_branch_id");
  };

  return (
    <CartContext.Provider value={{ cartId, branchId, setCartSession, clearCartSession }}>
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
