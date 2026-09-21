import { StoreLayout } from "@/components/layout/store-layout";
import { useCart } from "@/lib/cart-context";
import {
  useGetCart,
  useValidateDelivery,
  useListFulfillmentSlots,
  useCreateOrder,
  usePreviewOrder,
  useListCheckoutPaymentMethods,
  OrderInputFulfillmentMethod,
  getGetCartQueryKey,
  getListFulfillmentSlotsQueryKey,
  getListCheckoutPaymentMethodsQueryKey,
  type AdminOrderPreview,
  type PaymentMethod,
} from "@workspace/api-client-react";
import { useAppUser } from "@/lib/app-auth";
import { Link, useLocation, Redirect } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { MapPin, ArrowLeft, Loader2, Clock, AlertCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { addDays, format } from "date-fns";
import { es } from "date-fns/locale";
import { formatMxn, resolveFulfillmentMethod } from "@/lib/availability-copy";
import { track } from "@/lib/analytics";

function slotLabel(value: string) {
  return new Date(value).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
}

export default function CheckoutPage() {
  const {
    cartId,
    branchId,
    selectedDate,
    selectedTime,
    fulfillmentMethod,
    setFulfillmentMethod,
    setFulfillmentContext,
    clearCartSession,
  } = useCart();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const { data: cart, isLoading: isLoadingCart } = useGetCart(cartId!, {
    query: { enabled: !!cartId, queryKey: getGetCartQueryKey(cartId!) }
  });

  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [street, setStreet] = useState("");
  const [number, setNumber] = useState("");
  const [colonia, setColonia] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [checkoutDate, setCheckoutDate] = useState(selectedDate || format(new Date(), "yyyy-MM-dd"));
  const [selectedSlot, setSelectedSlot] = useState(selectedTime || "");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("CASH_ON_PICKUP");
  const { user, isSignedIn } = useAppUser();

  const CHECKOUT_DRAFT_KEY = "mallorca_checkout_draft";

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(CHECKOUT_DRAFT_KEY);
      if (!raw) return;
      const draft = JSON.parse(raw) as {
        customerName?: string;
        customerEmail?: string;
        customerPhone?: string;
        notes?: string;
        street?: string;
        number?: string;
        colonia?: string;
        postalCode?: string;
      };
      if (draft.customerName) setCustomerName(draft.customerName);
      if (draft.customerEmail) setCustomerEmail(draft.customerEmail);
      if (draft.customerPhone) setCustomerPhone(draft.customerPhone);
      if (draft.notes) setNotes(draft.notes);
      if (draft.street) setStreet(draft.street);
      if (draft.number) setNumber(draft.number);
      if (draft.colonia) setColonia(draft.colonia);
      if (draft.postalCode) setPostalCode(draft.postalCode);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    sessionStorage.setItem(CHECKOUT_DRAFT_KEY, JSON.stringify({
      customerName, customerEmail, customerPhone, notes, street, number, colonia, postalCode,
    }));
  }, [customerName, customerEmail, customerPhone, notes, street, number, colonia, postalCode]);

  useEffect(() => {
    track("begin_checkout", { cartId, branchId });
  }, [cartId, branchId]);

  useEffect(() => {
    if (isSignedIn && user) {
      if (!customerName) setCustomerName(`${user.firstName || ""} ${user.lastName || ""}`.trim());
      if (!customerEmail) setCustomerEmail(user.primaryEmailAddress?.emailAddress || "");
    }
  }, [isSignedIn, user, customerName, customerEmail]);

  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [isGettingLocation, setIsGettingLocation] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const validateDelivery = useValidateDelivery();
  const [deliveryInfo, setDeliveryInfo] = useState<{ eligible: boolean; fee: number; reason: string | null } | null>(null);

  const { data: slots, isLoading: isLoadingSlots } = useListFulfillmentSlots({
    branchId: branchId!,
    date: checkoutDate,
    method: fulfillmentMethod,
    cartId: cartId!,
  }, {
    query: {
      enabled: !!cartId && !!branchId && !!checkoutDate && !!fulfillmentMethod,
      queryKey: getListFulfillmentSlotsQueryKey({
        branchId: branchId!,
        date: checkoutDate,
        method: fulfillmentMethod,
        cartId: cartId!,
      }),
    },
  });

  useEffect(() => {
    if (selectedTime) setSelectedSlot(selectedTime);
  }, [selectedTime]);

  const { data: paymentMethods = [] } = useListCheckoutPaymentMethods(
    { branchId: branchId!, fulfillmentMethod },
    {
      query: {
        enabled: !!branchId,
        queryKey: getListCheckoutPaymentMethodsQueryKey({ branchId: branchId!, fulfillmentMethod }),
      },
    },
  );

  useEffect(() => {
    if (!cart?.branch) return;
    const next = resolveFulfillmentMethod(fulfillmentMethod, cart.branch);
    if (next && next !== fulfillmentMethod) {
      setFulfillmentMethod(next);
      setSelectedSlot("");
    }
  }, [cart?.branch?.id, cart?.branch?.pickupAvailable, cart?.branch?.deliveryAvailable, fulfillmentMethod, setFulfillmentMethod]);

  useEffect(() => {
    if (fulfillmentMethod === "delivery") {
      setPaymentMethod("PENDING");
      return;
    }
    if (paymentMethods.some((method) => method.code === paymentMethod)) return;
    setPaymentMethod((paymentMethods[0]?.code as PaymentMethod | undefined) ?? "CASH_ON_PICKUP");
  }, [fulfillmentMethod, paymentMethods, paymentMethod]);
  const createOrder = useCreateOrder();
  const previewOrder = usePreviewOrder();
  const [preview, setPreview] = useState<AdminOrderPreview | null>(null);

  const upcomingDays = useMemo(
    () => Array.from({ length: 14 }, (_, index) => addDays(new Date(), index)),
    [],
  );

  const deliverySnapshot = fulfillmentMethod === "delivery"
    ? {
        street,
        externalNumber: number,
        neighborhood: colonia,
        postalCode,
      }
    : undefined;

  const deliveryAddress = [street, number, colonia, postalCode ? `C.P. ${postalCode}` : ""]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(", ");

  const previewBody = cartId && selectedSlot ? {
    cartId,
    fulfillmentMethod,
    scheduledStart: selectedSlot,
    customerEmail: customerEmail || "preview@pasteleriamallorca.mx",
    customerName: customerName || "Preview",
    customerPhone: customerPhone || "0000000000",
    notes,
    deliveryAddress: fulfillmentMethod === "delivery" ? deliveryAddress : undefined,
    deliveryAddressSnapshot: deliverySnapshot,
    deliveryLatitude: fulfillmentMethod === "delivery" ? lat : undefined,
    deliveryLongitude: fulfillmentMethod === "delivery" ? lng : undefined,
  } : null;

  useEffect(() => {
    if (!previewBody) return;
    if (fulfillmentMethod === "delivery" && (!lat || !lng || !deliveryInfo?.eligible)) {
      setPreview(null);
      return;
    }
    const handle = window.setTimeout(async () => {
      try {
        const result = await previewOrder.mutateAsync({ data: previewBody });
        setPreview(result);
      } catch {
        setPreview(null);
      }
    }, 350);
    return () => window.clearTimeout(handle);
  }, [
    cartId,
    selectedSlot,
    fulfillmentMethod,
    customerEmail,
    customerName,
    customerPhone,
    deliveryAddress,
    lat,
    lng,
    deliveryInfo?.eligible,
  ]);

  const handleGetLocation = () => {
    if (!navigator.geolocation) {
      toast({ title: "Geolocalización no soportada", description: "Tu navegador no soporta geolocalización.", variant: "destructive" });
      return;
    }
    setIsGettingLocation(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        setIsGettingLocation(false);
        setLat(position.coords.latitude);
        setLng(position.coords.longitude);
        if (cart) {
          try {
            const result = await validateDelivery.mutateAsync({
              data: {
                branchId: cart.branch.id,
                latitude: position.coords.latitude,
                longitude: position.coords.longitude,
                subtotal: cart.subtotal
              }
            });
            setDeliveryInfo({ eligible: result.eligible, fee: result.deliveryFee, reason: result.reason });
            if (!result.eligible) {
              toast({
                title: "Envío no disponible",
                description: result.reason || "Tu ubicación está fuera del área de cobertura.",
                variant: "destructive"
              });
            } else {
              toast({ title: "Ubicación confirmada", description: "Estás dentro de nuestra área de entrega." });
            }
          } catch {
            toast({ title: "Error validando entrega", description: "Intenta de nuevo más tarde.", variant: "destructive" });
          }
        }
      },
      () => {
        setIsGettingLocation(false);
        toast({ title: "Error obteniendo ubicación", description: "Asegúrate de conceder permisos al navegador.", variant: "destructive" });
      }
    );
  };

  const handleCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cartId || !cart) return;

    if (fulfillmentMethod === "delivery" && (!deliveryInfo?.eligible || !lat || !lng || !deliveryAddress)) {
      toast({ title: "Revisa tu entrega", description: "Completa dirección y comparte tu ubicación para validar cobertura.", variant: "destructive" });
      return;
    }

    if (!checkoutDate || !selectedSlot) {
      toast({ title: "Horario faltante", description: "Selecciona fecha y horario aquí mismo.", variant: "destructive" });
      return;
    }

    if (isSubmitting || createOrder.isPending) return;
    setIsSubmitting(true);
    try {
      const order = await createOrder.mutateAsync({
        data: {
          cartId,
          fulfillmentMethod,
          scheduledStart: selectedSlot,
          customerEmail,
          customerName,
          customerPhone,
          notes,
          paymentMethod: fulfillmentMethod === "pickup" ? paymentMethod : "PENDING",
          deliveryAddress: fulfillmentMethod === "delivery" ? deliveryAddress : undefined,
          deliveryAddressSnapshot: deliverySnapshot,
          deliveryLatitude: fulfillmentMethod === "delivery" ? lat ?? undefined : undefined,
          deliveryLongitude: fulfillmentMethod === "delivery" ? lng ?? undefined : undefined,
        }
      });

      track("purchase", {
        orderId: order.id,
        value: order.total,
        payment_type: fulfillmentMethod === "pickup" ? paymentMethod : "PENDING",
        fulfillmentMethod,
      });

      const orderUrl = `/pedido/${order.id}/${order.guestAccessToken}`;
      localStorage.setItem("mallorca_last_guest_order", orderUrl);
      sessionStorage.removeItem("mallorca_checkout_draft");
      clearCartSession();
      setLocation(orderUrl);
    } catch (err: any) {
      setIsSubmitting(false);
      toast({ title: "Error creando pedido", description: err.message || "Ocurrió un error inesperado.", variant: "destructive" });
    }
  };

  const fallbackTotal = (cart?.subtotal || 0) + (fulfillmentMethod === "delivery" && deliveryInfo?.eligible ? deliveryInfo.fee : 0);
  const subtotal = preview?.subtotal ?? cart?.subtotal ?? 0;
  const deliveryFee = preview?.deliveryFee ?? (fulfillmentMethod === "delivery" && deliveryInfo?.eligible ? deliveryInfo.fee : 0);
  const discount = (preview?.promotionDiscountTotal ?? 0) + (preview?.discountAmount ?? 0) + (preview?.couponDiscount ?? 0);
  const total = preview?.total ?? fallbackTotal;
  const minimumOrder = cart?.branch.minimumOrder ?? 0;
  const minimumRemaining = Math.max(0, minimumOrder - (preview?.subtotal ?? cart?.subtotal ?? 0));
  const selectedSlotAvailable = Boolean(slots?.some((slot) => slot.start === selectedSlot && slot.available));
  const priceChanges = (preview?.lines ?? []).flatMap((line) => {
    const cartLine = cart?.items.find((item) => item.productId === line.productId && item.quantity === line.quantity)
      ?? cart?.items.find((item) => item.productId === line.productId);
    if (!cartLine || Math.abs(cartLine.unitPrice - line.unitPrice) < 0.01) return [];
    return [`El precio de ${line.name} cambió de ${formatMxn(cartLine.unitPrice)} a ${formatMxn(line.unitPrice)}.`];
  });
  const availabilityChanges = (preview?.lines ?? [])
    .filter((line) => !line.available)
    .map((line) => line.reason || `${line.name} ya no está disponible.`);

  if (isLoadingCart) {
    return (
      <StoreLayout>
        <div className="container mx-auto px-4 py-8 animate-pulse text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" />
        </div>
      </StoreLayout>
    );
  }

  if (!isLoadingCart && (!cart || cart.items.length === 0)) {
    return <Redirect to="/carrito" />;
  }

  if (!cart) return null;

  const payCopy = fulfillmentMethod === "delivery" ? "Pagas al recibirlo" : "Efectivo al recoger";
  const ctaLabel = fulfillmentMethod === "delivery" ? "Confirmar pedido · Pagas al recibirlo" : "Confirmar pedido";

  return (
    <StoreLayout>
      <div className="container mx-auto px-4 py-5 md:py-8 pb-32 lg:pb-12">
        <Link href="/carrito" className="inline-flex items-center text-sm font-medium text-muted-foreground hover:text-foreground mb-4 transition-colors">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Volver a la bolsa
        </Link>

        <div className="mb-5">
          <span className="mallorca-kicker text-primary">Confirmar pedido</span>
          <h1 className="mallorca-display mt-2 text-3xl md:text-4xl">Contacto, entrega y horario</h1>
          <p className="mt-2 text-sm text-muted-foreground">Una sola página. {payCopy}.</p>
        </div>

        <form id="checkout-form" onSubmit={handleCheckout} className="flex min-w-0 flex-col lg:flex-row gap-8">
          <div className="w-full min-w-0 lg:w-2/3 space-y-8">
            <section>
              <h2 className="font-serif text-xl mb-4">1. Contacto</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <Label htmlFor="name">¿A nombre de quién lo preparamos?</Label>
                  <Input id="name" value={customerName} onChange={e => setCustomerName(e.target.value)} required className="mt-1" />
                </div>
                <div>
                  <Label htmlFor="email">Tu correo</Label>
                  <Input id="email" type="email" value={customerEmail} onChange={e => setCustomerEmail(e.target.value)} required className="mt-1" />
                </div>
                <div>
                  <Label htmlFor="phone">Tu teléfono</Label>
                  <Input id="phone" type="tel" value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} required className="mt-1" />
                </div>
                <div className="sm:col-span-2">
                  <Label htmlFor="notes">Notas (opcional)</Label>
                  <Textarea id="notes" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Instrucciones especiales" className="mt-1" />
                </div>
              </div>
            </section>

            <section>
              <h2 className="font-serif text-xl mb-4 flex items-center gap-2">
                <MapPin className="w-5 h-5 text-primary" />
                2. Entrega
              </h2>
              <p className="mb-3 text-sm text-muted-foreground">Sucursal: <span className="font-medium text-foreground">{cart.branch.name}</span></p>
              <RadioGroup
                value={fulfillmentMethod}
                onValueChange={(val: OrderInputFulfillmentMethod) => {
                  setFulfillmentMethod(val);
                  setSelectedSlot("");
                  track("fulfillment_selected", { method: val });
                }}
                className="grid grid-cols-1 sm:grid-cols-2 gap-3"
              >
                <div className={`border p-4 cursor-pointer ${fulfillmentMethod === "pickup" ? "border-primary bg-primary/5" : "border-border"} ${!cart.branch.pickupAvailable ? "opacity-50 pointer-events-none" : ""}`} onClick={() => {
                  if (!cart.branch.pickupAvailable) return;
                  setFulfillmentMethod("pickup");
                  setSelectedSlot("");
                  track("fulfillment_selected", { method: "pickup" });
                }}>
                  <RadioGroupItem value="pickup" id="pickup" className="sr-only" disabled={!cart.branch.pickupAvailable} />
                  <Label htmlFor="pickup" className="font-semibold cursor-pointer">Recoger en sucursal</Label>
                  {cart.branch.pickupAvailable ? (
                    <p className="text-sm text-muted-foreground mt-1">Sin costo extra. Pagas al recoger.</p>
                  ) : (
                    <p className="text-sm text-destructive mt-1">Esta sucursal no ofrece recolección.</p>
                  )}
                </div>
                <div className={`border p-4 cursor-pointer ${fulfillmentMethod === "delivery" ? "border-primary bg-primary/5" : "border-border"} ${!cart.branch.deliveryAvailable ? "opacity-50 pointer-events-none" : ""}`} onClick={() => {
                  if (!cart.branch.deliveryAvailable) return;
                  setFulfillmentMethod("delivery");
                  setSelectedSlot("");
                  track("fulfillment_selected", { method: "delivery" });
                }}>
                  <RadioGroupItem value="delivery" id="delivery" className="sr-only" disabled={!cart.branch.deliveryAvailable} />
                  <Label htmlFor="delivery" className="font-semibold cursor-pointer">Envío a domicilio</Label>
                  {cart.branch.deliveryAvailable ? (
                    <p className="text-sm text-muted-foreground mt-1">Pagas al recibirlo. Cobertura por GPS.</p>
                  ) : (
                    <p className="text-sm text-destructive mt-1">Esta sucursal no ofrece domicilio.</p>
                  )}
                </div>
              </RadioGroup>

              {fulfillmentMethod === "delivery" && (
                <div className="mt-4 p-4 border border-border bg-secondary/10 space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="sm:col-span-2">
                      <Label htmlFor="street">Calle</Label>
                      <Input id="street" value={street} onChange={(e) => setStreet(e.target.value)} required className="mt-1" />
                    </div>
                    <div>
                      <Label htmlFor="number">Número</Label>
                      <Input id="number" value={number} onChange={(e) => setNumber(e.target.value)} required className="mt-1" />
                    </div>
                    <div>
                      <Label htmlFor="colonia">Colonia</Label>
                      <Input id="colonia" value={colonia} onChange={(e) => setColonia(e.target.value)} required className="mt-1" />
                    </div>
                    <div>
                      <Label htmlFor="cp">C.P.</Label>
                      <Input id="cp" value={postalCode} onChange={(e) => setPostalCode(e.target.value)} required className="mt-1" />
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    La dirección es para el repartidor. El GPS confirma si estás dentro del radio de {cart.branch.name}; no geocodificamos la calle.
                  </p>
                  <div className="flex flex-col sm:flex-row items-center gap-3">
                    <Button type="button" variant="outline" onClick={handleGetLocation} disabled={isGettingLocation} className="w-full sm:w-auto">
                      {isGettingLocation ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <MapPin className="w-4 h-4 mr-2" />}
                      Compartir ubicación
                    </Button>
                    <div className="text-sm text-muted-foreground">
                      {lat && lng ? <span className="text-primary font-medium">Cobertura validada</span> : "Requerido para validar cobertura"}
                    </div>
                  </div>
                  {deliveryInfo && !deliveryInfo.eligible && (
                    <div className="bg-destructive/10 p-3 border border-destructive/20 text-destructive text-sm flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 mt-0.5" />
                      <span>{deliveryInfo.reason}</span>
                    </div>
                  )}
                </div>
              )}
            </section>

            {fulfillmentMethod === "pickup" && paymentMethods.length > 0 ? (
              <section>
                <h2 className="font-serif text-xl mb-4">3. Forma de pago</h2>
                <RadioGroup
                  value={paymentMethod}
                  onValueChange={(value) => setPaymentMethod(value as PaymentMethod)}
                  className="space-y-3"
                >
                  {paymentMethods.map((method) => (
                    <div
                      key={method.code}
                      className={`border p-4 cursor-pointer ${paymentMethod === method.code ? "border-primary bg-primary/5" : "border-border"}`}
                      onClick={() => setPaymentMethod(method.code as PaymentMethod)}
                    >
                      <RadioGroupItem value={method.code} id={`pay-${method.code}`} className="sr-only" />
                      <Label htmlFor={`pay-${method.code}`} className="font-semibold cursor-pointer">
                        {method.customerLabel}
                      </Label>
                      {method.customerDescription ? (
                        <p className="text-sm text-muted-foreground mt-1">{method.customerDescription}</p>
                      ) : null}
                    </div>
                  ))}
                </RadioGroup>
              </section>
            ) : null}

            <section>
              <h2 className="font-serif text-xl mb-4 flex items-center gap-2">
                <Clock className="w-5 h-5 text-primary" />
                {fulfillmentMethod === "pickup" && paymentMethods.length > 0 ? "4. Fecha y horario" : "3. Fecha y horario"}
              </h2>
              <div className="flex min-w-0 gap-2 overflow-x-auto pb-2">
                {upcomingDays.map((day) => {
                  const value = format(day, "yyyy-MM-dd");
                  const selected = checkoutDate === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => {
                        setCheckoutDate(value);
                        setSelectedSlot("");
                        setFulfillmentContext(value, "");
                        track("date_selected", { date: value, source: "checkout" });
                      }}
                      className={`min-w-[4.5rem] border px-3 py-2 text-center text-sm ${selected ? "border-primary bg-primary text-white" : "border-border"}`}
                    >
                      <span className="block text-[10px] uppercase">{format(day, "EEE", { locale: es })}</span>
                      <span className="font-serif text-lg">{format(day, "d")}</span>
                    </button>
                  );
                })}
              </div>
              {isLoadingSlots ? (
                <div className="mt-4 flex items-center text-sm text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Consultando horarios {fulfillmentMethod}</div>
              ) : (
                <div className="mt-4 grid grid-cols-3 sm:grid-cols-4 gap-2">
                  {slots?.map((slot) => (
                    <button
                      key={slot.start}
                      type="button"
                      disabled={!slot.available}
                      onClick={() => {
                        setSelectedSlot(slot.start);
                        setFulfillmentContext(checkoutDate, slot.start);
                        track("time_selected", { time: slot.start, method: fulfillmentMethod, source: "checkout" });
                      }}
                      className={`border px-3 py-3 text-sm ${selectedSlot === slot.start ? "border-primary bg-primary text-white" : slot.available ? "border-border hover:border-primary" : "cursor-not-allowed text-muted-foreground/50"}`}
                    >
                      {slotLabel(slot.start)}
                    </button>
                  ))}
                </div>
              )}
              {selectedSlot && !selectedSlotAvailable && !isLoadingSlots && (
                <p className="mt-3 text-sm text-destructive">Ese horario no está disponible para {fulfillmentMethod === "delivery" ? "envío" : "recolección"}. Elige otro de la lista.</p>
              )}
            </section>
          </div>

          <div className="hidden w-full lg:block lg:w-1/3">
            <div className="bg-secondary/30 border border-border p-6 sticky top-24">
              <h2 className="font-serif text-xl mb-4 border-b border-border pb-3">Resumen</h2>
              <div className="space-y-3 mb-5 text-sm max-h-[240px] overflow-y-auto">
                {cart.items.map(item => (
                  <div key={item.id} className="flex justify-between gap-3">
                    <span><span className="font-medium">{item.quantity}x</span> {item.name}</span>
                    <span>{formatMxn(item.lineTotal)}</span>
                  </div>
                ))}
              </div>
              <div className="border-t border-border pt-4 space-y-2 mb-4 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span>{formatMxn(subtotal)}</span>
                </div>
                {discount > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Descuento</span>
                    <span>-{formatMxn(discount)}</span>
                  </div>
                )}
                {fulfillmentMethod === "delivery" && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Envío</span>
                    <span>{formatMxn(deliveryFee)}</span>
                  </div>
                )}
              </div>
              <div className="border-t border-border pt-4 mb-5 flex justify-between items-center">
                <span className="font-serif text-lg">Total</span>
                <span className="font-serif text-2xl">{formatMxn(total)}</span>
              </div>
              {minimumRemaining > 0 && (
                <div className="mb-4 border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
                  Agrega {formatMxn(minimumRemaining)} para el pedido mínimo de {formatMxn(minimumOrder)}.
                </div>
              )}
              {preview?.errors?.length ? (
                <p className="mb-4 text-sm text-destructive">{preview.errors[0]}</p>
              ) : null}
              {priceChanges.map((message) => (
                <p key={message} className="mb-2 text-sm text-amber-950">{message}</p>
              ))}
              {availabilityChanges.map((message) => (
                <p key={message} className="mb-2 text-sm text-destructive">{message}</p>
              ))}
              <Button
                type="submit"
                size="lg"
                disabled={
                  isSubmitting ||
                  createOrder.isPending ||
                  minimumRemaining > 0 ||
                  !selectedSlot ||
                  availabilityChanges.length > 0 ||
                  (fulfillmentMethod === "delivery" && !deliveryInfo?.eligible)
                }
                className="w-full h-12 rounded-none bg-primary text-primary-foreground hover:bg-primary/90"
              >
                {isSubmitting || createOrder.isPending ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : ctaLabel}
              </Button>
            </div>
          </div>
        </form>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 p-3 backdrop-blur lg:hidden">
        <div className="mb-2 flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Total · {payCopy}</span>
          <span className="font-serif text-lg">{formatMxn(total)}</span>
        </div>
        <Button
          type="submit"
          form="checkout-form"
          className="h-12 w-full rounded-md whitespace-normal text-sm"
          disabled={
            isSubmitting ||
            createOrder.isPending ||
            minimumRemaining > 0 ||
            !selectedSlot ||
            availabilityChanges.length > 0 ||
            (fulfillmentMethod === "delivery" && !deliveryInfo?.eligible)
          }
        >
          {isSubmitting || createOrder.isPending ? "Confirmando…" : ctaLabel}
        </Button>
      </div>
    </StoreLayout>
  );
}
