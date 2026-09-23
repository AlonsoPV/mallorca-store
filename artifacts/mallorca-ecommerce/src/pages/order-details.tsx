import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { StoreLayout } from "@/components/layout/store-layout";
import {
  useGetGuestOrderDetails,
  useGetOrderDetails,
  getGetGuestOrderDetailsQueryKey,
  getGetOrderDetailsQueryKey,
  customFetch,
} from "@workspace/api-client-react";
import { useParams, Link, Redirect } from "wouter";
import {
  CheckCircle,
  Clock,
  MapPin,
  Phone,
  Download,
  Loader2,
  CircleAlert,
  Mail,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppAuth } from "@/lib/app-auth";
import { useToast } from "@/hooks/use-toast";
import {
  money,
  purchaseResult,
  scheduleLabel,
  paymentLabels,
  statusLabels,
} from "../../../../lib/purchase-result.mjs";

type Confirmation = {
  branchName?: string;
  branchAddress?: string;
  branchPhone?: string;
  notifications: { customer: { status: string }; branch: { status: string } };
};
function emailCopy(status?: string) {
  if (status === "preview")
    return "Comprobante preparado en el entorno de prueba. No se enviaron correos reales.";
  if (status === "sent")
    return "Comprobante enviado. Revisa también tu carpeta de spam.";
  if (status === "pending")
    return "Estamos enviando tu comprobante por correo.";
  if (status === "failed")
    return "No pudimos enviar el correo. Tu pedido está registrado y puedes descargar el comprobante aquí.";
  if (status === "not_configured")
    return "El envío por correo aún no está disponible. Descarga tu comprobante aquí.";
  if (status === "not_scheduled")
    return "Puedes descargar el comprobante de este pedido aquí.";
  return "Puedes descargar tu comprobante aquí. No pudimos confirmar el estado del correo.";
}
export default function OrderDetailsPage() {
  const { id, token } = useParams<{ id: string; token?: string }>();
  const { isSignedIn, isLoaded } = useAppAuth();
  const { toast } = useToast();
  const [downloading, setDownloading] = useState(false);
  // A valid guest link remains usable even when the customer has signed in meanwhile.
  const isGuest = !!token && token !== "user";
  const guest = useGetGuestOrderDetails(id!, token!, {
    query: {
      enabled: !!id && isGuest,
      queryKey: getGetGuestOrderDetailsQueryKey(id!, token!),
      refetchInterval: 30000,
    },
  });
  const account = useGetOrderDetails(id!, {
    query: {
      enabled: !!id && !isGuest && !!isSignedIn,
      queryKey: getGetOrderDetailsQueryKey(id!),
      refetchInterval: 30000,
    },
  });
  const query = isGuest ? guest : account;
  const order = query.data;
  const base = isGuest
    ? `/api/guest/orders/${encodeURIComponent(id || "")}/${encodeURIComponent(token || "")}`
    : `/api/orders/${encodeURIComponent(id || "")}`;
  const confirmation = useQuery({
    queryKey: ["order-confirmation", id, isGuest ? token : "user"],
    queryFn: () => customFetch<Confirmation>(`${base}/confirmation`),
    enabled: !!order,
    refetchInterval: (data) =>
      data.state.data?.notifications.customer.status === "pending" ||
      data.state.data?.notifications.branch.status === "pending"
        ? 15000
        : false,
    retry: 1,
  });
  async function download() {
    if (!order || downloading) return;
    setDownloading(true);
    try {
      const pdf = await customFetch<Blob>(`${base}/receipt.pdf`, {
        responseType: "blob",
      });
      if (!pdf.type.includes("application/pdf"))
        throw new Error("El comprobante no está disponible.");
      const url = URL.createObjectURL(pdf);
      const link = document.createElement("a");
      link.href = url;
      link.download = `Mallorca-${order.orderNumber.replace(/[^a-zA-Z0-9_-]/g, "")}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    } catch {
      toast({
        title: "No se pudo descargar",
        description:
          "Tu pedido sigue registrado. Vuelve a intentar la descarga.",
        variant: "destructive",
      });
    } finally {
      setDownloading(false);
    }
  }
  if (!isGuest && isLoaded && !isSignedIn)
    return (
      <Redirect
        to={`/sign-in?redirect_url=${encodeURIComponent(`/pedido/${id}/user`)}`}
      />
    );
  if (!isLoaded || query.isLoading)
    return (
      <StoreLayout>
        <div
          role="status"
          className="flex min-h-[50vh] items-center justify-center gap-3"
        >
          <Loader2 className="h-6 w-6 animate-spin" />
          Cargando tu pedido…
        </div>
      </StoreLayout>
    );
  if (query.isError || !order)
    return (
      <StoreLayout>
        <div className="mx-auto max-w-xl px-4 py-24 text-center">
          <CircleAlert className="mx-auto mb-5 h-12 w-12 text-muted-foreground" />
          <h1 className="font-serif text-3xl">
            No pudimos consultar el pedido
          </h1>
          <p className="my-5 text-muted-foreground">
            Revisa tu conexión o utiliza el enlace de tu comprobante. Si ya
            confirmaste la compra, no necesitas crear otro pedido.
          </p>
          <div className="flex justify-center gap-3">
            <Button onClick={() => query.refetch()}>Reintentar</Button>
            <Button asChild variant="outline">
              <Link href="/tienda">Volver a la tienda</Link>
            </Button>
          </div>
        </div>
      </StoreLayout>
    );
  const result = purchaseResult(order);
  const branch = confirmation.data;
  const Icon =
    result.tone === "success"
      ? CheckCircle
      : result.tone === "error"
        ? CircleAlert
        : Clock;
  return (
    <StoreLayout>
      <div className="mx-auto max-w-5xl px-4 py-10 md:py-16">
        <header className="mb-8 border border-border bg-secondary/20 p-6 text-center md:p-10">
          <Icon className="mx-auto mb-4 h-12 w-12 text-primary" />
          <span className="mallorca-kicker text-primary">
            Tu pedido en Mallorca
          </span>
          <h1 className="mt-3 font-serif text-3xl md:text-5xl">
            {result.title}
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-muted-foreground">
            {result.message}
          </p>
          <p className="mt-5 text-lg">
            Número de pedido <strong>#{order.orderNumber}</strong>
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2 text-sm">
            <span className="border bg-background px-3 py-1">
              Pedido: {statusLabels[order.status] || order.status}
            </span>
            <span className="border bg-background px-3 py-1">
              Pago: {result.paymentStatus}
            </span>
          </div>
          <Button
            className="mt-6 h-12 px-7"
            onClick={download}
            disabled={downloading}
          >
            {downloading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-2 h-4 w-4" />
            )}
            {downloading
              ? "Preparando comprobante…"
              : "Descargar comprobante PDF"}
          </Button>
          <p className="mt-2 text-xs text-muted-foreground">
            Comprobante de pedido; no es factura fiscal.
          </p>
        </header>
        <section
          aria-label="Confirmación por correo"
          className="mb-8 flex items-start gap-3 border p-5"
        >
          <Mail className="mt-1 h-5 w-5 shrink-0 text-primary" />
          <div className="min-w-0">
            <h2 className="font-medium">Tu comprobante por correo</h2>
            <p className="mt-1 break-words text-sm text-muted-foreground">
              {order.customerEmail}
            </p>
            <p role="status" className="mt-1 text-sm">
              {confirmation.isLoading
                ? "Consultando el estado del envío…"
                : emailCopy(branch?.notifications.customer.status)}
            </p>
            {branch?.notifications.branch.status === "sent" && (
              <p className="mt-1 text-sm text-muted-foreground">
                La sucursal también recibió la notificación del pedido.
              </p>
            )}
          </div>
        </section>
        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-6">
            <section className="border p-6">
              <h2 className="mb-5 flex items-center gap-2 font-serif text-2xl">
                <MapPin className="h-5 w-5" />
                {order.fulfillmentMethod === "delivery"
                  ? "Entrega a domicilio"
                  : "Recoge en sucursal"}
              </h2>
              <dl className="space-y-4 text-sm">
                <div>
                  <dt className="text-muted-foreground">Sucursal</dt>
                  <dd className="mt-1 font-medium">
                    {branch?.branchName ||
                      order.branchName ||
                      "Consulta la sucursal de tu pedido"}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">
                    Fecha y hora · Ciudad de México
                  </dt>
                  <dd className="mt-1 font-medium">
                    {scheduleLabel(order.scheduledStart)}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Dirección</dt>
                  <dd className="mt-1">
                    {order.fulfillmentMethod === "delivery"
                      ? order.deliveryAddress || "Por confirmar con la sucursal"
                      : branch?.branchAddress ||
                        "Consulta la dirección con la sucursal"}
                  </dd>
                </div>
              </dl>
              {branch?.branchPhone && (
                <a
                  className="mt-5 inline-flex items-center gap-2 text-sm underline"
                  href={`tel:${branch.branchPhone.replace(/[^+0-9]/g, "")}`}
                >
                  <Phone className="h-4 w-4" />
                  Contactar a la sucursal
                </a>
              )}
            </section>
            <section className="border p-6">
              <h2 className="mb-4 font-serif text-2xl">Datos de tu compra</h2>
              <dl className="space-y-3 text-sm">
                <div>
                  <dt className="text-muted-foreground">Cliente</dt>
                  <dd>{order.customerName}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Teléfono</dt>
                  <dd>{order.customerPhone}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Forma de pago</dt>
                  <dd>
                    {paymentLabels[order.paymentMethod || ""] ||
                      "Por confirmar"}
                  </dd>
                </div>
                {order.customerNotes && (
                  <div>
                    <dt className="text-muted-foreground">Tus indicaciones</dt>
                    <dd className="whitespace-pre-wrap break-words">
                      {order.customerNotes}
                    </dd>
                  </div>
                )}
              </dl>
            </section>
          </div>
          <section className="self-start border bg-secondary/10 p-6">
            <h2 className="mb-5 font-serif text-2xl">Resumen del pedido</h2>
            <ul className="divide-y">
              {order.items.map((item) => (
                <li
                  key={item.id}
                  className="flex justify-between gap-4 py-4 text-sm"
                >
                  <div className="min-w-0">
                    <p className="break-words">
                      <strong>{item.quantity} × </strong>
                      {item.name}
                    </p>
                    {item.variantLabel && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {item.variantLabel}
                      </p>
                    )}
                  </div>
                  <span className="shrink-0 font-medium">
                    {money(item.lineTotal)}
                  </span>
                </li>
              ))}
            </ul>
            <dl className="mt-4 space-y-3 border-t pt-4 text-sm">
              <div className="flex justify-between">
                <dt>Subtotal</dt>
                <dd>{money(order.subtotal)}</dd>
              </div>
              {(order.discountAmount || 0) > 0 && (
                <div className="flex justify-between">
                  <dt>Descuento</dt>
                  <dd>-{money(order.discountAmount)}</dd>
                </div>
              )}
              {(order.couponDiscount || 0) > 0 && (
                <div className="flex justify-between">
                  <dt>Cupón</dt>
                  <dd>-{money(order.couponDiscount)}</dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt>Envío</dt>
                <dd>{money(order.deliveryFee)}</dd>
              </div>
              <div className="flex justify-between border-t pt-4 font-serif text-2xl">
                <dt>Total</dt>
                <dd>{money(order.total)}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Estado del pago</dt>
                <dd>{result.paymentStatus}</dd>
              </div>
              {result.balance > 0 && (
                <div className="flex justify-between font-medium">
                  <dt>Saldo pendiente</dt>
                  <dd>{money(result.balance)}</dd>
                </div>
              )}
            </dl>
          </section>
        </div>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Button asChild variant="outline">
            <Link href="/tienda">Seguir comprando</Link>
          </Button>
          {isSignedIn && (
            <Button asChild variant="outline">
              <Link href="/cuenta">Mis pedidos</Link>
            </Button>
          )}
        </div>
      </div>
    </StoreLayout>
  );
}
