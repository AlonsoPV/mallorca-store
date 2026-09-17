import { useEffect } from "react";
import { StoreLayout } from "@/components/layout/store-layout";
import { useCart } from "@/lib/cart-context";
import { useGetCart, useUpdateCartItem, useDeleteCartItem, getGetCartQueryKey } from "@workspace/api-client-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Trash2, Plus, Minus, ArrowRight, ShoppingBag } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { formatMxn } from "@/lib/availability-copy";
import { track } from "@/lib/analytics";
import { ImageWithFallback } from "@/components/image-with-fallback";

export default function CartPage() {
  const { cartId } = useCart();
  const { data: cart, isLoading } = useGetCart(cartId!, {
    query: { enabled: !!cartId, queryKey: getGetCartQueryKey(cartId!) }
  });
  const updateCartItem = useUpdateCartItem();
  const deleteCartItem = useDeleteCartItem();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  useEffect(() => {
    if (cart) track("view_cart", { source: "cart_page", quantity: cart.quantity, value: cart.subtotal });
  }, [cart?.id, cart?.quantity, cart?.subtotal]);

  const handleUpdateQuantity = async (itemId: number, newQuantity: number) => {
    if (newQuantity < 1) return;
    try {
      await updateCartItem.mutateAsync({
        id: cartId!,
        itemId,
        data: { quantity: newQuantity }
      });
      queryClient.invalidateQueries({ queryKey: getGetCartQueryKey(cartId!) });
    } catch (err: any) {
      toast({
        title: "Error",
        description: err?.message || "No se pudo actualizar la cantidad.",
        variant: "destructive"
      });
    }
  };

  const handleDeleteItem = async (itemId: number) => {
    try {
      await deleteCartItem.mutateAsync({ id: cartId!, itemId });
      queryClient.invalidateQueries({ queryKey: getGetCartQueryKey(cartId!) });
    } catch (err: any) {
      toast({
        title: "Error",
        description: "No se pudo eliminar el producto.",
        variant: "destructive"
      });
    }
  };

  if (isLoading) {
    return (
      <StoreLayout>
        <div className="container mx-auto px-4 py-16 animate-pulse">
          <div className="h-10 bg-muted w-1/3 mb-10" />
          <div className="space-y-6">
            <div className="h-32 bg-muted w-full" />
            <div className="h-32 bg-muted w-full" />
          </div>
        </div>
      </StoreLayout>
    );
  }

  if (!cart || cart.items.length === 0) {
    return (
      <StoreLayout>
        <div className="container mx-auto px-4 py-32 text-center flex flex-col items-center">
          <ShoppingBag className="mb-6 h-16 w-16 text-primary opacity-30" />
          <span className="mallorca-kicker text-primary">Tu bolsa</span>
          <h2 className="mallorca-display mb-4 mt-3 text-4xl md:text-5xl">Está un poco triste.</h2>
          <p className="mb-10 max-w-md text-muted-foreground">Vamos a arreglarlo con algo recién horneado.</p>
          <Button asChild size="lg" className="h-14 rounded-none bg-primary px-8 text-base text-primary-foreground hover:bg-primary/90">
            <Link href="/tienda">Seguir descubriendo</Link>
          </Button>
        </div>
      </StoreLayout>
    );
  }

  return (
    <StoreLayout>
      <div className="container mx-auto px-4 py-8 md:py-12 pb-28 lg:pb-12">
        <span className="mallorca-kicker text-primary">Casi listo</span>
        <h1 className="mallorca-display mb-6 mt-2 text-3xl md:text-4xl">Tu bolsa</h1>
        
        <div className="flex flex-col lg:flex-row gap-8 lg:gap-16">
          <div className="w-full lg:w-2/3">
              <div className="mb-4 flex items-center justify-between border-y border-border py-3">
              <div className="text-sm">
                Tu Mallorca: <span className="font-bold text-primary">{cart.branch.name}</span>
              </div>
            </div>

            <div className="border-t border-border">
              {cart.items.map((item) => (
                <div key={item.id} className="py-5 border-b border-border flex items-start gap-4">
                  <div className="h-20 w-20 shrink-0 overflow-hidden bg-secondary">
                    {item.imageUrl ? (
                      <ImageWithFallback src={item.imageUrl} alt={item.name} className="h-full w-full object-cover" />
                    ) : (
                      <ShoppingBag className="m-auto mt-6 h-6 w-6 text-muted-foreground" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-serif text-lg leading-tight text-foreground">{item.name}</h3>
                    {item.variantLabel && (
                      <p className="text-sm text-muted-foreground mt-1">Opción: {item.variantLabel}</p>
                    )}
                    <p className="text-sm font-medium mt-1">
                      {item.savings ? (
                        <>
                          <span className="text-muted-foreground line-through mr-2">{formatMxn(item.listUnitPrice ?? item.unitPrice)}</span>
                          {formatMxn(item.unitPrice)}
                        </>
                      ) : formatMxn(item.unitPrice)}
                    </p>
                    <div className="mt-3 flex items-center justify-between gap-4">
                      <div className="flex h-9 items-center border border-border">
                        <button 
                          onClick={() => handleUpdateQuantity(item.id, item.quantity - 1)}
                          className="w-9 h-full flex items-center justify-center text-foreground hover:bg-muted transition-colors"
                          disabled={updateCartItem.isPending}
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="w-8 text-center font-medium text-sm">{item.quantity}</span>
                        <button 
                          onClick={() => handleUpdateQuantity(item.id, item.quantity + 1)}
                          className="w-9 h-full flex items-center justify-center text-foreground hover:bg-muted transition-colors"
                          disabled={updateCartItem.isPending}
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>
                      <div className="flex items-center gap-3">
                        <p className="font-medium">{formatMxn(item.lineTotal)}</p>
                        <button 
                          onClick={() => handleDeleteItem(item.id)}
                          className="text-muted-foreground hover:text-destructive transition-colors p-1"
                          disabled={deleteCartItem.isPending}
                        >
                          <Trash2 className="w-4 h-4" />
                          <span className="sr-only">Eliminar</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="hidden w-full lg:block lg:w-1/3">
            <div className="bg-secondary/30 border border-border p-6 sticky top-24">
              <h2 className="mallorca-display mb-5 border-b border-border pb-3 text-2xl">Tu pedido</h2>
              <div className="space-y-3 mb-6 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span>{formatMxn(cart.subtotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Artículos</span>
                  <span>{cart.quantity}</span>
                </div>
              </div>
              <div className="border-t border-border pt-4 mb-6 flex justify-between items-center">
                <span className="font-serif text-lg">Total estimado</span>
                <span className="font-serif text-2xl">{formatMxn(cart.subtotal)}</span>
              </div>
              <Button asChild size="lg" className="w-full h-12 rounded-none bg-primary text-primary-foreground hover:bg-primary/90 text-base">
                <Link href="/checkout" className="flex items-center justify-center gap-2">
                  Pasar a entrega
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </div>
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 p-3 backdrop-blur lg:hidden">
        <div className="mb-2 flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Subtotal · {cart.branch.name}</span>
          <span className="font-serif text-lg">{formatMxn(cart.subtotal)}</span>
        </div>
        <Button asChild className="h-12 w-full rounded-md bg-primary text-primary-foreground">
          <Link href="/checkout">Pasar a entrega</Link>
        </Button>
      </div>
    </StoreLayout>
  );
}
