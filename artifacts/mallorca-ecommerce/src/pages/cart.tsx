import { StoreLayout } from "@/components/layout/store-layout";
import { useCart } from "@/lib/cart-context";
import { useGetCart, useUpdateCartItem, useDeleteCartItem, getGetCartQueryKey } from "@workspace/api-client-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Trash2, Plus, Minus, ArrowRight, ShoppingBag } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

export default function CartPage() {
  const { cartId, branchId } = useCart();
  const { data: cart, isLoading } = useGetCart(cartId!, {
    query: { enabled: !!cartId, queryKey: getGetCartQueryKey(cartId!) }
  });
  const updateCartItem = useUpdateCartItem();
  const deleteCartItem = useDeleteCartItem();
  const queryClient = useQueryClient();
  const { toast } = useToast();

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
        description: "No se pudo actualizar la cantidad.",
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

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN'
    }).format(price);
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
          <h2 className="mallorca-display mb-4 mt-3 text-5xl">Está un poco triste.</h2>
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
      <div className="container mx-auto px-4 py-12 md:py-16">
        <span className="mallorca-kicker text-primary">Casi listo</span>
        <h1 className="mallorca-display mb-12 mt-3 text-5xl md:text-7xl">Tu bolsa.</h1>
        
        <div className="flex flex-col lg:flex-row gap-12 lg:gap-24">
          <div className="w-full lg:w-2/3">
              <div className="mb-6 flex items-center justify-between border-y border-border py-4">
              <div className="text-sm">
                Tu Mallorca: <span className="font-bold text-primary">{cart.branch.name}</span>
              </div>
            </div>

            <div className="border-t border-border">
              {cart.items.map((item) => (
                <div key={item.id} className="py-8 border-b border-border flex flex-col sm:flex-row items-start sm:items-center gap-6">
                  <div className="flex-1">
                    <h3 className="font-serif text-xl mb-1 text-foreground">{item.name}</h3>
                    {item.variantLabel && (
                      <p className="text-sm text-muted-foreground mb-2">Opción: {item.variantLabel}</p>
                    )}
                    <p className="text-lg font-medium">{formatPrice(item.unitPrice)}</p>
                  </div>
                  
                  <div className="flex items-center gap-6 w-full sm:w-auto justify-between sm:justify-end">
                    <div className="flex items-center border border-border h-10">
                      <button 
                        onClick={() => handleUpdateQuantity(item.id, item.quantity - 1)}
                        className="w-10 h-full flex items-center justify-center text-foreground hover:bg-muted transition-colors"
                        disabled={updateCartItem.isPending}
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="w-10 text-center font-medium text-sm">{item.quantity}</span>
                      <button 
                        onClick={() => handleUpdateQuantity(item.id, item.quantity + 1)}
                        className="w-10 h-full flex items-center justify-center text-foreground hover:bg-muted transition-colors"
                        disabled={updateCartItem.isPending}
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                    
                    <div className="text-right w-24">
                      <p className="font-medium text-lg">{formatPrice(item.lineTotal)}</p>
                    </div>

                    <button 
                      onClick={() => handleDeleteItem(item.id)}
                      className="text-muted-foreground hover:text-destructive transition-colors p-2"
                      disabled={deleteCartItem.isPending}
                    >
                      <Trash2 className="w-5 h-5" />
                      <span className="sr-only">Eliminar</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="w-full lg:w-1/3">
            <div className="bg-secondary/30 border border-border p-8 sticky top-24">
              <h2 className="mallorca-display mb-6 border-b border-border pb-4 text-3xl">Tu pedido</h2>
              
              <div className="space-y-4 mb-8 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span>{formatPrice(cart.subtotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Artículos</span>
                  <span>{cart.quantity}</span>
                </div>
              </div>
              
              <div className="border-t border-border pt-6 mb-8 flex justify-between items-center">
                <span className="font-serif text-xl">Total Estimado</span>
                <span className="font-serif text-2xl">{formatPrice(cart.subtotal)}</span>
              </div>
              
              <Button asChild size="lg" className="w-full h-14 rounded-none bg-primary text-primary-foreground hover:bg-primary/90 text-base">
                <Link href="/checkout" className="flex items-center justify-center gap-2">
                  Pasar a entrega
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </StoreLayout>
  );
}
