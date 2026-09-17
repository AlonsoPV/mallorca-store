import { useEffect, useMemo, useState } from "react";
import { MapPin, Check, ChevronRight, Loader2, AlertCircle, Clock, Truck, Store as StoreIcon } from "lucide-react";
import { useLocation } from "wouter";
import {
  useAddCartItem,
  useCreateCartSession,
  useGetCart,
  getGetCartQueryKey,
  useListBranches,
  usePreviewCartBranch,
} from "@workspace/api-client-react";
import type { Branch, BranchPreview } from "@workspace/api-client-react";
import { useCart } from "@/lib/cart-context";
import { trackBranchEvent } from "@/lib/analytics";
import { formatMxn } from "@/lib/availability-copy";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getCampaignBranchId, keepAvailableCartItems, shouldPreviewBranchChange } from "@/lib/branch-flow";

interface BranchSelectorProps {
  required?: boolean;
}

function branchShortName(branch: Branch) {
  return branch.shortName || branch.name.replace(/^Mallorca\s+/i, "");
}

export function BranchSelector({ required = false }: BranchSelectorProps) {
  const [location] = useLocation();
  const {
    branchId,
    cartId,
    setBranchId,
    setCartSession,
    clearCartSession,
    branchPickerOpen,
    setBranchPickerOpen,
    notifyBranchPicked,
  } = useCart();
  const { data: branchesData, isLoading } = useListBranches();
  const branches = Array.isArray(branchesData) ? branchesData : undefined;
  const { data: cart } = useGetCart(cartId || "", {
    query: { enabled: Boolean(cartId), queryKey: getGetCartQueryKey(cartId || "") },
  });
  const previewCartBranch = usePreviewCartBranch();
  const createCartSession = useCreateCartSession();
  const addCartItem = useAddCartItem();
  const [isOpen, setIsOpen] = useState(required && !branchId);
  const [pendingBranch, setPendingBranch] = useState<Branch | null>(null);
  const [preview, setPreview] = useState<BranchPreview | null>(null);
  const [isSwitching, setIsSwitching] = useState(false);

  const currentBranch = useMemo(
    () => branches?.find((branch) => branch.id === branchId) ?? null,
    [branches, branchId],
  );

  useEffect(() => {
    if (required && !branchId) setIsOpen(true);
    if (branchPickerOpen) setIsOpen(true);
  }, [required, branchId, branchPickerOpen]);

  useEffect(() => {
    if (branchId || !branches?.length) return;
    const campaignBranchId = getCampaignBranchId(window.location.search, branches);
    if (campaignBranchId) {
      const campaignBranch = branches.find((branch) => branch.id === campaignBranchId);
      setBranchId(campaignBranchId);
      notifyBranchPicked(campaignBranchId);
      if (campaignBranch) {
        trackBranchEvent("branch_selected", {
          branchId: campaignBranch.id,
          branchSlug: campaignBranch.slug,
          source: "campaign",
        });
      }
      setIsOpen(false);
      window.history.replaceState({}, "", location.split("?")[0]);
    }
  }, [branchId, branches, location, setBranchId]);

  const chooseBranch = async (branch: Branch) => {
    if (branch.id === branchId) {
      setIsOpen(false);
      return;
    }

    if (!branchId || !cartId) {
      setBranchId(branch.id);
      notifyBranchPicked(branch.id);
      trackBranchEvent(branchId ? "branch_changed" : "branch_selected", {
        branchId: branch.id,
        branchSlug: branch.slug,
        source: "selector",
      });
      setIsOpen(false);
      return;
    }

    if (!cart) return;

    if (!cart.items.length) {
      clearCartSession();
      setBranchId(branch.id);
      trackBranchEvent("branch_changed", {
        branchId: branch.id,
        branchSlug: branch.slug,
        source: "selector",
      });
      setIsOpen(false);
      return;
    }

    if (!shouldPreviewBranchChange({
      currentBranchId: branchId,
      targetBranchId: branch.id,
      cartId,
      cartItemCount: cart.items.length,
    })) {
      setBranchId(branch.id);
      setIsOpen(false);
      return;
    }

    setPendingBranch(branch);
    try {
      const result = await previewCartBranch.mutateAsync({
        id: cartId,
        data: { branchId: branch.id },
      });
      setPreview(result);
    } catch {
      setPreview(null);
    }
  };

  const switchBranch = async () => {
    if (!pendingBranch || !preview || !cart) return;
    setIsSwitching(true);
    try {
      const session = await createCartSession.mutateAsync({
        data: { branchId: pendingBranch.id },
      });
      const keepItems = keepAvailableCartItems(cart.items, preview.items);

      for (const item of keepItems) {
        await addCartItem.mutateAsync({
          id: session.id,
          data: {
            productId: item.productId,
            variantId: item.variantId,
            quantity: item.quantity,
          },
        });
      }

      setCartSession(session.id, pendingBranch.id);
      notifyBranchPicked(pendingBranch.id);
      trackBranchEvent("branch_changed", {
        branchId: pendingBranch.id,
        branchSlug: pendingBranch.slug,
        source: "header",
      });
      setPreview(null);
      setPendingBranch(null);
      setIsOpen(false);
    } catch {
      setIsSwitching(false);
      return;
    }
    setIsSwitching(false);
  };

  const cancelPreview = () => {
    setPreview(null);
    setPendingBranch(null);
  };

  const selectWithoutCart = (branch: Branch) => {
    setBranchId(branch.id);
    notifyBranchPicked(branch.id);
    trackBranchEvent(branchId ? "branch_changed" : "branch_selected", {
      branchId: branch.id,
      branchSlug: branch.slug,
      source: "selector",
    });
    setIsOpen(false);
  };

  const shouldBlockClose = required && !branchId;

  const handleOpenChange = (open: boolean) => {
    if (shouldBlockClose && !open) return;
    setIsOpen(open);
    setBranchPickerOpen(open);
    if (!open) notifyBranchPicked(branchId);
  };

  return (
    <>
      {!required && currentBranch && (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="group flex min-w-0 max-w-[9.5rem] items-center gap-1.5 text-left sm:max-w-[12rem] lg:max-w-none lg:gap-2 lg:border-l lg:border-border/70 lg:pl-4"
          aria-label={`Cambiar sucursal. Actualmente ${currentBranch.name}`}
        >
          <MapPin className="h-3.5 w-3.5 shrink-0 text-primary lg:h-4 lg:w-4" />
          <span className="min-w-0">
            <span className="hidden text-[9px] font-bold uppercase tracking-[0.18em] text-muted-foreground lg:block">Tu Mallorca</span>
            <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.12em] group-hover:text-primary sm:text-xs sm:normal-case sm:tracking-normal lg:font-semibold">
              <span className="truncate">{branchShortName(currentBranch)}</span>
              <ChevronRight className="h-3 w-3 shrink-0 rotate-90" />
            </span>
          </span>
        </button>
      )}

      {!required && !currentBranch && (
        <button type="button" onClick={() => setIsOpen(true)} className="shrink-0 text-[10px] font-bold uppercase tracking-[0.12em] text-primary underline underline-offset-4 sm:text-xs sm:normal-case sm:tracking-normal">
          Elegir sucursal
        </button>
      )}

      <Dialog open={isOpen} onOpenChange={handleOpenChange}>
        <DialogContent
          className={`max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-none border-border bg-[var(--mallorca-ivory)] p-0 sm:max-w-3xl ${shouldBlockClose ? "[&>button]:hidden" : ""}`}
          onPointerDownOutside={(event) => shouldBlockClose && event.preventDefault()}
          onEscapeKeyDown={(event) => shouldBlockClose && event.preventDefault()}
        >
          <div className="bg-[var(--mallorca-burgundy)] px-6 py-8 text-white sm:px-10 sm:py-10">
            <DialogHeader className="text-left">
              <span className="mallorca-kicker text-[var(--mallorca-butter)]">Antes de empezar</span>
              <DialogTitle className="mallorca-display mt-3 text-4xl text-white sm:text-5xl">
                ¿Desde qué Mallorca quieres pedir?
              </DialogTitle>
              <DialogDescription className="mt-3 max-w-xl text-sm leading-relaxed text-white/75">
                Elige tu sucursal para mostrar productos, precios, inventario y opciones de entrega correctos.
              </DialogDescription>
            </DialogHeader>
          </div>

          <div className="p-6 sm:p-10">
            {preview && pendingBranch ? (
              <div>
                <div className="mb-6 flex items-start gap-3 border-b border-border pb-6">
                  <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                  <div>
                    <h3 className="font-serif text-2xl">¿Quieres cambiar de sucursal?</h3>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                      Tienes productos de {currentBranch?.name || "otra sucursal"} en tu bolsa. Revisamos su disponibilidad en {pendingBranch.name} antes de continuar.
                    </p>
                  </div>
                </div>

                <div className="space-y-3">
                  {preview.items.map((item) => {
                    const current = cart?.items.find(
                      (line) => line.productId === item.productId && (line.variantId ?? null) === (item.variantId ?? null),
                    );
                    const targetPrice = item.salePrice ?? item.price;
                    const priceChanged = current != null && Math.abs(current.unitPrice - targetPrice) > 0.009;
                    return (
                    <div key={`${item.productId}-${item.variantId ?? "standard"}`} className="flex items-center justify-between gap-4 border-b border-border/70 py-3 text-sm">
                      <span>{item.quantity} × {item.name}</span>
                      <span className={item.available ? "flex flex-col items-end gap-0.5 text-green-700" : "flex items-center gap-1 text-destructive"}>
                        {item.available ? (
                          <>
                            <span className="flex items-center gap-1"><Check className="h-4 w-4" /> Disponible</span>
                            {priceChanged ? (
                              <span className="text-xs font-medium text-foreground">
                                Precio diferente {formatMxn(current.unitPrice)} → {formatMxn(targetPrice)}
                              </span>
                            ) : null}
                          </>
                        ) : (
                          <><AlertCircle className="h-4 w-4" /> No disponible</>
                        )}
                      </span>
                    </div>
                    );
                  })}
                </div>

                {preview.unavailableItems.length > 0 && (
                  <p className="mt-5 bg-[var(--mallorca-butter)]/25 p-4 text-sm leading-relaxed text-foreground">
                    Los productos no disponibles se eliminarán solo si confirmas el cambio. Los demás se conservarán en la nueva bolsa.
                  </p>
                )}

                <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                  <Button type="button" variant="outline" onClick={cancelPreview} disabled={isSwitching} className="rounded-none">
                    Seguir con {branchShortName(currentBranch!)}
                  </Button>
                  <Button type="button" onClick={switchBranch} disabled={isSwitching} className="rounded-none bg-primary text-primary-foreground hover:bg-primary/90">
                    {isSwitching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    {preview.unavailableItems.length ? "Eliminar no disponibles y cambiar" : "Cambiar y conservar bolsa"}
                  </Button>
                </div>
              </div>
            ) : (
              <>
                {isLoading ? (
                  <div className="flex items-center justify-center py-16 text-muted-foreground">
                    <Loader2 className="mr-3 h-5 w-5 animate-spin" /> Cargando sucursales
                  </div>
                ) : (
                  <div className="grid gap-4 sm:grid-cols-2">
                    {branches?.map((branch) => {
                      const isSelected = branch.id === branchId;
                      return (
                        <button
                          key={branch.id}
                          type="button"
                          onClick={() => (cart && branch.id !== branchId ? chooseBranch(branch) : selectWithoutCart(branch))}
                          className={`group border p-5 text-left transition-colors hover:border-primary ${isSelected ? "border-primary bg-primary/5" : "border-border bg-background"}`}
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div>
                              <span className="mallorca-kicker text-primary">{branchShortName(branch)}</span>
                              <h3 className="mt-2 font-serif text-2xl">{branch.name}</h3>
                            </div>
                            {isSelected ? (
                              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-white">
                                <Check className="h-4 w-4" />
                              </span>
                            ) : (
                              <ChevronRight className="h-5 w-5 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-primary" />
                            )}
                          </div>
                          <p className="mt-4 flex items-start gap-2 text-sm leading-relaxed text-muted-foreground">
                            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                            <span>{branch.address}, {branch.neighborhood}</span>
                          </p>
                          <div className="mt-4 grid grid-cols-2 gap-2 border-t border-border pt-4 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" /> Horarios disponibles</span>
                            <span className="flex items-center gap-1.5">{branch.pickupAvailable ? <StoreIcon className="h-3.5 w-3.5" /> : <Truck className="h-3.5 w-3.5" />} {branch.deliveryAvailable ? "Pickup y delivery" : "Pickup disponible"}</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
                <p className="mt-6 text-center text-xs text-muted-foreground">Puedes cambiarla después desde el encabezado.</p>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}