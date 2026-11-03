import { StoreLayout } from "@/components/layout/store-layout";
import { ImageWithFallback } from "@/components/image-with-fallback";
import {
  useGetProduct,
  useAddCartItem,
  useCreateCartSession,
  useListProducts,
  getGetProductQueryKey,
} from "@workspace/api-client-react";
import { useParams, Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { writeCartCache } from "@/lib/cart-cache";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowRight, Plus, Minus, Info, AlertCircle, ShoppingBag } from "lucide-react";
import { useEffect, useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import { useCart } from "@/lib/cart-context";
import { ProductCard } from "@/components/product-card";
import { formatMxn, formatLeadTime, productAvailabilityCopy } from "@/lib/availability-copy";
import { track } from "@/lib/analytics";
import { isStaleCartMutationError } from "@/lib/cart-recovery";
import { toastStorefrontNotice } from "@/components/storefront-notice";

const PRODUCT_PRICE_REFRESH_INTERVAL_MS = 30_000;

export default function ProductDetail() {
  const { slug } = useParams<{ slug: string }>();
  const { branchId, selectedTime, cartId, setCartSession, clearCartSession, openBranchPicker, openMiniCart } = useCart();
  const productParams = branchId ? { branchId } : undefined;
  const { data: product, isLoading, isError } = useGetProduct(slug || "", productParams, {
    query: {
      enabled: Boolean(slug),
      queryKey: getGetProductQueryKey(slug || "", productParams),
      staleTime: PRODUCT_PRICE_REFRESH_INTERVAL_MS,
      refetchInterval: PRODUCT_PRICE_REFRESH_INTERVAL_MS,
      refetchOnMount: true,
      refetchOnWindowFocus: true,
    },
  });
  const [quantity, setQuantity] = useState(1);
  const [selectedVariant, setSelectedVariant] = useState<number | null>(null);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  
  const addCartItem = useAddCartItem();
  const createSession = useCreateCartSession();
  const queryClient = useQueryClient();
  // If a branch is selected, make sure we only show price/availability for that branch.
  const currentBranchAvailability = useMemo(() => {
    if (!product || !branchId) return null;
    return product.availability.find(a => a.branchId === branchId);
  }, [product, branchId]);

  const crossSellIds = (product as any)?.crossSellProductIds as number[] | undefined;
  const { data: catalogProducts } = useListProducts(undefined, {
    query: {
      enabled: Boolean(crossSellIds?.length) && !(product as { crossSellProducts?: unknown[] } | undefined)?.crossSellProducts?.length,
      queryKey: ["/api/products", "cross-sell"],
    },
  });
  const crossSellProducts = useMemo(() => {
    const fromApi = (product as { crossSellProducts?: typeof catalogProducts })?.crossSellProducts;
    if (fromApi?.length) {
      return fromApi.filter((item) => item.id !== product?.id).slice(0, 3);
    }
    if (!catalogProducts?.length || !crossSellIds?.length || !product) return [];
    return crossSellIds
      .map((id) => catalogProducts.find((item) => item.id === id))
      .filter((item): item is NonNullable<typeof item> => {
        if (!item || item.id === product.id) return false;
        if (!branchId) return true;
        return item.availability.some(
          (avail) =>
            avail.branchId === branchId && avail.available && avail.inventory > 0,
        );
      })
      .slice(0, 3);
  }, [branchId, catalogProducts, crossSellIds, product]);

  useEffect(() => {
    if (!product) return;
    track("view_item", { productId: product.id, name: product.name, value: product.salePrice ?? product.price });
  }, [product?.id, product?.name, product?.price, product?.salePrice]);

  useEffect(() => {
    setSelectedImageIndex(0);
  }, [product?.id]);

  if (isLoading) {
    return (
      <StoreLayout>
        <div className="container mx-auto flex h-[calc(100dvh-var(--store-header-height,4.5rem))] max-h-[calc(100dvh-var(--store-header-height,4.5rem))] flex-col px-4 py-6 animate-pulse md:px-6 md:py-8">
          <div className="mb-4 h-4 w-40 bg-muted" />
          <div className="flex min-h-0 flex-1 flex-col gap-8 md:flex-row lg:gap-12">
            <div className="min-h-[14rem] w-full bg-muted md:w-[55%] md:min-h-0" />
            <div className="w-full space-y-4 md:w-[45%]">
              <div className="h-8 w-3/4 bg-muted" />
              <div className="h-5 w-1/4 bg-muted" />
              <div className="mt-4 h-16 w-full bg-muted" />
              <div className="mt-4 h-12 w-full bg-muted" />
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
  const leadMinutes = Math.max(
    (product.minimumLeadTimeHours ?? 0) * 60,
    currentBranchAvailability?.preparationTimeMinutes ?? 0,
  );
  const leadHours = Math.ceil(leadMinutes / 60);
  const scheduleAvailable = Boolean(
    !selectedTime ||
    (currentBranchAvailability &&
      new Date(selectedTime).getTime() >= Date.now() + leadMinutes * 60_000),
  );
  const availabilityLabel = productAvailabilityCopy({
    branchName: currentBranchAvailability?.branchName,
    available: currentBranchAvailability?.available,
    inventory: currentBranchAvailability?.inventory,
    leadMinutes,
    leadHours,
    scheduleOk: scheduleAvailable,
    hasSchedule: Boolean(selectedTime),
  });
  const canAdd = Boolean(
    (!branchId || (currentBranchAvailability?.available && (currentBranchAvailability.inventory ?? 0) >= quantity)) &&
    (!selectedTime || scheduleAvailable),
  );

  const handleAddToCart = async () => {
    try {
      let activeBranchId = branchId;
      if (!activeBranchId) {
        activeBranchId = await openBranchPicker();
        if (!activeBranchId) return;
      }

      const createFreshCart = async () => {
        const session = await createSession.mutateAsync({
          data: { branchId: activeBranchId! },
        });
        setCartSession(session.id, activeBranchId!);
        return session.id;
      };

      let activeCartId = cartId;
      if (!activeCartId) {
        activeCartId = await createFreshCart();
      }

      let updated;
      try {
        updated = await addCartItem.mutateAsync({
          id: activeCartId,
          data: {
            productId: product!.id,
            variantId: selectedVariant,
            quantity,
          },
        });
      } catch (err) {
        if (!isStaleCartMutationError(err)) throw err;
        clearCartSession();
        activeCartId = await createFreshCart();
        updated = await addCartItem.mutateAsync({
          id: activeCartId,
          data: {
            productId: product!.id,
            variantId: selectedVariant,
            quantity,
          },
        });
      }

      writeCartCache(queryClient, updated);
      track("add_to_cart", { productId: product!.id, name: product!.name, quantity, value: currentPrice * quantity });
      openMiniCart();
      
    } catch (err: unknown) {
      toastStorefrontNotice(err, {
        title: "No pudimos añadirlo a tu bolsa",
        description: "Inténtalo de nuevo en un momento.",
      });
    }
  };

  const productCopy = product.shortDescription || product.description;
  const productImages = Array.from(
    new Set(
      [product.imageUrl, ...(product.gallery ?? [])].filter(
        (url): url is string => typeof url === "string" && url.trim().length > 0,
      ),
    ),
  );
  const activeImageIndex = Math.min(selectedImageIndex, Math.max(productImages.length - 1, 0));
  const activeImage = productImages[activeImageIndex] ?? product.imageUrl;
  const hasGallery = productImages.length > 1;

  const availabilityText = availabilityLabel
    ? availabilityLabel
    : currentBranchAvailability?.available && (currentBranchAvailability.inventory ?? 0) > 0
      ? `Disponible · ${currentBranchAvailability.inventory} piezas`
      : "Precios e inventario se confirman con tu sucursal.";

  return (
    <StoreLayout>
      <section className="flex min-h-[calc(100dvh-var(--store-header-height,4.5rem))] flex-col md:h-[calc(100dvh-var(--store-header-height,4.5rem))] md:max-h-[calc(100dvh-var(--store-header-height,4.5rem))] md:overflow-hidden">
        <div className="container mx-auto flex min-h-0 flex-1 flex-col px-4 py-4 pb-24 md:px-6 md:py-5 md:pb-5">
          <Link href="/tienda" className="editorial-link mb-3 shrink-0 text-sm font-medium text-muted-foreground hover:text-primary md:mb-4">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Volver al catálogo
          </Link>

          <div className="flex min-h-0 flex-1 flex-col gap-5 md:flex-row md:items-stretch md:gap-6 lg:gap-10">
            <div className="flex w-full min-h-0 flex-col gap-2.5 md:w-[52%]">
              <div className="mallorca-paper-edge group relative h-[min(16rem,38dvh)] overflow-hidden bg-secondary sm:h-[min(20rem,42dvh)] md:h-auto md:min-h-0 md:flex-1">
                <ImageWithFallback
                  key={activeImage}
                  src={activeImage}
                  alt={product.name}
                  className="h-full w-full object-contain bg-[var(--mallorca-sand)] p-3 transition-transform duration-700 hover:scale-[1.02] sm:p-4"
                  fallback={<div role="img" aria-label={`${product.name}: imagen no disponible`} className="flex h-full w-full items-center justify-center text-muted-foreground"><span className="font-serif italic text-lg">Imagen no disponible</span></div>}
                />

                {hasGallery ? (
                  <>
                    <button
                      type="button"
                      aria-label="Foto anterior"
                      onClick={() =>
                        setSelectedImageIndex(
                          (activeImageIndex - 1 + productImages.length) % productImages.length,
                        )
                      }
                      className="absolute left-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center border border-border/60 bg-background/90 text-foreground opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100"
                    >
                      <ArrowLeft className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      aria-label="Foto siguiente"
                      onClick={() =>
                        setSelectedImageIndex((activeImageIndex + 1) % productImages.length)
                      }
                      className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center border border-border/60 bg-background/90 text-foreground opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100"
                    >
                      <ArrowRight className="h-4 w-4" />
                    </button>
                  </>
                ) : null}
              </div>

              {hasGallery ? (
                <div
                  role="listbox"
                  aria-label={`Galería de ${product.name}`}
                  className="flex shrink-0 gap-2 overflow-x-auto pb-0.5 [scrollbar-width:thin]"
                >
                  {productImages.map((img, i) => {
                    const selected = i === activeImageIndex;
                    return (
                      <button
                        key={`${img}-${i}`}
                        type="button"
                        role="option"
                        aria-selected={selected}
                        aria-label={`Ver foto ${i + 1}`}
                        onClick={() => setSelectedImageIndex(i)}
                        className={cn(
                          "relative aspect-square w-[4.25rem] shrink-0 overflow-hidden bg-secondary transition-[opacity,box-shadow] sm:w-20",
                          selected
                            ? "ring-2 ring-primary ring-offset-2 ring-offset-background"
                            : "opacity-70 hover:opacity-100",
                        )}
                      >
                        <ImageWithFallback
                          src={img}
                          alt={`${product.name} ${i + 1}`}
                          className="h-full w-full object-cover"
                          fallback={
                            <div
                              role="img"
                              aria-label={`${product.name} imagen ${i + 1}: imagen no disponible`}
                              className="flex h-full w-full items-center justify-center text-center text-[10px] text-muted-foreground"
                            >
                              Imagen no disponible
                            </div>
                          }
                        />
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>

            <div className="flex w-full min-h-0 flex-col justify-between gap-3 md:w-[48%] md:overflow-hidden">
              <div className="min-h-0 space-y-3">
                <div>
                  <div className="mallorca-kicker mb-1.5 flex items-center gap-2 text-primary">
                    <Link href={`/tienda?categorySlug=${product.categorySlug}`} className="transition-colors hover:text-primary">
                      {product.categoryName}
                    </Link>
                  </div>

                  <h1 className="mallorca-display text-[clamp(1.75rem,3.4vw,2.85rem)] leading-[0.94] text-foreground">
                    {product.name}
                  </h1>

                  <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-foreground">
                    {currentSalePrice != null && currentSavings > 0 && (
                      <span className="font-serif text-xl text-primary md:text-2xl">
                        {formatMxn(currentSalePrice)}
                      </span>
                    )}
                    <span className={cn(
                      "font-serif",
                      currentSalePrice != null && currentSavings > 0
                        ? "text-base text-muted-foreground line-through"
                        : "text-xl text-primary md:text-2xl",
                    )}>
                      {formatMxn(currentBasePrice)}
                    </span>
                    {currentSalePrice != null && currentSavings > 0 && (
                      <span className="text-xs font-medium text-primary md:text-sm">
                        Ahorras {formatMxn(currentSavings)}
                      </span>
                    )}
                  </div>
                </div>

                {productCopy ? (
                  <p className="line-clamp-2 max-w-xl text-sm leading-snug text-muted-foreground">
                    {productCopy}
                  </p>
                ) : null}

                <div className="flex items-start gap-2.5 border-y border-border py-2.5">
                  <ShoppingBag className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <div className="min-w-0">
                    <p className="truncate font-serif text-base leading-tight md:text-lg">
                      <span className="mallorca-kicker mr-2 inline text-primary">Tu Mallorca</span>
                      {currentBranchAvailability?.branchName || "Elige tu Mallorca al añadir"}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground md:text-sm">
                      {availabilityText}
                    </p>
                  </div>
                </div>

                {product.variants && product.variants.length > 0 ? (
                  <div>
                    <h3 className="mb-2 font-sans text-xs font-semibold uppercase tracking-wider">Opciones</h3>
                    <div className="flex flex-wrap gap-1.5">
                      {product.variants.map((variant) => (
                        <button
                          key={variant.id}
                          type="button"
                          onClick={() => setSelectedVariant(variant.id)}
                          className={cn(
                            "rounded-none border px-2.5 py-1 text-xs transition-all sm:text-sm",
                            selectedVariant === variant.id
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-border hover:border-foreground",
                          )}
                        >
                          {variant.name}: {variant.value}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => setSelectedVariant(null)}
                        className={cn(
                          "rounded-none border px-2.5 py-1 text-xs transition-all sm:text-sm",
                          selectedVariant === null
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border hover:border-foreground",
                        )}
                      >
                        Estándar
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="shrink-0 space-y-3">
                <div className="hidden items-center gap-3 border-t border-border pt-3 md:flex">
                  <div className="flex h-10 items-center border border-border">
                    <button
                      type="button"
                      onClick={() => setQuantity(Math.max(1, quantity - 1))}
                      className="flex h-full w-10 items-center justify-center text-foreground transition-colors hover:bg-muted"
                    >
                      <Minus className="h-4 w-4" />
                    </button>
                    <span className="w-9 text-center font-medium">{quantity}</span>
                    <button
                      type="button"
                      onClick={() => setQuantity(quantity + 1)}
                      className="flex h-full w-10 items-center justify-center text-foreground transition-colors hover:bg-muted"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>

                  <Button
                    onClick={handleAddToCart}
                    disabled={!canAdd || addCartItem.isPending || createSession.isPending}
                    size="lg"
                    className="h-10 flex-1 rounded-none bg-primary text-sm text-primary-foreground hover:bg-primary/90"
                  >
                    {(addCartItem.isPending || createSession.isPending) ? "Agregando..." : "Agregar al carrito"}
                  </Button>
                </div>

                <div className="fixed inset-x-0 bottom-0 z-40 flex items-center gap-3 border-t border-border bg-[var(--mallorca-white)]/95 p-3 backdrop-blur-md md:hidden">
                  <div className="flex h-11 items-center border border-border">
                    <button
                      type="button"
                      onClick={() => setQuantity(Math.max(1, quantity - 1))}
                      className="flex h-full w-10 items-center justify-center"
                    >
                      <Minus className="h-4 w-4" />
                    </button>
                    <span className="w-8 text-center text-sm font-medium">{quantity}</span>
                    <button
                      type="button"
                      onClick={() => setQuantity(quantity + 1)}
                      className="flex h-full w-10 items-center justify-center"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="mallorca-kicker text-[var(--mallorca-red)]">Tu selección</span>
                    <p className="truncate font-serif text-lg">{formatMxn(currentPrice * quantity)}</p>
                  </div>
                  <Button
                    onClick={handleAddToCart}
                    disabled={!canAdd || addCartItem.isPending || createSession.isPending}
                    className="h-11 rounded-md bg-[var(--mallorca-red)] px-4 text-white hover:bg-[var(--mallorca-red-dark)]"
                  >
                    {addCartItem.isPending || createSession.isPending ? "Añadiendo" : "Añadir"}
                  </Button>
                </div>

                <div className="space-y-1.5 border-t border-border pt-2.5 text-xs md:text-sm">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-muted-foreground">
                    {product.weight ? (
                      <p><span className="font-bold text-foreground">Peso</span> · {product.weight}</p>
                    ) : null}
                    {product.portions ? (
                      <p><span className="font-bold text-foreground">Porciones</span> · {product.portions}</p>
                    ) : null}
                    {leadMinutes > 0 ? (
                      <p>
                        <span className="font-bold text-foreground">Preparación</span>
                        {" · "}
                        mínimo {formatLeadTime(leadMinutes)}
                      </p>
                    ) : null}
                  </div>

                  {product.ingredients ? (
                    <p className="line-clamp-1 text-muted-foreground">
                      <Info className="mr-1.5 inline h-3.5 w-3.5 -translate-y-px text-muted-foreground" />
                      <span className="font-bold text-foreground">Ingredientes</span>
                      {" · "}
                      {product.ingredients}
                    </p>
                  ) : null}

                  {product.allergens ? (
                    <p className="line-clamp-1 text-muted-foreground">
                      <AlertCircle className="mr-1.5 inline h-3.5 w-3.5 -translate-y-px text-destructive/80" />
                      <span className="font-bold text-destructive/80">Alérgenos</span>
                      {" · "}
                      {product.allergens}
                    </p>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {crossSellProducts.length > 0 ? (
        <section className="flex h-[calc(100dvh-var(--store-header-height,4.5rem))] max-h-[calc(100dvh-var(--store-header-height,4.5rem))] flex-col justify-center overflow-hidden border-t border-border bg-[var(--mallorca-cream)]">
          <div className="container mx-auto px-4 py-6 md:px-6 md:py-8">
            <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-end sm:gap-6">
              <div>
                <h2 className="mallorca-display text-[clamp(1.85rem,4vw,3rem)] leading-[0.94]">
                  Combina bien con
                </h2>
                <p className="mt-1.5 text-sm text-muted-foreground">
                  Recomendaciones disponibles en tu sucursal.
                </p>
              </div>
            </div>

            <div
              className={cn(
                "mt-5 grid gap-4 md:mt-6 md:gap-5",
                crossSellProducts.length === 1 && "grid-cols-1 sm:max-w-sm",
                crossSellProducts.length === 2 && "grid-cols-2",
                crossSellProducts.length >= 3 && "grid-cols-2 lg:grid-cols-3",
              )}
            >
              {crossSellProducts.map((item) => (
                <ProductCard
                  key={item.id}
                  product={item}
                  className="[&>a>div]:!aspect-auto [&>a>div]:h-[min(14rem,32dvh)] sm:[&>a>div]:h-[min(16rem,36dvh)] md:[&>a>div]:h-[min(18rem,40dvh)] [&_.pt-4]:pt-2.5 [&_h3]:text-sm sm:[&_h3]:text-base md:[&_h3]:text-lg [&_p.mb-3]:mb-1.5 [&_p.mb-3]:hidden sm:[&_p.mb-3]:line-clamp-1 sm:[&_p.mb-3]:block"
                />
              ))}
            </div>
          </div>
        </section>
      ) : null}
    </StoreLayout>
  );
}
