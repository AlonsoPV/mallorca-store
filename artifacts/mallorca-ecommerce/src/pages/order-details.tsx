import { StoreLayout } from "@/components/layout/store-layout";
import { useGetGuestOrderDetails, useGetOrderDetails, getGetGuestOrderDetailsQueryKey, getGetOrderDetailsQueryKey } from "@workspace/api-client-react";
import { useParams, Link } from "wouter";
import { CheckCircle, Clock, MapPin, Map, Phone, Mail, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppAuth } from "@/lib/app-auth";

export default function OrderDetailsPage() {
  const { id, token } = useParams<{ id: string; token?: string }>();
  const { isSignedIn } = useAppAuth();
  
  const isGuest = !isSignedIn && !!token && token !== "user";
  
  const { data: guestOrder, isLoading: isLoadingGuest, isError: isErrorGuest } = useGetGuestOrderDetails(id!, token!, {
    query: { enabled: !!id && isGuest, queryKey: getGetGuestOrderDetailsQueryKey(id!, token!) }
  });
  
  const { data: userOrder, isLoading: isLoadingUser, isError: isErrorUser } = useGetOrderDetails(id!, {
    query: { enabled: !!id && !isGuest, queryKey: getGetOrderDetailsQueryKey(id!) }
  });

  const isLoading = isGuest ? isLoadingGuest : isLoadingUser;
  const isError = isGuest ? isErrorGuest : isErrorUser;
  const order = isGuest ? guestOrder : userOrder;

  if (isLoading) {
    return (
      <StoreLayout>
        <div className="container mx-auto px-4 py-16 animate-pulse text-center">
          <div className="w-16 h-16 bg-muted rounded-full mx-auto mb-6" />
          <div className="h-8 bg-muted w-1/3 mx-auto mb-4" />
          <div className="h-4 bg-muted w-1/4 mx-auto" />
        </div>
      </StoreLayout>
    );
  }

  if (isError || !order) {
    return (
      <StoreLayout>
        <div className="container mx-auto px-4 py-32 text-center flex flex-col items-center">
          <h2 className="font-serif text-4xl mb-4">Pedido no encontrado</h2>
          <p className="text-muted-foreground mb-8">El pedido que buscas no existe o no tienes permisos para verlo.</p>
          <Button asChild className="rounded-none">
            <Link href="/tienda">Volver a la tienda</Link>
          </Button>
        </div>
      </StoreLayout>
    );
  }

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(price);
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'pending_payment': return 'Pago pendiente';
      case 'paid': return 'Pagado';
      case 'preparing': return 'En preparación';
      case 'ready': return 'Listo';
      case 'completed': return 'Completado';
      case 'cancelled': return 'Cancelado';
      default: return status;
    }
  };

  const start = new Date(order.scheduledStart).toLocaleString('es-MX', { 
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric',
    hour: '2-digit', 
    minute: '2-digit' 
  });

  return (
    <StoreLayout>
      <div className="container mx-auto px-4 py-12 md:py-16 max-w-4xl">
        <div className="text-center mb-12">
          {order.paymentStatus === 'paid' ? (
            <CheckCircle className="w-16 h-16 text-primary mx-auto mb-6" />
          ) : (
            <Clock className="w-16 h-16 text-primary mx-auto mb-6" />
          )}
          <span className="mallorca-kicker text-primary">Todo listo</span>
          <h1 className="mallorca-display mb-4 mt-3 text-5xl md:text-7xl">Tu pedido está en Mallorca.</h1>
          <p className="text-xl text-muted-foreground">Pedido <span className="font-bold text-foreground">#{order.orderNumber}</span></p>
          
          {order.paymentStatus === 'pending' && (
            <div className="mt-8 bg-secondary p-6 border border-border inline-block text-left">
              <h3 className="font-bold text-lg mb-2">Pago pendiente</h3>
              <p className="max-w-sm text-sm text-muted-foreground">Tu pedido está reservado. El pago en línea estará disponible próximamente; por ahora, paga al recogerlo o recibirlo.</p>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="space-y-8">
            <section className="bg-secondary/20 p-6 border border-border">
              <h2 className="font-serif text-2xl mb-4 border-b border-border pb-2">Información del Pedido</h2>
              <div className="space-y-4 text-sm">
                <div className="flex items-center gap-3">
                  <Clock className="w-4 h-4 text-muted-foreground" />
                  <div>
                    <span className="block text-muted-foreground">Horario Programado</span>
                    <span className="font-medium capitalize">{start}</span>
                  </div>
                </div>
                
                <div className="flex items-center gap-3">
                  {order.fulfillmentMethod === 'delivery' ? <Map className="w-4 h-4 text-muted-foreground" /> : <MapPin className="w-4 h-4 text-muted-foreground" />}
                  <div>
                    <span className="block text-muted-foreground">{order.fulfillmentMethod === 'delivery' ? 'Entrega a Domicilio' : 'Recolección en Sucursal'}</span>
                    <span className="font-medium">{order.fulfillmentMethod === 'delivery' ? order.deliveryAddress : 'Ver sucursal en el mapa'}</span>
                  </div>
                </div>
                
                <div>
                  <span className="block text-muted-foreground mb-1">Estado del Pedido</span>
                  <span className="inline-block px-3 py-1 bg-primary/10 text-primary font-medium text-xs tracking-wider uppercase">
                    {getStatusText(order.status)}
                  </span>
                </div>
              </div>
            </section>

            <section className="bg-secondary/20 p-6 border border-border">
              <h2 className="font-serif text-2xl mb-4 border-b border-border pb-2">Datos del Cliente</h2>
              <div className="space-y-3 text-sm">
                <div className="flex items-center gap-3">
                  <User className="w-4 h-4 text-muted-foreground" />
                  <span>{order.customerName}</span>
                </div>
                <div className="flex items-center gap-3">
                  <Mail className="w-4 h-4 text-muted-foreground" />
                  <span>{order.customerEmail}</span>
                </div>
                <div className="flex items-center gap-3">
                  <Phone className="w-4 h-4 text-muted-foreground" />
                  <span>{order.customerPhone}</span>
                </div>
              </div>
            </section>
          </div>

          <div className="space-y-8">
            <section className="bg-secondary/30 p-6 border border-border sticky top-24">
              <h2 className="font-serif text-2xl mb-6 border-b border-border pb-4">Artículos</h2>
              
              <div className="space-y-4 mb-6">
                {order.items.map(item => (
                  <div key={item.id} className="flex justify-between text-sm">
                    <div>
                      <span className="font-medium">{item.quantity}x</span> {item.name}
                      {item.variantLabel && <p className="text-muted-foreground text-xs ml-5">{item.variantLabel}</p>}
                    </div>
                    <span>{formatPrice(item.lineTotal)}</span>
                  </div>
                ))}
              </div>
              
              <div className="border-t border-border pt-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span>{formatPrice(order.subtotal)}</span>
                </div>
                {order.deliveryFee > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Envío</span>
                    <span>{formatPrice(order.deliveryFee)}</span>
                  </div>
                )}
              </div>

              <div className="border-t border-border pt-4 mt-4 flex justify-between items-center">
                <span className="font-serif text-lg">{order.paymentStatus === 'paid' ? 'Total Pagado' : 'Total a Pagar'}</span>
                <span className="font-serif text-xl">{formatPrice(order.total)}</span>
              </div>
            </section>
          </div>
        </div>
        
        <div className="mt-12 text-center">
          <Button asChild variant="outline" className="rounded-none border-foreground text-foreground hover:bg-foreground hover:text-background h-12 px-8">
            <Link href="/tienda">Seguir comprando</Link>
          </Button>
        </div>
      </div>
    </StoreLayout>
  );
}
