import { useEffect } from "react";
import { Link } from "wouter";
import { ArrowUpRight, Minus, Plus, ShoppingBag, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ImageWithFallback } from "@/components/image-with-fallback";
import { useCart } from "@/lib/cart-context";
import { formatMxn } from "@/lib/availability-copy";
import { track } from "@/lib/analytics";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { isCartNotFoundError } from "@/lib/cart-recovery";
import {
  getGetCartQueryKey,
  useDeleteCartItem,
  useGetCart,
  useUpdateCartItem,
} from "@workspace/api-client-react";

export function MiniCart() {
  const { cartId, miniCartOpen, setMiniCartOpen, closeMiniCart, clearCartSession } = useCart();
  const { data: cart, isError: cartError, error: cartErrorValue } = useGetCart(cartId!, {
    query: {
      enabled: !!cartId,
      queryKey: getGetCartQueryKey(cartId!),
      retry: false,
    },
  });
  const updateCartItem = useUpdateCartItem();
  const deleteCartItem = useDeleteCartItem();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  useEffect(() => {
    if (!cartId || !cartError || !isCartNotFoundError(cartErrorValue)) return;
    clearCartSession();
    queryClient.removeQueries({ queryKey: getGetCartQueryKey(cartId) });
  }, [cartId, cartError, cartErrorValue, clearCartSession, queryClient]);

  useEffect(() => {
    if (miniCartOpen) {
      track("view_cart", { source: "mini_cart", quantity: cart?.quantity ?? 0, value: cart?.subtotal ?? 0 });
    }
  }, [miniCartOpen, cart?.quantity, cart?.subtotal]);

  const refreshCart = () => {
    if (cartId) queryClient.invalidateQueries({ queryKey: getGetCartQueryKey(cartId) });
  };

  const handleUpdateQuantity = async (itemId: number, quantity: number) => {
    if (!cartId || quantity < 1) return;
    try {
      await updateCartItem.mutateAsync({ id: cartId, itemId, data: { quantity } });
      refreshCart();
    } catch (error: any) {
      toast({ title: "No pudimos actualizar", description: error?.message || "Revisa el inventario disponible.", variant: "destructive" });
    }
  };

  const handleDeleteItem = async (itemId: number) => {
    if (!cartId) return;
    try {
      await deleteCartItem.mutateAsync({ id: cartId, itemId });
      refreshCart();
    } catch (error: any) {
      toast({ title: "No pudimos eliminarlo", description: error?.message || "Intenta de nuevo.", variant: "destructive" });
    }
  };

  return (
    <Sheet open={miniCartOpen} onOpenChange={setMiniCartOpen}>
      <SheetContent className="flex h-full w-full flex-col border-l border-border bg-[var(--mallorca-white)] sm:max-w-md">
        <SheetHeader className="border-b border-border pb-5 pr-8 text-left">
          <SheetTitle className="mallorca-display text-4xl">Tu bolsa</SheetTitle>
          <SheetDescription>
            {cart ? `Preparando en ${cart.branch.name}` : "Todavía no has elegido qué llevarte."}
          </SheetDescription>
        </SheetHeader>
        {cart && cart.items.length > 0 ? (
          <>
            <div className="flex-1 divide-y divide-border overflow-y-auto py-2">
              {cart.items.map((item) => (
                <div key={item.id} className="flex items-start gap-3 py-5">
                  {item.imageUrl ? (
                    <div className="h-16 w-16 shrink-0 overflow-hidden bg-secondary">
                      <ImageWithFallback
                        src={item.imageUrl}
                        alt={item.name}
                        className="h-full w-full object-cover"
                        fallback={<ShoppingBag className="m-auto h-5 w-5 text-muted-foreground" />}
                      />
                    </div>
                  ) : null}
                  <div className="min-w-0 flex-1">
                    <p className="font-serif text-xl leading-tight">{item.name}</p>
                    {item.variantLabel && <p className="mt-1 text-xs text-muted-foreground">{item.variantLabel}</p>}
                    <p className="mt-2 text-sm text-muted-foreground">
                      {item.savings ? (
                        <>
                          <span className="line-through mr-2">{formatMxn(item.listUnitPrice ?? item.unitPrice)}</span>
                          {formatMxn(item.unitPrice)}
                        </>
                      ) : formatMxn(item.unitPrice)}
                    </p>
                    <div className="mt-3 flex items-center gap-3">
                      <div className="flex h-8 items-center border border-border">
                        <button
                          type="button"
                          className="flex h-full w-8 items-center justify-center hover:bg-muted"
                          onClick={() => handleUpdateQuantity(item.id, item.quantity - 1)}
                          disabled={updateCartItem.isPending || item.quantity <= 1}
                          aria-label="Quitar uno"
                        >
                          <Minus className="h-3 w-3" />
                        </button>
                        <span className="w-8 text-center text-sm font-medium">{item.quantity}</span>
                        <button
                          type="button"
                          className="flex h-full w-8 items-center justify-center hover:bg-muted"
                          onClick={() => handleUpdateQuantity(item.id, item.quantity + 1)}
                          disabled={updateCartItem.isPending}
                          aria-label="Añadir uno"
                        >
                          <Plus className="h-3 w-3" />
                        </button>
                      </div>
                      <button
                        type="button"
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() => handleDeleteItem(item.id)}
                        disabled={deleteCartItem.isPending}
                        aria-label={`Eliminar ${item.name}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  <span className="text-sm font-medium">{formatMxn(item.lineTotal)}</span>
                </div>
              ))}
            </div>
            <div className="border-t border-border pt-5">
              <div className="mb-5 flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Subtotal</span>
                <span className="font-serif text-2xl">{formatMxn(cart.subtotal)}</span>
              </div>
              <Button asChild className="h-12 w-full rounded-md bg-[var(--mallorca-red)] text-white hover:bg-[var(--mallorca-red-dark)]" onClick={closeMiniCart}>
                <Link href="/checkout">Continuar con mi pedido <ArrowUpRight className="ml-2 h-4 w-4" /></Link>
              </Button>
              <Button type="button" variant="ghost" className="mt-2 h-11 w-full rounded-md" onClick={closeMiniCart}>
                Seguir comprando
              </Button>
            </div>
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center py-16 text-center">
            <ShoppingBag className="mb-5 h-12 w-12 text-[var(--mallorca-red)]/30" />
            <p className="font-serif text-2xl">Tu bolsa está esperando.</p>
            <p className="mt-2 max-w-xs text-sm text-muted-foreground">Elige algo recién horneado y lo preparamos para ti.</p>
            <Button asChild className="mt-7 rounded-md bg-[var(--mallorca-red)] text-white hover:bg-[var(--mallorca-red-dark)]" onClick={closeMiniCart}>
              <Link href="/tienda">Ver pastelería</Link>
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
