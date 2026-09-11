import { useEffect, useMemo, useState } from "react";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  format,
  getDay,
  isBefore,
  isSameDay,
  parseISO,
  startOfDay,
  startOfMonth,
  subMonths,
} from "date-fns";
import { enUS, es } from "date-fns/locale";
import { AlertCircle, CalendarDays, Check, ChevronLeft, ChevronRight, Clock, Loader2 } from "lucide-react";
import {
  getGetCartQueryKey,
  getListFulfillmentSlotsQueryKey,
  useListBranches,
  useDeleteCartItem,
  useGetCart,
  useListFulfillmentSlots,
  usePreviewFulfillment,
} from "@workspace/api-client-react";
import type { FulfillmentPreview } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useCart } from "@/lib/cart-context";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface FulfillmentSelectorProps {
  required?: boolean;
}

const today = startOfDay(new Date());
const dayLabels = ["L", "M", "M", "J", "V", "S", "D"];

function displayTime(value: string) {
  return new Date(value).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
}

export function FulfillmentSelector({ required = false }: FulfillmentSelectorProps) {
  const { branchId, cartId, selectedDate, selectedTime, setFulfillmentContext } = useCart();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const [month, setMonth] = useState(startOfMonth(new Date()));
  const [draftDate, setDraftDate] = useState<string | null>(selectedDate);
  const [draftTime, setDraftTime] = useState<string | null>(selectedTime);
  const [preview, setPreview] = useState<FulfillmentPreview | null>(null);
  const [isApplying, setIsApplying] = useState(false);

  const { data: cart } = useGetCart(cartId || "", {
    query: { enabled: Boolean(cartId), queryKey: getGetCartQueryKey(cartId || "") },
  });
  const deleteCartItem = useDeleteCartItem();
  const previewFulfillment = usePreviewFulfillment();
  const { data: branches } = useListBranches();
  const branch = branches?.find((item) => item.id === branchId);

  const draftDateObject = draftDate ? parseISO(draftDate) : null;
  const { data: slots, isLoading: isLoadingSlots } = useListFulfillmentSlots(
    {
      branchId: branchId!,
      date: draftDate || format(today, "yyyy-MM-dd"),
      method: "pickup",
      cartId: cartId || undefined,
    },
    {
      query: {
        enabled: Boolean(branchId && draftDate && isOpen),
        queryKey: getListFulfillmentSlotsQueryKey({
          branchId: branchId!,
          date: draftDate || format(today, "yyyy-MM-dd"),
          method: "pickup",
          cartId: cartId || undefined,
        }),
      },
    },
  );

  useEffect(() => {
    if (required && branchId && (!selectedDate || !selectedTime)) {
      setDraftDate(null);
      setDraftTime(null);
      setPreview(null);
      setIsOpen(true);
    }
  }, [required, branchId, selectedDate, selectedTime]);

  const calendarDays = useMemo(() => {
    const first = startOfMonth(month);
    const last = endOfMonth(month);
    const leading = (getDay(first) + 6) % 7;
    return [
      ...Array.from({ length: leading }, () => null),
      ...eachDayOfInterval({ start: first, end: last }),
    ];
  }, [month]);

  const chooseDate = (date: Date) => {
    if (isBefore(date, today) || isDateClosed(date)) return;
    setDraftDate(format(date, "yyyy-MM-dd"));
    setDraftTime(null);
    setPreview(null);
  };

  const isDateClosed = (date: Date) => {
    if (!branch?.hours?.length) return false;
    const weekday = format(date, "EEEE", { locale: enUS }).toLowerCase();
    const hours = branch.hours.find((item) => item.day.toLowerCase() === weekday);
    return Boolean(hours?.closed);
  };

  const openSelector = () => {
    setDraftDate(selectedDate);
    setDraftTime(selectedTime);
    setPreview(null);
    setIsOpen(true);
  };

  const applySelection = async () => {
    if (!draftDate || !draftTime) {
      toast({
        title: "Completa tu horario",
        description: "Selecciona una fecha y un horario para ver los productos disponibles.",
        variant: "destructive",
      });
      return;
    }

    if (!cartId || !cart?.items.length) {
      setFulfillmentContext(draftDate, draftTime);
      setIsOpen(false);
      return;
    }

    setIsApplying(true);
    try {
      const result = await previewFulfillment.mutateAsync({
        data: {
          cartId,
          scheduledStart: draftTime,
          fulfillmentMethod: "pickup",
        },
      });
      setPreview(result);
      if (!result.slotAvailable) return;
      if (!result.unavailableItems.length) {
        setFulfillmentContext(draftDate, draftTime);
        setPreview(null);
        setIsOpen(false);
      }
    } catch (error: any) {
      toast({
        title: "No pudimos validar ese horario",
        description: error?.message || "Selecciona otro horario e inténtalo nuevamente.",
        variant: "destructive",
      });
    } finally {
      setIsApplying(false);
    }
  };

  const confirmPreview = async () => {
    if (!preview || !draftDate || !draftTime || !preview.slotAvailable) return;
    setIsApplying(true);
    try {
      for (const item of preview.unavailableItems) {
        await deleteCartItem.mutateAsync({ id: cartId!, itemId: item.cartItemId });
      }
      setFulfillmentContext(draftDate, draftTime);
      await queryClient.invalidateQueries({ queryKey: getGetCartQueryKey(cartId!) });
      setPreview(null);
      setIsOpen(false);
    } catch (error: any) {
      toast({
        title: "No pudimos actualizar tu bolsa",
        description: error?.message || "Conservamos tu fecha actual.",
        variant: "destructive",
      });
    } finally {
      setIsApplying(false);
    }
  };

  const shouldBlockClose = Boolean(required && branchId && (!selectedDate || !selectedTime));
  const currentLabel = selectedDate && selectedTime
    ? `${format(parseISO(selectedDate), "d MMM", { locale: es })} · ${displayTime(selectedTime)}`
    : "Elegir fecha y hora";

  return (
    <>
      {branchId && (
        <>
          <button
            type="button"
            onClick={openSelector}
            className="hidden items-center gap-2 border-l border-border/70 pl-4 text-left md:flex"
            aria-label="Cambiar fecha y hora"
          >
            <CalendarDays className="h-4 w-4 text-primary" />
            <span>
              <span className="block text-[9px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Tu horario</span>
              <span className="flex items-center gap-1 text-xs font-semibold">{currentLabel}<ChevronRight className="h-3 w-3 rotate-90" /></span>
            </span>
          </button>
          <button
            type="button"
            onClick={openSelector}
            className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.12em] md:hidden"
            aria-label="Cambiar fecha y hora"
          >
            <CalendarDays className="h-3.5 w-3.5 text-primary" />
            <span>{selectedDate && selectedTime ? format(parseISO(selectedDate), "d MMM", { locale: es }) : "Fecha"}</span>
            <ChevronRight className="h-3 w-3 rotate-90" />
          </button>
        </>
      )}

      <Dialog open={isOpen} onOpenChange={(open) => !shouldBlockClose && setIsOpen(open)}>
        <DialogContent
          className={`max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-none border-border bg-[var(--mallorca-ivory)] p-0 sm:max-w-3xl ${shouldBlockClose ? "[&>button]:hidden" : ""}`}
          onPointerDownOutside={(event) => shouldBlockClose && event.preventDefault()}
          onEscapeKeyDown={(event) => shouldBlockClose && event.preventDefault()}
        >
          <div className="bg-[var(--mallorca-burgundy)] px-6 py-8 text-white sm:px-10 sm:py-10">
            <DialogHeader className="text-left">
              <span className="mallorca-kicker text-[var(--mallorca-butter)]">Tu momento Mallorca</span>
              <DialogTitle className="mallorca-display mt-3 text-4xl text-white sm:text-5xl">¿Para cuándo lo necesitas?</DialogTitle>
              <DialogDescription className="mt-3 max-w-xl text-sm leading-relaxed text-white/75">
                Elegimos contigo el día y el horario para mostrar únicamente lo que podemos preparar para tu pedido.
              </DialogDescription>
            </DialogHeader>
          </div>

          <div className="p-6 sm:p-10">
            {preview ? (
              <div>
                <div className="flex items-start gap-3 border-b border-border pb-5">
                  <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                  <div>
                    <h3 className="font-serif text-2xl">Revisa tu nuevo horario</h3>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                      Algunos productos de tu bolsa no pueden prepararse para {draftDate ? format(parseISO(draftDate), "d 'de' MMMM", { locale: es }) : "esta fecha"}.
                    </p>
                  </div>
                </div>
                <div className="mt-5 space-y-3">
                  {preview.items.map((item) => (
                    <div key={item.cartItemId} className="flex items-center justify-between gap-4 border-b border-border/70 py-3 text-sm">
                      <span>{item.quantity} × {item.name}</span>
                      <span className={item.available ? "flex items-center gap-1 text-green-700" : "flex items-center gap-1 text-destructive"}>
                        {item.available ? <Check className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
                        {item.available ? "Disponible" : item.reason || "No disponible"}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                  <Button type="button" variant="outline" onClick={() => setPreview(null)} className="rounded-none" disabled={isApplying}>Mantener horario actual</Button>
                  <Button type="button" onClick={confirmPreview} className="rounded-none bg-primary text-primary-foreground hover:bg-primary/90" disabled={isApplying}>
                    {isApplying ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Cambiar y eliminar no disponibles
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <div className="grid gap-8 md:grid-cols-[1fr_0.9fr]">
                  <div>
                    <div className="mb-4 flex items-center justify-between">
                      <div>
                        <span className="mallorca-kicker text-primary">Fecha</span>
                        <h3 className="mt-1 font-serif text-2xl capitalize">{format(month, "LLLL yyyy", { locale: es })}</h3>
                      </div>
                      <div className="flex gap-1">
                        <Button type="button" variant="outline" size="icon" onClick={() => setMonth(subMonths(month, 1))} disabled={isSameDay(startOfMonth(month), startOfMonth(today))} aria-label="Mes anterior"><ChevronLeft className="h-4 w-4" /></Button>
                        <Button type="button" variant="outline" size="icon" onClick={() => setMonth(addMonths(month, 1))} aria-label="Mes siguiente"><ChevronRight className="h-4 w-4" /></Button>
                      </div>
                    </div>
                    <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                      {dayLabels.map((day, index) => <span key={`${day}-${index}`} className="py-2">{day}</span>)}
                      {calendarDays.map((date, index) => {
                        if (!date) return <span key={`empty-${index}`} />;
                        const value = format(date, "yyyy-MM-dd");
                        const disabled = isBefore(date, today) || isDateClosed(date);
                        const selected = draftDate === value;
                        return (
                          <button
                            type="button"
                            key={value}
                            disabled={disabled}
                            onClick={() => chooseDate(date)}
                            className={`relative aspect-square rounded-none border text-sm transition-colors ${selected ? "border-primary bg-primary text-white" : "border-transparent hover:border-primary"} ${disabled ? "cursor-not-allowed text-muted-foreground/35" : ""}`}
                          >
                            {format(date, "d")}
                            {isSameDay(date, today) && !selected ? <span className="absolute bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-primary" /> : null}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div>
                    <div className="mb-4">
                      <span className="mallorca-kicker text-primary">Horario</span>
                      <h3 className="mt-1 font-serif text-2xl">{draftDateObject ? format(draftDateObject, "d 'de' MMMM", { locale: es }) : "Elige una fecha"}</h3>
                    </div>
                    {!draftDate ? (
                      <p className="text-sm leading-relaxed text-muted-foreground">Selecciona un día para consultar los horarios disponibles en tu sucursal.</p>
                    ) : isLoadingSlots ? (
                      <div className="flex items-center py-8 text-sm text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Consultando horarios</div>
                    ) : slots?.length ? (
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                        {slots.map((slot) => {
                          const value = slot.start;
                          const available = slot.available;
                          return (
                            <button
                              type="button"
                              key={value}
                              disabled={!available}
                              onClick={() => setDraftTime(value)}
                              className={`border px-3 py-3 text-sm transition-colors ${draftTime === value ? "border-primary bg-primary text-white" : available ? "border-border hover:border-primary" : "cursor-not-allowed border-border/50 text-muted-foreground/50"}`}
                            >
                              <Clock className="mx-auto mb-1 h-3.5 w-3.5" />
                              {displayTime(value)}
                              {!available ? <span className="mt-1 block text-[10px]">No disponible</span> : null}
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-sm leading-relaxed text-muted-foreground">Esta fecha no tiene horarios disponibles para la sucursal. Prueba con otro día.</p>
                    )}
                  </div>
                </div>
                <div className="mt-8 flex justify-end border-t border-border pt-6">
                  <Button type="button" onClick={applySelection} disabled={!draftDate || !draftTime || isApplying} className="rounded-none bg-primary text-primary-foreground hover:bg-primary/90">
                    {isApplying ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Ver productos disponibles
                  </Button>
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}