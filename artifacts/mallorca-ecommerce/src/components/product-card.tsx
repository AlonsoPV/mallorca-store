import type { ProductCard as ProductCardType } from "@workspace/api-client-react";
import { Link } from "wouter";
import { cn } from "@/lib/utils";
import { ArrowUpRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCart } from "@/lib/cart-context";
import { useAddCartItem, useCreateCartSession, getGetCartQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import { ImageWithFallback } from "@/components/image-with-fallback";

interface ProductCardProps {
  product: ProductCardType;
  className?: string;
  showBranchAvailability?: boolean;
}

export function ProductCard({ product, className, showBranchAvailability = false }: ProductCardProps) {
  const { cartId, branchId, setCartSession } = useCart();
  const addCartItem = useAddCartItem();
  const createSession = useCreateCartSession();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [isAdding, setIsAdding] = useState(false);
  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN'
    }).format(price);
  };

  const activeAvailability = branchId
    ? product.availability?.find((availability) => availability.branchId === branchId)
    : undefined;
  const isAvailable = Boolean(
    branchId &&
    activeAvailability?.available &&
    (activeAvailability.inventory ?? 0) > 0,
  );
  const canQuickAdd = Boolean(branchId && activeAvailability?.available && (activeAvailability.inventory ?? 0) > 0);
  const currentPrice = activeAvailability?.price ?? product.price;
  const currentSalePrice = activeAvailability?.salePrice ?? product.salePrice;

  const handleQuickAdd = async (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (!branchId || !canQuickAdd) return;
    setIsAdding(true);
    try {
      let activeCartId = cartId;
      if (!activeCartId) {
        const session = await createSession.mutateAsync({ data: { branchId } });
        activeCartId = session.id;
        setCartSession(session.id, branchId);
      }
      await addCartItem.mutateAsync({ id: activeCartId, data: { productId: product.id, quantity: 1, variantId: null } });
      queryClient.invalidateQueries({ queryKey: getGetCartQueryKey(activeCartId) });
      toast({ title: "Añadido a tu bolsa", description: product.name });
    } catch (error: any) {
      toast({ title: "No pudimos añadirlo", description: error?.message || "Intenta de nuevo.", variant: "destructive" });
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <article className={cn("group flex flex-col", className)}>
      <Link href={`/producto/${product.slug}`} className="block">
        <div className="relative aspect-[4/5] overflow-hidden bg-secondary">
          <ImageWithFallback
            src={product.imageUrl}
            alt={product.name}
            className="mallorca-image h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.025]"
            loading="lazy"
            fallback={<div role="img" aria-label={`${product.name}: imagen no disponible`} className="flex h-full w-full items-center justify-center bg-secondary/50 text-muted-foreground"><span className="font-serif italic text-sm">Imagen no disponible</span></div>}
          />
          
          <div className="absolute left-4 top-4 flex flex-col gap-2">
            {product.featured && (
                <span className="bg-[var(--mallorca-cacao)] px-2 py-1 text-[10px] uppercase tracking-widest text-white">
                Destacado
              </span>
            )}
            {product.seasonal && (
                <span className="bg-[var(--mallorca-cherry)] px-2 py-1 text-[10px] uppercase tracking-widest text-white">
                Temporada
              </span>
            )}
            {branchId && !isAvailable && (
              <span className="bg-background/90 text-foreground text-[10px] uppercase tracking-widest px-2 py-1 backdrop-blur-sm">
                Agotado
              </span>
            )}
          </div>
          <span className="absolute bottom-4 right-4 flex h-10 w-10 translate-y-2 items-center justify-center rounded-full bg-[var(--mallorca-ivory)] text-primary opacity-0 shadow-sm transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100">
            <ArrowUpRight className="h-4 w-4" />
          </span>
        </div>
      </Link>

      <div className="flex flex-1 flex-col pt-4">
        <Link href={`/producto/${product.slug}`} className="block">
          <span className="mallorca-kicker text-primary">{product.categoryName}</span>
          <div className="mb-1 mt-2 flex items-start justify-between gap-2">
             <h3 className="line-clamp-2 font-serif text-base leading-tight text-foreground transition-colors group-hover:text-primary sm:text-xl">
              {product.name}
            </h3>
          </div>
           <p className="mb-3 line-clamp-2 text-[11px] leading-snug text-muted-foreground sm:line-clamp-1 sm:text-sm">
            {product.shortDescription}
          </p>
        </Link>

        <div className="mt-auto flex items-center justify-between gap-3 pt-1">
          <div className="flex items-center gap-2">
            {!branchId ? (
              <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground sm:text-xs">Elige sucursal</span>
            ) : currentSalePrice ? (
              <>
                <span className="text-xs font-medium text-primary sm:text-base">{formatPrice(currentSalePrice)}</span>
                <span className="hidden text-sm text-muted-foreground line-through sm:inline">{formatPrice(currentPrice)}</span>
              </>
            ) : (
               <span className="text-xs font-medium text-foreground sm:text-base">{formatPrice(currentPrice)}</span>
            )}
          </div>
          {canQuickAdd ? (
             <Button type="button" variant="ghost" size="sm" onClick={handleQuickAdd} disabled={isAdding} className="h-8 gap-1 px-1 text-primary hover:bg-primary/10 hover:text-primary sm:h-9 sm:px-2">
              <Plus className="h-4 w-4" />
               <span className="hidden text-xs font-bold tracking-wide sm:inline">{isAdding ? "Añadiendo" : "Añadir"}</span>
            </Button>
          ) : (
             <Link href={`/producto/${product.slug}`} className="editorial-link whitespace-nowrap text-[10px] font-bold tracking-wide text-primary sm:text-xs">
              Ver opciones
            </Link>
          )}
        </div>
      </div>
    </article>
  );
}