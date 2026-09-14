import { AdminLayout } from "@/components/layout/admin-layout";
import {
  useGetAdminOrder,
  useUpdateAdminOrder,
  useCreateAdminOrderPaymentLink,
  getListAdminOrdersQueryKey,
  getGetAdminOrderQueryKey,
  type OrderStatusUpdateStatus,
} from "@workspace/api-client-react";
import { Link, useParams } from "wouter";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import {
  formatOrderDate,
  formatOrderTime,
  formatPriceMx,
  getPrimaryNextStatus,
  getValidNextStatuses,
  ORDER_STATUS_ACTION_LABELS,
  ORDER_STATUS_LABELS,
} from "@/lib/order-status";
import {
  ORDER_SOURCE_LABELS,
  PAYMENT_METHOD_LABELS,
  buildWhatsAppOrderMessage,
  whatsappComposeUrl,
} from "@/lib/order-source";

export default function AdminOrderDetail() {
  const { id } = useParams<{ id: string }>();
  const { data: order, isLoading, isError } = useGetAdminOrder(id);
  const updateOrder = useUpdateAdminOrder();
  const paymentLink = useCreateAdminOrderPaymentLink();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const primary = order ? getPrimaryNextStatus(order.status) : null;
  const nextStatuses = order ? getValidNextStatuses(order.status) : [];

  const advance = async (status: OrderStatusUpdateStatus) => {
    try {
      await updateOrder.mutateAsync({ id, data: { status } });
      toast({ title: "Estado actualizado" });
      queryClient.invalidateQueries({ queryKey: getGetAdminOrderQueryKey(id) });
      queryClient.invalidateQueries({ queryKey: getListAdminOrdersQueryKey() });
    } catch {
      toast({ title: "No se pudo actualizar el estado", variant: "destructive" });
    }
  };

  return (
    <AdminLayout>
      <div className="p-6 md:p-10 flex-1 overflow-y-auto max-w-3xl">
        <Link
          href="/admin/pedidos"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6"
        >
          <ArrowLeft className="h-4 w-4" /> Volver a pedidos
        </Link>

        {isLoading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : isError || !order ? (
          <p className="text-destructive">No se pudo cargar el pedido.</p>
        ) : (
          <div className="space-y-8">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
              <div>
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <span className="text-xs uppercase tracking-wide border border-border px-2 py-1">
                    Origen: {ORDER_SOURCE_LABELS[order.orderSource ?? "STOREFRONT"] ?? order.orderSource}
                  </span>
                </div>
                <h1 className="font-serif text-3xl text-foreground">Pedido #{order.orderNumber}</h1>
                <p className="text-muted-foreground mt-1 capitalize">
                  {order.fulfillmentMethod === "pickup" ? "Recogida" : "Delivery"}
                  {order.branchName ? ` · ${order.branchName}` : ""}
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  {formatOrderDate(order.scheduledStart)} · {formatOrderTime(order.scheduledStart)}
                </p>
              </div>
              <div className="text-sm font-medium px-3 py-1.5 border border-border bg-background">
                {ORDER_STATUS_LABELS[order.status as keyof typeof ORDER_STATUS_LABELS] ?? order.status}
              </div>
            </div>

            <section className="border border-border bg-background p-5 space-y-2">
              <h2 className="font-medium text-sm uppercase tracking-wide text-muted-foreground">
                Cliente
              </h2>
              <p className="text-lg">{order.customerName}</p>
              <p className="text-muted-foreground">{order.customerPhone}</p>
              <p className="text-muted-foreground text-sm">{order.customerEmail}</p>
              {order.deliveryAddress ? (
                <p className="text-sm pt-2">{order.deliveryAddress}</p>
              ) : null}
            </section>

            <section className="border border-border bg-background p-5 space-y-3">
              <h2 className="font-medium text-sm uppercase tracking-wide text-muted-foreground">
                Productos
              </h2>
              <ul className="space-y-2">
                {order.items.map((item) => (
                  <li key={item.id} className="flex justify-between gap-4 text-sm">
                    <span>
                      {item.quantity} × {item.name}
                      {item.variantLabel ? ` (${item.variantLabel})` : ""}
                      {item.manualLineItem ? (
                        <span className="ml-2 text-xs uppercase text-muted-foreground">Manual</span>
                      ) : null}
                    </span>
                    <span className="text-muted-foreground">{formatPriceMx(item.lineTotal)}</span>
                  </li>
                ))}
              </ul>
              <div className="pt-3 border-t border-border space-y-1 text-sm">
                <div className="flex justify-between"><span>Subtotal</span><span>{formatPriceMx(order.subtotal)}</span></div>
                {(order.promotionDiscountTotal ?? 0) > 0 ? (
                  <div className="flex justify-between text-muted-foreground"><span>Promociones</span><span>−{formatPriceMx(order.promotionDiscountTotal!)}</span></div>
                ) : null}
                {(order.discountAmount ?? 0) > 0 ? (
                  <div className="flex justify-between text-muted-foreground">
                    <span>Descuento{order.discountReason ? ` (${order.discountReason})` : ""}</span>
                    <span>−{formatPriceMx(order.discountAmount!)}</span>
                  </div>
                ) : null}
                <div className="flex justify-between"><span>Delivery</span><span>{formatPriceMx(order.deliveryFee)}</span></div>
                <div className="flex justify-between font-medium text-base pt-1"><span>Total</span><span>{formatPriceMx(order.total)}</span></div>
              </div>
            </section>

            {(order.productionNotes || order.internalNotes || order.customerNotes) ? (
              <section className="border border-border bg-background p-5 space-y-2 text-sm">
                <h2 className="font-medium text-sm uppercase tracking-wide text-muted-foreground">Notas</h2>
                {order.productionNotes ? <p><span className="text-muted-foreground">Producción:</span> {order.productionNotes}</p> : null}
                {order.internalNotes ? <p><span className="text-muted-foreground">Interna:</span> {order.internalNotes}</p> : null}
                {order.customerNotes ? <p><span className="text-muted-foreground">Cliente:</span> {order.customerNotes}</p> : null}
              </section>
            ) : null}

            <section className="border border-border bg-background p-5 space-y-2">
              <h2 className="font-medium text-sm uppercase tracking-wide text-muted-foreground">
                Pago
              </h2>
              <p>
                Pedido: {ORDER_STATUS_LABELS[order.status as keyof typeof ORDER_STATUS_LABELS] ?? order.status}
              </p>
              <p>
                Pago: {order.paymentStatus}
                {order.paymentMethod
                  ? ` · ${PAYMENT_METHOD_LABELS[order.paymentMethod] ?? order.paymentMethod}`
                  : ""}{" "}
                · {formatPriceMx(order.total)}
                {(order.amountPaid ?? 0) > 0 ? ` · Pagado ${formatPriceMx(order.amountPaid!)}` : ""}
              </p>
              {order.paymentReference ? (
                <p className="text-sm text-muted-foreground">Ref: {order.paymentReference}</p>
              ) : null}
              {order.paymentLinkUrl ? (
                <a className="text-sm text-primary underline" href={order.paymentLinkUrl} target="_blank" rel="noreferrer">
                  Link de pago
                </a>
              ) : null}
            </section>

            <div className="flex flex-wrap gap-3">
              {primary ? (
                <Button
                  className="rounded-none"
                  disabled={updateOrder.isPending}
                  onClick={() => advance(primary)}
                >
                  {ORDER_STATUS_ACTION_LABELS[primary] ?? ORDER_STATUS_LABELS[primary]}
                </Button>
              ) : null}
              {nextStatuses
                .filter((s) => s !== primary)
                .map((status) => (
                  <Button
                    key={status}
                    variant="outline"
                    className="rounded-none"
                    disabled={updateOrder.isPending}
                    onClick={() => advance(status)}
                  >
                    {ORDER_STATUS_ACTION_LABELS[status] ?? ORDER_STATUS_LABELS[status]}
                  </Button>
                ))}
              <Button variant="outline" className="rounded-none" asChild>
                <Link href={`/admin/pedidos/nuevo?duplicateFrom=${order.id}`}>Duplicar pedido</Link>
              </Button>
              <Button variant="outline" className="rounded-none" asChild>
                <a
                  href={whatsappComposeUrl(
                    order.customerPhone,
                    buildWhatsAppOrderMessage({
                      customerName: order.customerName,
                      orderNumber: order.orderNumber,
                      branchName: order.branchName,
                      scheduledStart: order.scheduledStart,
                      total: order.total,
                      paymentStatus: order.paymentStatus,
                      link: order.paymentLinkUrl,
                    }),
                  )}
                  target="_blank"
                  rel="noreferrer"
                >
                  WhatsApp
                </a>
              </Button>
              <Button
                variant="outline"
                className="rounded-none"
                disabled={paymentLink.isPending}
                onClick={async () => {
                  try {
                    const res = await paymentLink.mutateAsync({ id: order.id });
                    toast({ title: "Link de pago generado" });
                    queryClient.invalidateQueries({ queryKey: getGetAdminOrderQueryKey(id) });
                    window.open(res.url, "_blank");
                  } catch {
                    toast({ title: "No se pudo generar link", variant: "destructive" });
                  }
                }}
              >
                Generar link de pago
              </Button>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
