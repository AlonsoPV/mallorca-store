import { AdminLayout } from "@/components/layout/admin-layout";
import {
  useGetAdminOrder,
  useUpdateAdminOrder,
  useCreateAdminOrderPaymentLink,
  useRecordAdminOrderPayment,
  getListAdminOrdersQueryKey,
  getGetAdminOrderQueryKey,
  type OrderStatusUpdateStatus,
  type PaymentMethod,
} from "@workspace/api-client-react";
import { Link, useParams, useSearch } from "wouter";
import {
  ArrowLeft,
  ChevronDown,
  Loader2,
  Mail,
  MoreHorizontal,
  Phone,
  Printer,
} from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { normalizeSearch } from "@/lib/admin-search-params";
import {
  formatOrderDate,
  formatOrderDateTime,
  formatOrderTime,
  formatPriceMx,
  getPrimaryNextStatus,
  ORDER_STATUS_ACTION_LABELS,
  ORDER_STATUS_LABELS,
  ORDER_STATUS_PIPELINE,
  type OrderStatus,
} from "@/lib/order-status";
import {
  ORDER_SOURCE_LABELS,
  PAYMENT_METHOD_LABELS,
  PAYMENT_STATUS_LABELS,
  buildWhatsAppOrderMessage,
  formatAuditAction,
  fulfillmentLabel,
  pendingPaymentAmount,
  whatsappComposeUrl,
} from "@/lib/order-source";
import { cn } from "@/lib/utils";

function pipelineHighlight(status: string): OrderStatus {
  if (status === "paid" || status === "pending_payment") return "confirmed";
  if ((ORDER_STATUS_PIPELINE as string[]).includes(status)) return status as OrderStatus;
  return "confirmed";
}

function Section({
  title,
  children,
  className,
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("border-b border-border py-5", className)}>
      <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        {title}
      </h2>
      {children}
    </section>
  );
}

export default function AdminOrderDetail() {
  const { id } = useParams<{ id: string }>();
  const search = useSearch();
  const backHref = useMemo(() => {
    const qs = normalizeSearch(search);
    return qs ? `/admin/pedidos?${qs}` : "/admin/pedidos";
  }, [search]);

  const { data: order, isLoading, isError } = useGetAdminOrder(id);
  const updateOrder = useUpdateAdminOrder();
  const paymentLink = useCreateAdminOrderPaymentLink();
  const recordPayment = useRecordAdminOrderPayment();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [payOpen, setPayOpen] = useState(false);
  const [unpaidOpen, setUnpaidOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [customerNotes, setCustomerNotes] = useState("");
  const [productionNotes, setProductionNotes] = useState("");
  const [internalNotes, setInternalNotes] = useState("");
  const [payAmount, setPayAmount] = useState("");
  const [payNote, setPayNote] = useState("");
  const [payMethod, setPayMethod] = useState<PaymentMethod>("CASH");
  const [overrideReason, setOverrideReason] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);

  const primary = order ? getPrimaryNextStatus(order.status) : null;
  const pendingAmount = order ? pendingPaymentAmount(order.total, order.amountPaid) : 0;
  const unpaid =
    order != null &&
    order.paymentStatus !== "paid" &&
    order.paymentStatus !== "cancelled" &&
    order.paymentStatus !== "refunded";
  const isCashOnPickup = order?.paymentMethod === "CASH_ON_PICKUP";
  const highlightCollect = unpaid && (isCashOnPickup || order?.status === "ready");
  const editable = order != null && !["completed", "cancelled"].includes(order.status);
  const pipelineCurrent = order ? pipelineHighlight(order.status) : "confirmed";

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: getGetAdminOrderQueryKey(id) });
    queryClient.invalidateQueries({ queryKey: getListAdminOrdersQueryKey() });
  };

  const openPayDialog = () => {
    if (!order) return;
    setPayAmount(String(pendingAmount));
    setPayMethod(
      (order.paymentMethod === "CASH_ON_PICKUP" ||
      order.paymentMethod === "CASH" ||
      order.paymentMethod === "TERMINAL" ||
      order.paymentMethod === "TRANSFER"
        ? order.paymentMethod
        : "CASH") as PaymentMethod,
    );
    setPayNote("");
    setPayOpen(true);
  };

  const advance = async (
    status: OrderStatusUpdateStatus,
    extra?: { confirmUnpaidComplete?: boolean; cancelReason?: string },
  ) => {
    if (status === "completed" && unpaid && !extra?.confirmUnpaidComplete) {
      setUnpaidOpen(true);
      return;
    }
    try {
      await updateOrder.mutateAsync({
        id,
        data: {
          status,
          confirmUnpaidComplete: extra?.confirmUnpaidComplete,
          cancelReason: extra?.cancelReason,
        },
      });
      toast({ title: "Estado actualizado" });
      refresh();
    } catch (error) {
      const coded = error as { code?: string; error?: string; message?: string; data?: { code?: string; error?: string } };
      const code = coded.code || coded.data?.code;
      toast({
        title: code === "UNPAID_ON_COMPLETE" ? "Pago pendiente" : "No se pudo actualizar el estado",
        description: coded.error || coded.data?.error || coded.message,
        variant: "destructive",
      });
    }
  };

  const openNotes = () => {
    if (!order) return;
    setCustomerNotes(order.customerNotes ?? "");
    setProductionNotes(order.productionNotes ?? "");
    setInternalNotes(order.internalNotes ?? "");
    setNotesOpen(true);
  };

  const saveNotes = async () => {
    try {
      await updateOrder.mutateAsync({
        id,
        data: {
          customerNotes: customerNotes.trim() || null,
          productionNotes: productionNotes.trim() || null,
          internalNotes: internalNotes.trim() || null,
        },
      });
      toast({ title: "Notas guardadas" });
      setNotesOpen(false);
      refresh();
    } catch (error) {
      const coded = error as { error?: string; message?: string; data?: { error?: string } };
      toast({
        title: "No se pudieron guardar las notas",
        description: coded.error || coded.data?.error || coded.message,
        variant: "destructive",
      });
    }
  };

  const primaryCtaLabel = primary
    ? ORDER_STATUS_ACTION_LABELS[primary] ?? ORDER_STATUS_LABELS[primary]
    : null;

  return (
    <AdminLayout>
      <div className="flex-1 overflow-y-auto">
        <div className="border-b border-border bg-background px-4 py-3 md:px-8">
          <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Link href={backHref} className="inline-flex items-center gap-1 hover:text-foreground">
              <ArrowLeft className="h-3.5 w-3.5" /> Pedidos
            </Link>
            {order ? (
              <>
                <span>/</span>
                <span className="text-foreground">#{order.orderNumber}</span>
              </>
            ) : null}
          </div>

          {isLoading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : isError || !order ? (
            <p className="py-10 text-destructive">No se pudo cargar el pedido.</p>
          ) : (
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="font-serif text-2xl text-foreground md:text-3xl">
                    Pedido #{order.orderNumber}
                  </h1>
                  <span className="border border-border px-2 py-0.5 text-xs font-medium">
                    {ORDER_STATUS_LABELS[order.status as keyof typeof ORDER_STATUS_LABELS] ??
                      order.status}
                  </span>
                  {highlightCollect ? (
                    <span className="border border-amber-600/40 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800">
                      POR COBRAR {formatPriceMx(pendingAmount)}
                    </span>
                  ) : null}
                </div>
                <p className="text-sm text-muted-foreground">
                  Creado {formatOrderDateTime(order.createdAt)}
                  {order.orderSource
                    ? ` · ${ORDER_SOURCE_LABELS[order.orderSource] ?? order.orderSource}`
                    : ""}
                </p>
                <p className="text-sm font-medium">
                  {order.branchName ? `Mallorca ${order.branchName.replace(/^Mallorca\s+/i, "")}` : `Sucursal ${order.branchId}`}
                  {" · "}
                  {fulfillmentLabel(order.fulfillmentMethod)}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                {primary && primaryCtaLabel ? (
                  <Button
                    className="rounded-none"
                    disabled={updateOrder.isPending}
                    onClick={() => advance(primary)}
                  >
                    {primaryCtaLabel}
                  </Button>
                ) : null}
                {unpaid ? (
                  <Button variant="outline" className="rounded-none" onClick={openPayDialog}>
                    Registrar pago
                  </Button>
                ) : null}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="icon" className="rounded-none">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="rounded-none w-52">
                    {editable ? (
                      <DropdownMenuItem disabled>
                        Editar pedido
                      </DropdownMenuItem>
                    ) : null}
                    <DropdownMenuItem
                      onClick={() => window.print()}
                    >
                      <Printer className="mr-2 h-4 w-4" /> Imprimir
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link href={`/admin/pedidos/nuevo?duplicateFrom=${order.id}`}>
                        Duplicar pedido
                      </Link>
                    </DropdownMenuItem>
                    {order.customerPhone ? (
                      <DropdownMenuItem asChild>
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
                          Contactar cliente
                        </a>
                      </DropdownMenuItem>
                    ) : null}
                    <DropdownMenuItem
                      disabled={paymentLink.isPending}
                      onClick={async () => {
                        try {
                          const res = await paymentLink.mutateAsync({ id: order.id });
                          toast({ title: "Link de pago generado" });
                          refresh();
                          window.open(res.url, "_blank");
                        } catch {
                          toast({ title: "No se pudo generar link", variant: "destructive" });
                        }
                      }}
                    >
                      Generar link de pago
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    {order.status !== "cancelled" ? (
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onClick={() => setCancelOpen(true)}
                      >
                        Cancelar pedido
                      </DropdownMenuItem>
                    ) : null}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          )}
        </div>

        {order ? (
          <>
            <div className="mx-auto grid max-w-[1400px] gap-0 lg:grid-cols-[minmax(0,1fr)_320px] xl:grid-cols-[minmax(0,1fr)_360px]">
              {/* Main column */}
              <div className="px-4 md:px-8 lg:border-r lg:border-border">
                {/* Mobile: status first */}
                <div className="lg:hidden">
                  <Section title="Estado">
                    <StatusPipeline
                      current={pipelineCurrent}
                      status={order.status}
                      paymentStatus={order.paymentStatus}
                      pending={updateOrder.isPending}
                      onSelect={(next) => advance(next)}
                    />
                  </Section>
                </div>

                <Section title="Productos">
                  <ul className="space-y-3">
                    {order.items.map((item) => {
                      const hasPromo =
                        item.listUnitPrice != null && item.listUnitPrice > item.unitPrice;
                      return (
                        <li key={item.id} className="flex gap-3 text-sm">
                          <div className="h-14 w-14 shrink-0 overflow-hidden border border-border bg-muted">
                            {item.imageUrl ? (
                              <img
                                src={item.imageUrl}
                                alt=""
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center text-[10px] text-muted-foreground">
                                —
                              </div>
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="font-medium leading-snug">{item.name}</div>
                            <div className="text-xs text-muted-foreground">
                              {[item.sku, item.variantLabel].filter(Boolean).join(" · ")}
                              {item.manualLineItem ? " · Manual" : ""}
                            </div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              {item.quantity} × {formatPriceMx(item.unitPrice)}
                              {hasPromo ? (
                                <span className="ml-2 text-amber-700">
                                  Promo {formatPriceMx(item.listUnitPrice!)} → {formatPriceMx(item.unitPrice)}
                                </span>
                              ) : null}
                            </div>
                          </div>
                          <div className="shrink-0 text-right font-medium tabular-nums">
                            {hasPromo ? (
                              <div className="text-xs text-muted-foreground line-through">
                                {formatPriceMx(item.listUnitPrice! * item.quantity)}
                              </div>
                            ) : null}
                            {formatPriceMx(item.lineTotal)}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </Section>

                <Section title="Cliente">
                  <p className="text-lg font-medium leading-tight">{order.customerName}</p>
                  {order.customerPhone ? (
                    <p className="mt-1 text-sm text-muted-foreground">{order.customerPhone}</p>
                  ) : null}
                  {order.customerEmail ? (
                    <p className="text-sm text-muted-foreground">{order.customerEmail}</p>
                  ) : null}
                  <div className="mt-3 flex flex-wrap gap-2">
                    {order.customerPhone ? (
                      <>
                        <Button variant="outline" size="sm" className="h-8 rounded-none" asChild>
                          <a href={`tel:${order.customerPhone}`}>
                            <Phone className="mr-1.5 h-3.5 w-3.5" /> Llamar
                          </a>
                        </Button>
                        <Button variant="outline" size="sm" className="h-8 rounded-none" asChild>
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
                      </>
                    ) : null}
                    {order.customerEmail ? (
                      <Button variant="outline" size="sm" className="h-8 rounded-none" asChild>
                        <a href={`mailto:${order.customerEmail}`}>
                          <Mail className="mr-1.5 h-3.5 w-3.5" /> Email
                        </a>
                      </Button>
                    ) : null}
                  </div>
                </Section>

                <Section title="Entrega">
                  <p className="font-medium">
                    {order.fulfillmentMethod === "pickup"
                      ? "Recoge en sucursal"
                      : "Entrega a domicilio"}
                  </p>
                  {order.branchName ? (
                    <p className="mt-1 text-sm">{order.branchName}</p>
                  ) : null}
                  <p className="mt-2 text-sm">
                    {formatOrderDate(order.scheduledStart)}
                    {" · "}
                    {formatOrderTime(order.scheduledStart)}
                    {order.scheduledEnd && order.fulfillmentMethod === "delivery"
                      ? `–${formatOrderTime(order.scheduledEnd)}`
                      : ""}
                  </p>
                  {order.fulfillmentMethod === "delivery" ? (
                    <div className="mt-2 space-y-1 text-sm text-muted-foreground">
                      {order.deliveryAddressSnapshot?.street ? (
                        <>
                          <p>
                            {[
                              order.deliveryAddressSnapshot.street,
                              order.deliveryAddressSnapshot.externalNumber,
                            ]
                              .filter(Boolean)
                              .join(" ")}
                            {order.deliveryAddressSnapshot.internalNumber
                              ? ` Int. ${order.deliveryAddressSnapshot.internalNumber}`
                              : ""}
                          </p>
                          <p>
                            {[
                              order.deliveryAddressSnapshot.neighborhood,
                              order.deliveryAddressSnapshot.postalCode
                                ? `CP ${order.deliveryAddressSnapshot.postalCode}`
                                : null,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </p>
                          {order.deliveryAddressSnapshot.references ? (
                            <p>Referencias: {order.deliveryAddressSnapshot.references}</p>
                          ) : null}
                        </>
                      ) : (
                        <p>{order.deliveryAddress}</p>
                      )}
                    </div>
                  ) : null}
                </Section>

                <Section title="Notas">
                  {order.customerNotes || order.productionNotes || order.internalNotes ? (
                    <div className="space-y-3 text-sm">
                      {order.customerNotes ? (
                        <div>
                          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                            Nota del cliente
                          </p>
                          <p className="mt-0.5 whitespace-pre-wrap">{order.customerNotes}</p>
                        </div>
                      ) : null}
                      {order.productionNotes ? (
                        <div>
                          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                            Nota para producción
                          </p>
                          <p className="mt-0.5 whitespace-pre-wrap">{order.productionNotes}</p>
                        </div>
                      ) : null}
                      {order.internalNotes ? (
                        <div>
                          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                            Nota interna
                          </p>
                          <p className="mt-0.5 whitespace-pre-wrap">{order.internalNotes}</p>
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Sin notas. Agrégalas para producción, el equipo o el cliente.
                    </p>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-3 h-8 rounded-none"
                    onClick={openNotes}
                  >
                    {order.customerNotes || order.productionNotes || order.internalNotes
                      ? "Editar notas"
                      : "Añadir nota"}
                  </Button>
                </Section>

                <Collapsible open={historyOpen} onOpenChange={setHistoryOpen} className="py-5">
                  <CollapsibleTrigger className="flex w-full items-center justify-between text-left">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                      Historial del pedido
                    </span>
                    <ChevronDown
                      className={cn(
                        "h-4 w-4 text-muted-foreground transition-transform",
                        historyOpen && "rotate-180",
                      )}
                    />
                  </CollapsibleTrigger>
                  <CollapsibleContent className="mt-3">
                    {(order.audit?.length ?? 0) === 0 ? (
                      <p className="text-sm text-muted-foreground">Sin eventos registrados.</p>
                    ) : (
                      <ul className="space-y-3 border-l border-border pl-4">
                        {[...(order.audit ?? [])]
                          .sort(
                            (a, b) =>
                              new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
                          )
                          .map((event) => (
                            <li key={event.id} className="relative text-sm">
                              <span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-foreground" />
                              <div className="text-xs text-muted-foreground tabular-nums">
                                {formatOrderTime(event.createdAt)}
                              </div>
                              <div className="font-medium">{formatAuditAction(event.action)}</div>
                              <div className="text-xs text-muted-foreground">
                                {[event.actorName, event.reason].filter(Boolean).join(" · ")}
                              </div>
                            </li>
                          ))}
                      </ul>
                    )}
                  </CollapsibleContent>
                </Collapsible>
              </div>

              {/* Sticky ops summary */}
              <aside className="border-t border-border bg-muted/20 px-4 py-5 md:px-6 lg:sticky lg:top-0 lg:h-fit lg:border-t-0 lg:self-start">
                <div className="hidden lg:block">
                  <Section title="Estado" className="border-b-0 pt-0">
                    <StatusPipeline
                      current={pipelineCurrent}
                      status={order.status}
                      paymentStatus={order.paymentStatus}
                      pending={updateOrder.isPending}
                      onSelect={(next) => advance(next)}
                    />
                  </Section>
                </div>

                <Section
                  title="Pago"
                  className={cn(highlightCollect && "rounded-sm border border-amber-600/30 bg-amber-50/80 px-3")}
                >
                  <dl className="space-y-2 text-sm">
                    <div className="flex justify-between gap-3">
                      <dt className="text-muted-foreground">Método</dt>
                      <dd className="text-right font-medium">
                        {PAYMENT_METHOD_LABELS[order.paymentMethod ?? ""] ??
                          order.paymentMethod ??
                          "—"}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-muted-foreground">Estado</dt>
                      <dd
                        className={cn(
                          "text-right font-semibold uppercase tracking-wide",
                          unpaid ? "text-amber-800" : "text-emerald-800",
                        )}
                      >
                        {PAYMENT_STATUS_LABELS[order.paymentStatus] ?? order.paymentStatus}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-muted-foreground">Total</dt>
                      <dd className="tabular-nums">{formatPriceMx(order.total)}</dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-muted-foreground">Pagado</dt>
                      <dd className="tabular-nums">{formatPriceMx(order.amountPaid ?? 0)}</dd>
                    </div>
                    {unpaid ? (
                      <div className="flex justify-between gap-3 border-t border-amber-600/20 pt-2">
                        <dt className="font-semibold text-amber-900">Pendiente</dt>
                        <dd className="font-semibold tabular-nums text-amber-900">
                          {formatPriceMx(pendingAmount)}
                        </dd>
                      </div>
                    ) : order.paidAt ? (
                      <p className="pt-1 text-xs text-muted-foreground">
                        Cobrado {formatOrderDateTime(order.paidAt)}
                      </p>
                    ) : null}
                  </dl>
                  {order.paymentReference ? (
                    <p className="mt-2 text-xs text-muted-foreground">Ref: {order.paymentReference}</p>
                  ) : null}
                  {order.paymentLinkUrl ? (
                    <a
                      className="mt-2 inline-block text-xs text-primary underline"
                      href={order.paymentLinkUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Abrir link de pago
                    </a>
                  ) : null}
                  {unpaid ? (
                    <Button className="mt-3 w-full rounded-none" onClick={openPayDialog}>
                      Registrar pago
                    </Button>
                  ) : null}
                </Section>

                <Section title="Resumen" className="border-b-0">
                  <dl className="space-y-1.5 text-sm">
                    <div className="flex justify-between">
                      <dt>Subtotal</dt>
                      <dd className="tabular-nums">{formatPriceMx(order.subtotal)}</dd>
                    </div>
                    {(order.promotionDiscountTotal ?? 0) > 0 ? (
                      <div className="flex justify-between text-muted-foreground">
                        <dt>Promoción</dt>
                        <dd className="tabular-nums">−{formatPriceMx(order.promotionDiscountTotal!)}</dd>
                      </div>
                    ) : null}
                    {(order.discountAmount ?? 0) > 0 ? (
                      <div className="space-y-0.5">
                        <div className="flex justify-between text-muted-foreground">
                          <dt>Descuento manual</dt>
                          <dd className="tabular-nums">−{formatPriceMx(order.discountAmount!)}</dd>
                        </div>
                        {order.discountReason ? (
                          <p className="text-xs text-muted-foreground">Motivo: {order.discountReason}</p>
                        ) : null}
                      </div>
                    ) : null}
                    {(order.couponDiscount ?? 0) > 0 ? (
                      <div className="flex justify-between text-muted-foreground">
                        <dt>Cupón{order.couponCode ? ` (${order.couponCode})` : ""}</dt>
                        <dd className="tabular-nums">−{formatPriceMx(order.couponDiscount!)}</dd>
                      </div>
                    ) : null}
                    <div className="flex justify-between text-muted-foreground">
                      <dt>Delivery</dt>
                      <dd className="tabular-nums">{formatPriceMx(order.deliveryFee)}</dd>
                    </div>
                    <div className="flex justify-between border-t border-border pt-2 text-base font-semibold">
                      <dt>Total</dt>
                      <dd className="tabular-nums">{formatPriceMx(order.total)}</dd>
                    </div>
                  </dl>
                </Section>
              </aside>
            </div>

            {/* Sticky mobile CTA */}
            {(primary || unpaid) && editable ? (
              <div className="sticky bottom-0 z-20 flex gap-2 border-t border-border bg-background/95 p-3 backdrop-blur lg:hidden">
                {unpaid ? (
                  <Button variant="outline" className="flex-1 rounded-none" onClick={openPayDialog}>
                    Registrar pago
                  </Button>
                ) : null}
                {primary && primaryCtaLabel ? (
                  <Button
                    className="flex-1 rounded-none"
                    disabled={updateOrder.isPending}
                    onClick={() => advance(primary)}
                  >
                    {primaryCtaLabel}
                  </Button>
                ) : null}
              </div>
            ) : null}

            <Dialog open={notesOpen} onOpenChange={setNotesOpen}>
              <DialogContent className="rounded-none sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Notas del pedido</DialogTitle>
                  <DialogDescription>
                    Visibles para el equipo. La nota del cliente también queda en el pedido.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-3">
                  <div>
                    <Label htmlFor="production-notes">Producción</Label>
                    <Textarea
                      id="production-notes"
                      className="mt-1 rounded-none"
                      value={productionNotes}
                      onChange={(e) => setProductionNotes(e.target.value)}
                      placeholder="Mensaje en el pastel, decoración, alérgenos…"
                    />
                  </div>
                  <div>
                    <Label htmlFor="internal-notes">Interna</Label>
                    <Textarea
                      id="internal-notes"
                      className="mt-1 rounded-none"
                      value={internalNotes}
                      onChange={(e) => setInternalNotes(e.target.value)}
                      placeholder="Solo para el equipo"
                    />
                  </div>
                  <div>
                    <Label htmlFor="customer-notes">Cliente</Label>
                    <Textarea
                      id="customer-notes"
                      className="mt-1 rounded-none"
                      value={customerNotes}
                      onChange={(e) => setCustomerNotes(e.target.value)}
                      placeholder="Instrucciones que dejó el cliente"
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" className="rounded-none" onClick={() => setNotesOpen(false)}>
                    Cancelar
                  </Button>
                  <Button className="rounded-none" disabled={updateOrder.isPending} onClick={() => void saveNotes()}>
                    {updateOrder.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Guardar notas
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <Dialog open={payOpen} onOpenChange={setPayOpen}>
              <DialogContent className="rounded-none sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Registrar pago</DialogTitle>
                  <DialogDescription>
                    Pedido #{order.orderNumber} · Pendiente {formatPriceMx(pendingAmount)}
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-3">
                  <div>
                    <Label>Método</Label>
                    <select
                      className="mt-1 flex h-10 w-full border border-border bg-background px-3 text-sm"
                      value={payMethod}
                      onChange={(e) => setPayMethod(e.target.value as PaymentMethod)}
                    >
                      {(["CASH", "CASH_ON_PICKUP", "TERMINAL", "TRANSFER"] as PaymentMethod[]).map(
                        (m) => (
                          <option key={m} value={m}>
                            {PAYMENT_METHOD_LABELS[m]}
                          </option>
                        ),
                      )}
                    </select>
                  </div>
                  <div>
                    <Label>Monto</Label>
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      className="mt-1 rounded-none"
                      value={payAmount}
                      onChange={(e) => setPayAmount(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label>Nota (opcional)</Label>
                    <Textarea
                      className="mt-1 rounded-none"
                      value={payNote}
                      onChange={(e) => setPayNote(e.target.value)}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" className="rounded-none" onClick={() => setPayOpen(false)}>
                    Cancelar
                  </Button>
                  <Button
                    className="rounded-none"
                    disabled={recordPayment.isPending}
                    onClick={async () => {
                      try {
                        await recordPayment.mutateAsync({
                          id: order.id,
                          data: {
                            paymentMethod: payMethod,
                            amountPaid: Number(payAmount),
                            paymentNote: payNote || null,
                            markPaid: true,
                          },
                        });
                        toast({ title: "Pago registrado" });
                        setPayOpen(false);
                        refresh();
                      } catch (error) {
                        const data = (error as { data?: { code?: string; error?: string } }).data;
                        toast({
                          title:
                            data?.code === "PAYMENT_ALREADY_RECORDED"
                              ? "Este pedido ya está cobrado"
                              : "No se pudo registrar el pago",
                          description: data?.error || (error as Error).message,
                          variant: "destructive",
                        });
                      }
                    }}
                  >
                    Confirmar pago
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <Dialog open={unpaidOpen} onOpenChange={setUnpaidOpen}>
              <DialogContent className="rounded-none sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Pago pendiente</DialogTitle>
                  <DialogDescription>
                    Este pedido tiene {formatPriceMx(pendingAmount)} por cobrar.
                  </DialogDescription>
                </DialogHeader>
                <div>
                  <Label>Motivo del override (solo roles autorizados)</Label>
                  <Textarea
                    className="mt-1 rounded-none"
                    value={overrideReason}
                    onChange={(e) => setOverrideReason(e.target.value)}
                    placeholder="Explica por qué entregas sin cobrar"
                  />
                </div>
                <DialogFooter className="flex-col gap-2 sm:flex-row">
                  <Button variant="outline" className="rounded-none" onClick={() => setUnpaidOpen(false)}>
                    Cancelar
                  </Button>
                  <Button
                    className="rounded-none"
                    onClick={() => {
                      setUnpaidOpen(false);
                      openPayDialog();
                    }}
                  >
                    Registrar pago
                  </Button>
                  <Button
                    variant="outline"
                    className="rounded-none"
                    disabled={!overrideReason.trim() || updateOrder.isPending}
                    onClick={async () => {
                      await advance("completed", {
                        confirmUnpaidComplete: true,
                        cancelReason: overrideReason.trim(),
                      });
                      setUnpaidOpen(false);
                      setOverrideReason("");
                    }}
                  >
                    Entregar sin cobro
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
              <DialogContent className="rounded-none sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Cancelar pedido</DialogTitle>
                  <DialogDescription>
                    Se liberará inventario reservado y se ajustará el estado de pago si aplica.
                  </DialogDescription>
                </DialogHeader>
                <div>
                  <Label>Motivo *</Label>
                  <Textarea
                    className="mt-1 rounded-none"
                    value={cancelReason}
                    onChange={(e) => setCancelReason(e.target.value)}
                  />
                </div>
                <DialogFooter>
                  <Button variant="outline" className="rounded-none" onClick={() => setCancelOpen(false)}>
                    Volver
                  </Button>
                  <Button
                    variant="destructive"
                    className="rounded-none"
                    disabled={!cancelReason.trim() || updateOrder.isPending}
                    onClick={async () => {
                      await advance("cancelled", { cancelReason: cancelReason.trim() });
                      setCancelOpen(false);
                      setCancelReason("");
                    }}
                  >
                    Confirmar cancelación
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </>
        ) : null}
      </div>
    </AdminLayout>
  );
}

function statusForPipelineStep(step: OrderStatus, paymentStatus?: string | null): OrderStatus {
  if (
    step === "confirmed" &&
    (paymentStatus === "paid" || paymentStatus === "partially_paid")
  ) {
    return "paid";
  }
  return step;
}

function StatusPipeline({
  current,
  status,
  paymentStatus,
  pending,
  onSelect,
}: {
  current: OrderStatus;
  status: string;
  paymentStatus?: string | null;
  pending?: boolean;
  onSelect: (status: OrderStatus) => void;
}) {
  return (
    <div className="space-y-2">
      {status === "cancelled" ? (
        <p className="text-sm font-medium text-destructive">Cancelado. Elige un estado para reabrirlo.</p>
      ) : (
        <p className="text-xs text-muted-foreground">Selecciona un estado para cambiarlo.</p>
      )}
      <ol className="flex flex-col gap-1">
        {ORDER_STATUS_PIPELINE.map((step, idx) => {
          const active = status !== "cancelled" && step === current;
          const past =
            status !== "cancelled" &&
            (ORDER_STATUS_PIPELINE.indexOf(current) > idx ||
              (status === "completed" && step !== "completed"));
          const target = statusForPipelineStep(step, paymentStatus);
          return (
            <li key={step}>
              <button
                type="button"
                disabled={active || pending}
                onClick={() => onSelect(target)}
                className={cn(
                  "flex w-full items-center gap-2 px-1 py-1 text-left text-sm",
                  !active && "hover:bg-muted",
                  active && "cursor-default",
                )}
              >
                <span
                  className={cn(
                    "flex h-5 w-5 items-center justify-center border text-[10px]",
                    active && "border-foreground bg-foreground text-background",
                    past && !active && "border-muted-foreground/40 text-muted-foreground",
                    !past && !active && "border-border text-muted-foreground",
                  )}
                >
                  {idx + 1}
                </span>
                <span className={cn(active ? "font-semibold" : "text-muted-foreground")}>
                  {ORDER_STATUS_LABELS[step]}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
