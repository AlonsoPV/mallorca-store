import { StoreLayout } from "@/components/layout/store-layout";
import { useCart } from "@/lib/cart-context";
import { 
  useGetCart, 
  useValidateDelivery, 
  useListFulfillmentSlots, 
  useCreateOrder, 
  useStartOrderPayment,
  OrderInputFulfillmentMethod,
  getGetCartQueryKey,
  getListFulfillmentSlotsQueryKey
} from "@workspace/api-client-react";
import { useUser } from "@clerk/react";
import { Link, useLocation, Redirect } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { MapPin, ShoppingBag, ArrowLeft, Loader2, Calendar as CalendarIcon, Clock, AlertCircle } from "lucide-react";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { format, addDays } from "date-fns";
import { es } from "date-fns/locale";

export default function CheckoutPage() {
  const { cartId, branchId, selectedDate, selectedTime, setFulfillmentContext, clearCartSession } = useCart();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  
  const { data: cart, isLoading: isLoadingCart } = useGetCart(cartId!, {
    query: { enabled: !!cartId, queryKey: getGetCartQueryKey(cartId!) }
  });

  const [fulfillmentMethod, setFulfillmentMethod] = useState<OrderInputFulfillmentMethod>("pickup");
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [notes, setNotes] = useState("");
  
  const { user, isSignedIn } = useUser();
  
  useEffect(() => {
    if (isSignedIn && user) {
      if (!customerName) setCustomerName(`${user.firstName || ''} ${user.lastName || ''}`.trim());
      if (!customerEmail) setCustomerEmail(user.primaryEmailAddress?.emailAddress || "");
    }
  }, [isSignedIn, user]);
  
  // Delivery State
  const [address, setAddress] = useState("");
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [isGettingLocation, setIsGettingLocation] = useState(false);
  
  // Fulfillment Date/Slot
  const [selectedSlot, setSelectedSlot] = useState<string>(selectedTime || "");

  const validateDelivery = useValidateDelivery();
  const [deliveryInfo, setDeliveryInfo] = useState<{ eligible: boolean; fee: number; reason: string | null } | null>(null);

  const { data: slots, isLoading: isLoadingSlots } = useListFulfillmentSlots({
    branchId: branchId!,
    date: selectedDate || format(new Date(), "yyyy-MM-dd"),
    method: fulfillmentMethod,
    cartId: cartId!
  }, {
    query: {
      enabled: !!cartId && !!branchId && !!selectedDate && !!fulfillmentMethod,
      queryKey: getListFulfillmentSlotsQueryKey({
        branchId: branchId!,
        date: selectedDate || format(new Date(), "yyyy-MM-dd"),
        method: fulfillmentMethod,
        cartId: cartId!
      })
    }
  });

  useEffect(() => {
    setSelectedSlot(selectedTime || "");
  }, [selectedTime]);

  const createOrder = useCreateOrder();
  const startPayment = useStartOrderPayment();

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
        
        // Auto validate
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
          } catch (err) {
            toast({ title: "Error validando entrega", description: "Intenta de nuevo más tarde.", variant: "destructive" });
          }
        }
      },
      (error) => {
        setIsGettingLocation(false);
        toast({ title: "Error obteniendo ubicación", description: "Asegúrate de conceder permisos al navegador.", variant: "destructive" });
      }
    );
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(price);
  };

  const handleCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cartId || !cart) return;

    if (fulfillmentMethod === "delivery" && (!deliveryInfo?.eligible || !lat || !lng || !address)) {
      toast({ title: "Revisa tu entrega", description: "Falta información de entrega válida.", variant: "destructive" });
      return;
    }

    if (!selectedDate || !selectedTime || !selectedSlot) {
      toast({ title: "Horario faltante", description: "Selecciona un horario de entrega/recogida.", variant: "destructive" });
      return;
    }

    try {
      const order = await createOrder.mutateAsync({
        data: {
          cartId: cartId,
          fulfillmentMethod,
           scheduledStart: selectedSlot,
          customerEmail,
          customerName,
          customerPhone,
          notes,
          deliveryAddress: address,
          deliveryLatitude: lat,
          deliveryLongitude: lng
        }
      });

      try {
        await startPayment.mutateAsync({
          id: order.id,
          data: { guestAccessToken: order.guestAccessToken },
        });
      } catch (err: any) {
        // Expected to fail with 503 or 400 PAYMENT_PROVIDER_NOT_CONFIGURED
      }
      
      const orderUrl = `/pedido/${order.id}/${order.guestAccessToken}`;
      localStorage.setItem('mallorca_last_guest_order', orderUrl);
      clearCartSession();
      setLocation(orderUrl);
      
    } catch (err: any) {
      toast({ title: "Error creando pedido", description: err.message || "Ocurrió un error inesperado.", variant: "destructive" });
    }
  };

  const total = (cart?.subtotal || 0) + (fulfillmentMethod === "delivery" && deliveryInfo?.eligible ? deliveryInfo.fee : 0);
  const minimumOrder = cart?.branch.minimumOrder ?? 0;
  const minimumRemaining = Math.max(0, minimumOrder - (cart?.subtotal ?? 0));
  const selectedSlotAvailable = Boolean(slots?.some((slot) => slot.start === selectedSlot && slot.available));

  if (isLoadingCart) {
    return (
      <StoreLayout>
        <div className="container mx-auto px-4 py-16 animate-pulse text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" />
        </div>
      </StoreLayout>
    );
  }

  if (!isLoadingCart && (!cart || cart.items.length === 0)) {
    return <Redirect to="/carrito" />;
  }

  if (!cart) return null;

  return (
    <StoreLayout>
      <div className="container mx-auto px-4 py-12 md:py-16">
        <Link href="/carrito" className="inline-flex items-center text-sm font-medium text-muted-foreground hover:text-foreground mb-8 transition-colors">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Volver al carrito
        </Link>
        
        <div className="mb-12 flex flex-wrap items-end justify-between gap-5">
          <div>
            <span className="mallorca-kicker text-primary">Tu Mallorca está casi lista</span>
            <h1 className="mallorca-display mt-3 text-5xl md:text-7xl">¿Cómo quieres recibirlo?</h1>
          </div>
          <div className="mallorca-kicker flex items-center gap-2 text-muted-foreground">
            <span className="text-primary">Bolsa</span><span>→</span><span className="text-primary">Entrega</span><span>→</span><span>Pago</span>
          </div>
        </div>
        
        <form onSubmit={handleCheckout} className="flex flex-col lg:flex-row gap-12">
          <div className="w-full lg:w-2/3 space-y-12">
            
            {/* 1. Fulfillment Method */}
            <section>
              <h2 className="font-serif text-2xl mb-6 flex items-center gap-2">
                <MapPin className="w-5 h-5 text-primary" /> 
                Método de Entrega
              </h2>
              <RadioGroup value={fulfillmentMethod} onValueChange={(val: OrderInputFulfillmentMethod) => { setFulfillmentMethod(val); setSelectedSlot(selectedTime || ""); }} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className={`border p-4 cursor-pointer transition-colors ${fulfillmentMethod === "pickup" ? "border-primary bg-primary/5" : "border-border"}`} onClick={() => setFulfillmentMethod("pickup")}>
                  <RadioGroupItem value="pickup" id="pickup" className="sr-only" />
                  <Label htmlFor="pickup" className="font-semibold text-lg cursor-pointer">Recoger en Sucursal</Label>
                  <p className="text-sm text-muted-foreground mt-2">Pasa por tu pedido a {cart.branch.name}. Sin costo adicional.</p>
                </div>
                <div className={`border p-4 cursor-pointer transition-colors ${fulfillmentMethod === "delivery" ? "border-primary bg-primary/5" : "border-border"} ${!cart.branch.deliveryAvailable ? "opacity-50 pointer-events-none" : ""}`} onClick={() => cart.branch.deliveryAvailable && setFulfillmentMethod("delivery")}>
                  <RadioGroupItem value="delivery" id="delivery" className="sr-only" disabled={!cart.branch.deliveryAvailable} />
                  <Label htmlFor="delivery" className="font-semibold text-lg cursor-pointer">Envío a Domicilio</Label>
                  {cart.branch.deliveryAvailable ? (
                    <p className="text-sm text-muted-foreground mt-2">Enviamos tu pedido desde {cart.branch.name}. Sujeto a área de cobertura.</p>
                  ) : (
                    <p className="text-sm text-destructive mt-2">Esta sucursal no ofrece servicio a domicilio.</p>
                  )}
                </div>
              </RadioGroup>

              {fulfillmentMethod === "delivery" && (
                <div className="mt-6 p-6 border border-border bg-secondary/10 space-y-4">
                  <div>
                    <Label htmlFor="address">Dirección completa</Label>
                    <Input id="address" value={address} onChange={e => setAddress(e.target.value)} required placeholder="Calle, Número, Colonia, C.P." className="mt-1" />
                  </div>
                  
                  <div className="flex flex-col sm:flex-row items-center gap-4 pt-2">
                    <Button type="button" variant="outline" onClick={handleGetLocation} disabled={isGettingLocation} className="w-full sm:w-auto shrink-0">
                      {isGettingLocation ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <MapPin className="w-4 h-4 mr-2" />}
                      Compartir ubicación exacta
                    </Button>
                    <div className="text-sm text-muted-foreground">
                      {lat && lng ? <span className="text-primary font-medium flex items-center gap-1"><MapPin className="w-3 h-3"/> Coordenadas obtenidas</span> : "Requerido para validar cobertura"}
                    </div>
                  </div>

                  {deliveryInfo && !deliveryInfo.eligible && (
                    <div className="bg-destructive/10 p-4 border border-destructive/20 text-destructive text-sm flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 mt-0.5" />
                      <span>{deliveryInfo.reason}</span>
                    </div>
                  )}
                </div>
              )}
            </section>

            {/* 2. Date and Slot */}
            <section>
              <h2 className="font-serif text-2xl mb-6 flex items-center gap-2">
                <Clock className="w-5 h-5 text-primary" /> 
                ¿Cuándo lo quieres?
              </h2>
              <div className="border border-border bg-secondary/10 p-5">
                <div className="grid gap-5 sm:grid-cols-2">
                  <div className="flex items-start gap-3">
                    <CalendarIcon className="mt-0.5 h-5 w-5 text-primary" />
                    <div>
                      <span className="mallorca-kicker text-primary">Fecha seleccionada</span>
                      <p className="mt-1 font-serif text-xl capitalize">{selectedDate ? format(new Date(`${selectedDate}T12:00:00`), "EEEE d 'de' MMMM", { locale: es }) : "Selecciona una fecha"}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <Clock className="mt-0.5 h-5 w-5 text-primary" />
                    <div>
                      <span className="mallorca-kicker text-primary">Horario seleccionado</span>
                      <p className="mt-1 font-serif text-xl">{selectedTime ? new Date(selectedTime).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" }) : "Selecciona un horario"}</p>
                    </div>
                  </div>
                </div>
                <p className="mt-4 text-sm text-muted-foreground">Puedes cambiar la fecha o la hora desde el encabezado sin perder tu contexto.</p>
              </div>
              {fulfillmentMethod === "delivery" && !isLoadingSlots && selectedTime && !selectedSlotAvailable && (
                <div className="mt-4 border border-primary/30 bg-primary/5 p-4">
                  <p className="text-sm font-medium">Este horario no está disponible para delivery. Elige otro:</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {slots?.filter((slot) => slot.available).map((slot) => (
                      <Button
                        key={slot.start}
                        type="button"
                        variant="outline"
                        className="rounded-none"
                        onClick={() => {
                          setSelectedSlot(slot.start);
                          if (selectedDate) setFulfillmentContext(selectedDate, slot.start);
                        }}
                      >
                        {new Date(slot.start).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}
                      </Button>
                    ))}
                  </div>
                </div>
              )}
            </section>

            {/* 3. Customer Info */}
            <section>
              <h2 className="font-serif text-2xl mb-6">Tus Datos</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
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
                  <Label htmlFor="notes">Notas adicionales (opcional)</Label>
                  <Textarea id="notes" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Instrucciones especiales para el pedido..." className="mt-1" />
                </div>
              </div>
            </section>
          </div>

          {/* Sidebar Summary */}
          <div className="w-full lg:w-1/3">
            <div className="bg-secondary/30 border border-border p-8 sticky top-24">
              <h2 className="font-serif text-2xl mb-6 border-b border-border pb-4">Resumen</h2>
              
              <div className="space-y-4 mb-6 text-sm max-h-[300px] overflow-y-auto pr-2">
                {cart.items.map(item => (
                  <div key={item.id} className="flex justify-between">
                    <div>
                      <span className="font-medium">{item.quantity}x</span> {item.name}
                    </div>
                    <span>{formatPrice(item.lineTotal)}</span>
                  </div>
                ))}
              </div>
              
              <div className="border-t border-border pt-6 space-y-3 mb-6 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span>{formatPrice(cart.subtotal)}</span>
                </div>
                {fulfillmentMethod === "delivery" && deliveryInfo?.eligible && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Costo de envío</span>
                    <span>{formatPrice(deliveryInfo.fee)}</span>
                  </div>
                )}
              </div>

              <div className="border-t border-border pt-6 mb-8 flex justify-between items-center">
                <span className="font-serif text-xl">Total Estimado</span>
                <span className="font-serif text-2xl">{formatPrice(total)}</span>
              </div>

              {minimumRemaining > 0 && (
                <div className="mb-6 border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
                  Agrega {formatPrice(minimumRemaining)} para alcanzar el pedido mínimo de {formatPrice(minimumOrder)} de esta sucursal.
                </div>
              )}
              
              <Button 
                type="submit" 
                size="lg" 
                disabled={
                  createOrder.isPending ||
                  startPayment.isPending ||
                  minimumRemaining > 0 ||
                  (fulfillmentMethod === "delivery" && !deliveryInfo?.eligible)
                }
                className="w-full h-14 rounded-none bg-primary text-primary-foreground hover:bg-primary/90 text-base"
              >
                {createOrder.isPending || startPayment.isPending ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : "Confirmar Pedido"}
              </Button>
            </div>
          </div>
        </form>
      </div>
    </StoreLayout>
  );
}
