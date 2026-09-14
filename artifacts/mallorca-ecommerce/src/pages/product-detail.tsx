import { StoreLayout } from "@/components/layout/store-layout";
import { ImageWithFallback } from "@/components/image-with-fallback";
import { useGetProduct, useAddCartItem, useCreateCartSession, getGetCartQueryKey, getGetProductQueryKey } from "@workspace/api-client-react";
import { useParams, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Plus, Minus, Info, AlertCircle, ShoppingBag } from "lucide-react";
import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import { useCart } from "@/lib/cart-context";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

export default function ProductDetail() {
  const { slug } = useParams<{ slug: string }>();
  const { branchId, selectedDate, selectedTime } = useCart();
  const productParams = branchId ? { branchId } : undefined;
  const { data: product, isLoading, isError } = useGetProduct(slug || "", productParams, {
    query: {
      enabled: Boolean(slug && branchId && selectedDate && selectedTime),
      queryKey: getGetProductQueryKey(slug || "", productParams),
    },
  });
  const [quantity, setQuantity] = useState(1);
  const [selectedVariant, setSelectedVariant] = useState<number | null>(null);
  
  const { cartId, setCartSession } = useCart();
  
  const addCartItem = useAddCartItem();
  const createSession = useCreateCartSession();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // If a branch is selected, make sure we only show price/availability for that branch.
  const currentBranchAvailability = useMemo(() => {
    if (!product || !branchId) return null;
    return product.availability.find(a => a.branchId === branchId);
  }, [product, branchId]);

  if (isLoading) {
    return (
      <StoreLayout>
        <div className="container mx-auto px-4 py-12 md:py-24 animate-pulse">
          <div className="flex flex-col md:flex-row gap-12 lg:gap-24">
            <div className="w-full md:w-1/2 aspect-[4/5] bg-muted" />
            <div className="w-full md:w-1/2 space-y-6">
              <div className="h-10 bg-muted w-3/4" />
              <div className="h-6 bg-muted w-1/4" />
              <div className="h-24 bg-muted w-full mt-8" />
              <div className="h-12 bg-muted w-full mt-8" />
            </div>
          </div>
        </div>
      </StoreLayout>
    );
  }

  if (isError || !product) {
    return (
      <StoreLayout>
        <div className="container mx-auto px-4 py-32 text-center">
          <h2 className="font-serif text-3xl mb-4">Producto no encontrado</h2>
          <p className="text-muted-foreground mb-8">El producto que buscas no existe o ha sido retirado.</p>
          <Button asChild className="rounded-none">
            <Link href="/tienda">Volver a la tienda</Link>
          </Button>
        </div>
      </StoreLayout>
    );
  }

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN'
    }).format(price);
  };

  const selectedVariantData = selectedVariant
    ? product.variants.find((variant) => variant.id === selectedVariant)
    : undefined;
  const currentBasePrice = selectedVariantData?.price
    ?? currentBranchAvailability?.price
    ?? product.price;
  const currentSalePrice = selectedVariantData?.salePrice
    ?? (selectedVariantData ? null : currentBranchAvailability?.salePrice ?? product.salePrice);
  const currentPrice = currentSalePrice ?? currentBasePrice;
  const currentSavings = currentSalePrice == null
    ? 0
    : Math.round((currentBasePrice - currentSalePrice) * 100) / 100;
  const scheduleAvailable = Boolean(
    selectedTime &&
    currentBranchAvailability &&
    new Date(selectedTime).getTime() >=
      Date.now() +
        Math.max(
          product.minimumLeadTimeHours * 60,
          currentBranchAvailability.preparationTimeMinutes,
        ) *
        60_000,
  );

  const handleAddToCart = async () => {
    if (!branchId) {
      toast({
        title: "Selecciona una sucursal",
        description: "Necesitamos saber en qué sucursal recogerás o desde dónde enviaremos tu pedido.",
        variant: "destructive"
      });
      return;
    }

    try {
      let activeCartId = cartId;
      
      if (!activeCartId) {
        const session = await createSession.mutateAsync({
          data: { branchId },
        });
        activeCartId = session.id;
        setCartSession(session.id, branchId);
      }

      await addCartItem.mutateAsync({
        id: activeCartId,
        data: {
          productId: product.id,
          variantId: selectedVariant,
          quantity
        }
      });

      queryClient.invalidateQueries({ queryKey: getGetCartQueryKey(activeCartId) });

      toast({
        title: "Agregado al carrito",
        description: `${quantity}x ${product.name} agregado exitosamente.`,
      });
      
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message || "No se pudo agregar el producto al carrito.",
        variant: "destructive"
      });
    }
  };

  return (
    <StoreLayout>
      <div className="container mx-auto px-4 py-8 md:py-16">
        <Link href="/tienda" className="editorial-link mb-8 text-sm font-medium text-muted-foreground hover:text-primary">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Volver al catálogo
        </Link>

        <div className="flex flex-col gap-12 md:flex-row lg:gap-20">
          {/* Images */}
          <div className="w-full md:w-[55%]">
            <div className="mallorca-paper-edge relative aspect-[0.86] overflow-hidden bg-secondary">
              <ImageWithFallback
                src={product.imageUrl}
                alt={product.name}
                className="h-full w-full object-cover transition-transform duration-700 hover:scale-[1.03]"
                fallback={<div role="img" aria-label={`${product.name}: imagen no disponible`} className="flex h-full w-full items-center justify-center text-muted-foreground"><span className="font-serif italic text-lg">Imagen no disponible</span></div>}
              />
            </div>
            
            {product.gallery && product.gallery.length > 0 && (
              <div className="mt-4 grid grid-cols-4 gap-3">
                {product.gallery.map((img, i) => (
                    <div key={i} className="aspect-square bg-secondary cursor-pointer hover:opacity-80 transition-opacity">
                      <ImageWithFallback
                        src={img}
                        alt={`${product.name} ${i + 1}`}
                        className="h-full w-full object-cover"
                        fallback={<div role="img" aria-label={`${product.name} imagen ${i + 1}: imagen no disponible`} className="flex h-full w-full items-center justify-center text-center text-[10px] text-muted-foreground">Imagen no disponible</div>}
                      />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Details */}
          <div className="w-full md:sticky md:top-24 md:flex md:h-fit md:w-[45%] md:flex-col">
            <div className="mallorca-kicker mb-3 flex items-center gap-2 text-primary">
              <Link href={`/tienda?categorySlug=${product.categorySlug}`} className="hover:text-primary transition-colors">
                {product.categoryName}
              </Link>
            </div>
            
            <h1 className="mallorca-display text-5xl leading-[0.9] text-foreground md:text-7xl">
              {product.name}
            </h1>
            
            <div className="mb-8 mt-5 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-foreground">
              {currentSalePrice != null && currentSavings > 0 && (
                <span className="font-serif text-3xl text-primary">
                  {formatPrice(currentSalePrice)}
                </span>
              )}
              <span className={cn(
                "font-serif",
                currentSalePrice != null && currentSavings > 0
                  ? "text-xl text-muted-foreground line-through"
                  : "text-3xl text-primary",
              )}>
                {formatPrice(currentBasePrice)}
              </span>
              {currentSalePrice != null && currentSavings > 0 && (
                <span className="text-sm font-medium text-primary">
                  Ahorras {formatPrice(currentSavings)}
                </span>
              )}
            </div>

            <div className="prose prose-sm md:prose-base prose-p:text-muted-foreground mb-10 max-w-none font-sans leading-relaxed text-foreground/80">
              <p>{product.description}</p>
            </div>

            <div className="mb-8 border-y border-border bg-muted/20 py-4">
              <div className="flex items-start gap-3">
                <ShoppingBag className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <div>
                  <span className="mallorca-kicker text-primary">Tu Mallorca</span>
                  <p className="mt-1 font-serif text-xl">{currentBranchAvailability?.branchName || "Sucursal seleccionada"}</p>
                  <p className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
                    {currentBranchAvailability?.available && (currentBranchAvailability.inventory ?? 0) > 0 && scheduleAvailable
                      ? `Disponible · ${currentBranchAvailability.inventory} piezas`
                      : selectedTime ? "No disponible para este horario" : "Selecciona fecha y hora"}
                  </p>
                </div>
              </div>
            </div>

            {/* Variants */}
            {product.variants && product.variants.length > 0 && (
              <div className="mb-8 border-t border-border pt-8">
                <h3 className="font-sans text-sm font-semibold uppercase tracking-wider mb-4">Opciones</h3>
                <div className="flex flex-wrap gap-3">
                  {product.variants.map(variant => (
                    <button
                      key={variant.id}
                      onClick={() => setSelectedVariant(variant.id)}
                      className={cn(
                        "px-4 py-2 text-sm border rounded-none transition-all",
                        selectedVariant === variant.id 
                          ? "border-primary bg-primary text-primary-foreground" 
                          : "border-border hover:border-foreground"
                      )}
                    >
                      {variant.name}: {variant.value}
                    </button>
                  ))}
                  <button
                    onClick={() => setSelectedVariant(null)}
                    className={cn(
                      "px-4 py-2 text-sm border rounded-none transition-all",
                      selectedVariant === null 
                        ? "border-primary bg-primary text-primary-foreground" 
                        : "border-border hover:border-foreground"
                    )}
                  >
                    Estándar
                  </button>
                </div>
              </div>
            )}

            {/* Add to Cart Actions */}
            <div className="mb-10 flex items-center gap-4 border-t border-border pt-8">
              <div className="flex items-center border border-border h-12">
                <button 
                  onClick={() => setQuantity(Math.max(1, quantity - 1))}
                  className="w-12 h-full flex items-center justify-center text-foreground hover:bg-muted transition-colors"
                >
                  <Minus className="w-4 h-4" />
                </button>
                <span className="w-12 text-center font-medium">{quantity}</span>
                <button 
                  onClick={() => setQuantity(quantity + 1)}
                  className="w-12 h-full flex items-center justify-center text-foreground hover:bg-muted transition-colors"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
              
              <Button 
                onClick={handleAddToCart}
                disabled={!branchId || !selectedDate || !selectedTime || !scheduleAvailable || !currentBranchAvailability?.available || (currentBranchAvailability.inventory ?? 0) < quantity || addCartItem.isPending || createSession.isPending}
                size="lg" 
                className="h-12 flex-1 rounded-none bg-primary text-base text-primary-foreground hover:bg-primary/90"
              >
                {(addCartItem.isPending || createSession.isPending) ? "Agregando..." : "Agregar al carrito"}
              </Button>
            </div>

            <div className="fixed inset-x-0 bottom-0 z-40 flex items-center gap-3 border-t border-border bg-[var(--mallorca-white)]/95 p-3 backdrop-blur-md md:hidden">
              <div className="min-w-0 flex-1">
                <span className="mallorca-kicker text-[var(--mallorca-red)]">Tu selección</span>
                <p className="truncate font-serif text-lg">{formatPrice(currentPrice * quantity)}</p>
              </div>
              <Button
                onClick={handleAddToCart}
                disabled={!branchId || !selectedDate || !selectedTime || !scheduleAvailable || !currentBranchAvailability?.available || (currentBranchAvailability.inventory ?? 0) < quantity || addCartItem.isPending || createSession.isPending}
                className="h-12 rounded-md bg-[var(--mallorca-red)] px-5 text-white hover:bg-[var(--mallorca-red-dark)]"
              >
                {addCartItem.isPending || createSession.isPending ? "Añadiendo" : "Añadir"}
              </Button>
            </div>

            {/* Metadata Accordions */}
            <div className="space-y-6 pt-8 border-t border-border text-sm">
              {product.ingredients && (
                <div>
                  <h4 className="font-bold mb-2 flex items-center gap-2">
                    <Info className="w-4 h-4 text-muted-foreground" />
                    Ingredientes
                  </h4>
                  <p className="text-muted-foreground leading-relaxed">{product.ingredients}</p>
                </div>
              )}
              
              {product.allergens && (
                <div>
                  <h4 className="font-bold mb-2 flex items-center gap-2 text-destructive/80">
                    <AlertCircle className="w-4 h-4" />
                    Alérgenos
                  </h4>
                  <p className="text-muted-foreground leading-relaxed">{product.allergens}</p>
                </div>
              )}
              
              {(product.weight || product.portions) && (
                <div className="grid grid-cols-2 gap-4">
                  {product.weight && (
                    <div>
                      <h4 className="font-bold mb-1">Peso</h4>
                      <p className="text-muted-foreground">{product.weight}</p>
                    </div>
                  )}
                  {product.portions && (
                    <div>
                      <h4 className="font-bold mb-1">Porciones</h4>
                      <p className="text-muted-foreground">{product.portions}</p>
                    </div>
                  )}
                </div>
              )}
              
              {product.minimumLeadTimeHours > 0 && (
                <div className="border border-[var(--mallorca-butter)] bg-[var(--mallorca-butter)]/20 p-4">
                  <h4 className="font-bold mb-1">Tiempo de preparación</h4>
                  <p className="text-muted-foreground">
                    Este producto requiere un mínimo de {product.minimumLeadTimeHours} horas de anticipación para su preparación.
                  </p>
                </div>
              )}
            </div>

          </div>
        </div>

      </div>
    </StoreLayout>
  );
}
