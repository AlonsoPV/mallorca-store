import { AdminLayout } from "@/components/layout/admin-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  ORDER_SOURCE_LABELS,
  PAYMENT_METHOD_LABELS,
  buildWhatsAppOrderMessage,
  whatsappComposeUrl,
} from "@/lib/order-source";
import { formatPriceMx } from "@/lib/order-status";
import { cn } from "@/lib/utils";
import {
  useCreateAdminOrder,
  useDuplicateAdminOrder,
  useListAdminBranches,
  useListAdminInventory,
  useListAdminProducts,
  useListFulfillmentSlots,
  usePreviewAdminOrder,
  useSearchAdminCustomers,
  type AdminOrderInput,
  type AdminOrderLineInput,
  type OrderSource,
  type PaymentMethod,
} from "@workspace/api-client-react";
import { Loader2, Minus, Plus, Search, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useSearch } from "wouter";

type BuilderLine = AdminOrderLineInput & {
  key: string;
  name?: string;
  sku?: string;
  listUnitPrice?: number;
  unitPriceDisplay?: number;
  available?: boolean;
  inventory?: number | null;
};

function tomorrowMexicoDate(): string {
  const d = new Date(Date.now() + 24 * 60 * 60_000);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Mexico_City",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function toScheduledStart(date: string, time: string): string {
  return new Date(`${date}T${time}:00-06:00`).toISOString();
}

export default function AdminOrderNew() {
  const search = useSearch();
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const branches = useListAdminBranches();
  const preBranch = params.get("branchId");
  const duplicateFrom = params.get("duplicateFrom");
  const preCustomerName = params.get("customerName");
  const preCustomerEmail = params.get("customerEmail");
  const preCustomerPhone = params.get("customerPhone");
  const preUserId = params.get("customerUserId");

  const [orderSource, setOrderSource] = useState<OrderSource>("PHONE");
  const [branchId, setBranchId] = useState<number | null>(preBranch ? Number(preBranch) : null);
  const [customerName, setCustomerName] = useState(preCustomerName ?? "");
  const [customerEmail, setCustomerEmail] = useState(preCustomerEmail ?? "pedido@mallorca.local");
  const [customerPhone, setCustomerPhone] = useState(preCustomerPhone ?? "");
  const [userId, setUserId] = useState<string | null>(preUserId);
  const [customerQuery, setCustomerQuery] = useState("");
  const [date, setDate] = useState(tomorrowMexicoDate());
  const [time, setTime] = useState("12:00");
  const [fulfillmentMethod, setFulfillmentMethod] = useState<"pickup" | "delivery">("pickup");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [deliveryLatitude, setDeliveryLatitude] = useState<number | null>(null);
  const [deliveryLongitude, setDeliveryLongitude] = useState<number | null>(null);
  const [lines, setLines] = useState<BuilderLine[]>([]);
  const [productQuery, setProductQuery] = useState("");
  const [customerNotes, setCustomerNotes] = useState("");
  const [productionNotes, setProductionNotes] = useState("");
  const [internalNotes, setInternalNotes] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("PENDING");
  const [markPaid, setMarkPaid] = useState(false);
  const [paymentReference, setPaymentReference] = useState("");
  const [paymentNote, setPaymentNote] = useState("");
  const [discountType, setDiscountType] = useState<"percent" | "amount">("percent");
  const [discountValue, setDiscountValue] = useState("");
  const [discountReason, setDiscountReason] = useState("");
  const [couponCode, setCouponCode] = useState("");
  const [forceAvailability, setForceAvailability] = useState(false);
  const [overrideReason, setOverrideReason] = useState("");
  const [manualDesc, setManualDesc] = useState("");
  const [manualPrice, setManualPrice] = useState("");
  const [createdOrderId, setCreatedOrderId] = useState<string | null>(null);
  const [createdOrderNumber, setCreatedOrderNumber] = useState<string | null>(null);
  const [createdTotal, setCreatedTotal] = useState<number | null>(null);

  const duplicate = useDuplicateAdminOrder();
  useEffect(() => {
    if (!duplicateFrom) return;
    duplicate.mutate(
      { id: duplicateFrom },
      {
        onSuccess: (data) => {
          setBranchId(data.branchId);
          setCustomerName(data.customerName);
          setCustomerEmail(data.customerEmail);
          setCustomerPhone(data.customerPhone);
          setUserId(data.userId ?? null);
          setFulfillmentMethod(data.fulfillmentMethod);
          setDeliveryAddress(data.deliveryAddress ?? "");
          setDeliveryLatitude(data.deliveryLatitude ?? null);
          setDeliveryLongitude(data.deliveryLongitude ?? null);
          setCustomerNotes(data.customerNotes ?? "");
          setProductionNotes(data.productionNotes ?? "");
          setInternalNotes(data.internalNotes ?? "");
          setLines(
            data.lines.map((line, idx) => ({
              ...line,
              key: `dup-${idx}`,
              name: line.description,
            })),
          );
          toast({ title: "Pedido duplicado — revalida precio, stock y horario" });
        },
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [duplicateFrom]);

  useEffect(() => {
    if (branchId != null || !branches.data?.length) return;
    setBranchId(branches.data[0].id);
  }, [branchId, branches.data]);

  const products = useListAdminProducts({ status: "active", search: productQuery.trim() || undefined });
  const inventory = useListAdminInventory(branchId != null ? { branchId } : undefined);
  const inventoryByProduct = useMemo(() => {
    const map = new Map<number, { inventory: number; available: boolean }>();
    for (const row of inventory.data ?? []) {
      const productId = row.product?.id;
      const bp = row.branchProduct as { inventory?: number; available?: boolean };
      const qty = Number(bp?.inventory ?? 0);
      const available = bp?.available !== false;
      if (productId != null) map.set(productId, { inventory: qty, available });
    }
    return map;
  }, [inventory.data]);

  const slots = useListFulfillmentSlots({
    branchId: branchId ?? 0,
    date,
    method: fulfillmentMethod,
  });

  const customerSearch = useSearchAdminCustomers(
    { q: customerQuery.trim().length >= 2 ? customerQuery : "__", limit: 8 },
  );

  const filteredProducts = useMemo(() => {
    const list = products.data ?? [];
    return list.slice(0, 30).map((p) => {
      const stock = inventoryByProduct.get(p.id);
      return {
        ...p,
        inventory: stock?.inventory,
        available: stock ? stock.available && stock.inventory > 0 : true,
      };
    });
  }, [products.data, inventoryByProduct]);

  const previewMutation = usePreviewAdminOrder();
  const createMutation = useCreateAdminOrder();

  const buildPayload = (): AdminOrderInput | null => {
    if (branchId == null || !customerName.trim() || !customerEmail.trim() || !lines.length) {
      return null;
    }
    const manualDiscount =
      discountValue && discountReason.trim()
        ? {
            type: discountType,
            value: Number(discountValue),
            reason: discountReason.trim(),
          }
        : undefined;
    return {
      orderSource,
      branchId,
      userId,
      fulfillmentMethod,
      scheduledStart: toScheduledStart(date, time),
      customerEmail: customerEmail.trim(),
      customerName: customerName.trim(),
      customerPhone: customerPhone.trim() || "0000000000",
      deliveryAddress: fulfillmentMethod === "delivery" ? deliveryAddress : null,
      deliveryLatitude: fulfillmentMethod === "delivery" ? deliveryLatitude : null,
      deliveryLongitude: fulfillmentMethod === "delivery" ? deliveryLongitude : null,
      customerNotes: customerNotes || null,
      productionNotes: productionNotes || null,
      internalNotes: internalNotes || null,
      lines: lines.map(({ productId, variantId, quantity, manualLineItem, description, unitPrice }) => ({
        productId: productId ?? null,
        variantId: variantId ?? null,
        quantity,
        manualLineItem: Boolean(manualLineItem),
        description,
        unitPrice,
      })),
      manualDiscount,
      couponCode: couponCode.trim() || null,
      paymentMethod,
      markPaid: paymentMethod === "PENDING" ? false : markPaid || ["CASH", "TERMINAL", "COURTESY"].includes(paymentMethod),
      paymentReference: paymentReference || null,
      paymentNote: paymentNote || null,
      overrides: forceAvailability
        ? { stock: true, slot: true, delivery: true, reason: overrideReason.trim() || "Override autorizado" }
        : undefined,
    };
  };

  useEffect(() => {
    const payload = buildPayload();
    if (!payload) return;
    const t = setTimeout(() => {
      previewMutation.mutate({ data: payload });
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines, branchId, date, time, fulfillmentMethod, discountValue, discountReason, couponCode, forceAvailability, deliveryLatitude, deliveryLongitude]);

  const preview = previewMutation.data;

  const addProduct = (product: { id: number; name: string; sku?: string | null; price: number; inventory?: number }) => {
    setLines((prev) => {
      const existing = prev.find((l) => l.productId === product.id && !l.manualLineItem);
      if (existing) {
        return prev.map((l) =>
          l.key === existing.key ? { ...l, quantity: l.quantity + 1 } : l,
        );
      }
      return [
        ...prev,
        {
          key: `p-${product.id}-${Date.now()}`,
          productId: product.id,
          quantity: 1,
          manualLineItem: false,
          name: product.name,
          sku: product.sku ?? undefined,
          unitPriceDisplay: product.price,
          inventory: product.inventory ?? null,
        },
      ];
    });
    setProductQuery("");
  };

  const addManualLine = () => {
    const price = Number(manualPrice);
    if (!manualDesc.trim() || !Number.isFinite(price) || price < 0) {
      toast({ title: "Concepto y precio válidos requeridos", variant: "destructive" });
      return;
    }
    setLines((prev) => [
      ...prev,
      {
        key: `m-${Date.now()}`,
        quantity: 1,
        manualLineItem: true,
        description: manualDesc.trim(),
        unitPrice: price,
        name: manualDesc.trim(),
        unitPriceDisplay: price,
      },
    ]);
    setManualDesc("");
    setManualPrice("");
  };

  const confirm = async () => {
    const payload = buildPayload();
    if (!payload) {
      toast({ title: "Completa sucursal, cliente y productos", variant: "destructive" });
      return;
    }
    if (forceAvailability && !overrideReason.trim()) {
      toast({ title: "Motivo de override requerido", variant: "destructive" });
      return;
    }
    try {
      const order = await createMutation.mutateAsync({ data: payload });
      setCreatedOrderId(order.id);
      setCreatedOrderNumber(order.orderNumber);
      setCreatedTotal(order.total);
      toast({ title: `Pedido #${order.orderNumber} creado` });
    } catch (error: any) {
      toast({
        title: error?.message ?? "No se pudo crear el pedido",
        variant: "destructive",
      });
    }
  };

  const branchName = branches.data?.find((b) => b.id === branchId)?.name;

  if (createdOrderId && createdOrderNumber) {
    const wa = whatsappComposeUrl(
      customerPhone,
      buildWhatsAppOrderMessage({
        customerName,
        orderNumber: createdOrderNumber,
        branchName,
        scheduledStart: toScheduledStart(date, time),
        total: createdTotal ?? 0,
        paymentStatus: markPaid ? "paid" : "unpaid",
      }),
    );
    return (
      <AdminLayout>
        <div className="p-6 md:p-10 max-w-xl space-y-6">
          <h1 className="font-serif text-3xl">Pedido #{createdOrderNumber} creado correctamente</h1>
          <div className="flex flex-wrap gap-3">
            <Button asChild>
              <Link href={`/admin/pedidos/${createdOrderId}`}>Ver pedido</Link>
            </Button>
            <Button variant="outline" asChild>
              <a href={wa} target="_blank" rel="noreferrer">
                Enviar WhatsApp
              </a>
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setCreatedOrderId(null);
                setLines([]);
              }}
            >
              Crear otro
            </Button>
          </div>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="p-4 md:p-6 flex-1 overflow-hidden flex flex-col gap-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="font-serif text-2xl md:text-3xl">Nuevo pedido</h1>
            <p className="text-sm text-muted-foreground">Pedido manual · misma lógica que el ecommerce</p>
          </div>
          <Button variant="outline" asChild>
            <Link href="/admin/pedidos">Cancelar</Link>
          </Button>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-12 gap-3 border border-border bg-background p-3 md:p-4">
          <div className="xl:col-span-2 space-y-1">
            <Label>Origen</Label>
            <select
              className="w-full h-10 border border-border bg-background px-2 text-sm"
              value={orderSource}
              onChange={(e) => setOrderSource(e.target.value as OrderSource)}
            >
              {Object.entries(ORDER_SOURCE_LABELS)
                .filter(([k]) => k !== "STOREFRONT")
                .map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
            </select>
          </div>
          <div className="xl:col-span-3 space-y-1">
            <Label>Sucursal *</Label>
            <select
              className="w-full h-10 border border-border bg-background px-2 text-sm"
              value={branchId ?? ""}
              onChange={(e) => {
                setBranchId(Number(e.target.value));
                setLines([]);
              }}
              disabled={Boolean(preBranch)}
            >
              {(branches.data ?? []).map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
          <div className="xl:col-span-2 space-y-1">
            <Label>Fecha *</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="xl:col-span-2 space-y-1">
            <Label>Hora *</Label>
            <select
              className="w-full h-10 border border-border bg-background px-2 text-sm"
              value={time}
              onChange={(e) => setTime(e.target.value)}
            >
              {(slots.data ?? [])
                .filter((s) => s.available || forceAvailability)
                .map((s) => {
                  const t = new Date(s.start).toLocaleTimeString("es-MX", {
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: false,
                    timeZone: "America/Mexico_City",
                  });
                  return (
                    <option key={String(s.start)} value={t}>
                      {t}
                      {!s.available ? " (forzar)" : ""}
                    </option>
                  );
                })}
            </select>
          </div>
          <div className="xl:col-span-3 space-y-1">
            <Label>Entrega</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={fulfillmentMethod === "pickup" ? "default" : "outline"}
                className="flex-1"
                onClick={() => setFulfillmentMethod("pickup")}
              >
                Pickup
              </Button>
              <Button
                type="button"
                variant={fulfillmentMethod === "delivery" ? "default" : "outline"}
                className="flex-1"
                onClick={() => setFulfillmentMethod("delivery")}
              >
                Delivery
              </Button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 flex-1 min-h-0">
          <div className="border border-border bg-background p-4 overflow-y-auto space-y-4">
            <div className="space-y-2">
              <Label>Cliente</Label>
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-8"
                  placeholder="Buscar nombre / teléfono / email"
                  value={customerQuery}
                  onChange={(e) => setCustomerQuery(e.target.value)}
                />
              </div>
              {customerQuery.trim().length >= 2 && customerSearch.data?.length ? (
                <ul className="border border-border divide-y max-h-40 overflow-y-auto text-sm">
                  {customerSearch.data.map((c) => (
                    <li key={`${c.email}-${c.userId}`}>
                      <button
                        type="button"
                        className="w-full text-left px-3 py-2 hover:bg-muted"
                        onClick={() => {
                          setCustomerName(c.name);
                          setCustomerEmail(c.email);
                          setCustomerPhone(c.phone ?? "");
                          setUserId(c.userId ?? null);
                          setCustomerQuery("");
                        }}
                      >
                        <div className="font-medium">{c.name}</div>
                        <div className="text-muted-foreground">
                          {c.phone} · {c.email}
                          {c.orderCount ? ` · ${c.orderCount} pedidos` : ""}
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                <Input placeholder="Nombre *" value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
                <Input placeholder="Teléfono" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} />
                <Input placeholder="Email *" value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} />
              </div>
              <p className="text-xs text-muted-foreground">Cliente invitado permitido — no requiere cuenta.</p>
            </div>

            {fulfillmentMethod === "delivery" ? (
              <div className="space-y-2">
                <Label>Dirección delivery</Label>
                <Textarea
                  value={deliveryAddress}
                  onChange={(e) => setDeliveryAddress(e.target.value)}
                  placeholder="Calle, colonia, CP, referencias"
                />
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    type="number"
                    step="any"
                    placeholder="Latitud"
                    value={deliveryLatitude ?? ""}
                    onChange={(e) => setDeliveryLatitude(e.target.value ? Number(e.target.value) : null)}
                  />
                  <Input
                    type="number"
                    step="any"
                    placeholder="Longitud"
                    value={deliveryLongitude ?? ""}
                    onChange={(e) => setDeliveryLongitude(e.target.value ? Number(e.target.value) : null)}
                  />
                </div>
              </div>
            ) : null}

            <div className="space-y-2">
              <Label>Buscar producto</Label>
              <Input
                placeholder="Nombre o SKU (Ctrl+K focus)"
                value={productQuery}
                onChange={(e) => setProductQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && filteredProducts[0]) {
                    e.preventDefault();
                    addProduct(filteredProducts[0] as any);
                  }
                }}
                id="admin-product-search"
              />
              <ul className="divide-y border border-border max-h-72 overflow-y-auto">
                {filteredProducts.map((p) => {
                  const inv = (p as any).inventory as number | undefined;
                  const available = (p as any).available !== false;
                  return (
                    <li key={p.id} className="flex items-center gap-3 p-2 text-sm">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{p.name}</div>
                        <div className="text-muted-foreground">
                          {p.sku} · {formatPriceMx(p.price)}
                          {inv != null ? ` · Stock: ${inv}` : ""}
                          {!available ? " · No disponible" : ""}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        disabled={!available && !forceAvailability}
                        onClick={() => addProduct(p as any)}
                      >
                        Añadir
                      </Button>
                    </li>
                  );
                })}
              </ul>
            </div>

            <div className="space-y-2 border-t border-border pt-4">
              <Label>Concepto manual (autorizados)</Label>
              <div className="flex gap-2">
                <Input placeholder="Descripción" value={manualDesc} onChange={(e) => setManualDesc(e.target.value)} />
                <Input
                  type="number"
                  placeholder="Precio"
                  className="w-28"
                  value={manualPrice}
                  onChange={(e) => setManualPrice(e.target.value)}
                />
                <Button type="button" variant="outline" onClick={addManualLine}>
                  Agregar
                </Button>
              </div>
            </div>
          </div>

          <div className="border border-border bg-background p-4 overflow-y-auto flex flex-col gap-4">
            <h2 className="font-medium">Pedido actual</h2>
            {!lines.length ? (
              <p className="text-sm text-muted-foreground">Agrega productos desde la búsqueda.</p>
            ) : (
              <ul className="space-y-3">
                {lines.map((line) => {
                  const previewLine = preview?.lines.find(
                    (p) =>
                      (line.manualLineItem && p.manualLineItem && p.name === (line.description || line.name)) ||
                      (!line.manualLineItem && p.productId === line.productId),
                  );
                  return (
                    <li key={line.key} className="border border-border p-3 space-y-2">
                      <div className="flex justify-between gap-2">
                        <div>
                          <div className="font-medium text-sm">
                            {previewLine?.name ?? line.name ?? line.description}
                            {line.manualLineItem ? (
                              <span className="ml-2 text-xs uppercase text-muted-foreground">Manual</span>
                            ) : null}
                          </div>
                          {previewLine?.reason ? (
                            <div className="text-xs text-destructive">{previewLine.reason}</div>
                          ) : null}
                        </div>
                        <button type="button" onClick={() => setLines((prev) => prev.filter((l) => l.key !== line.key))}>
                          <Trash2 className="h-4 w-4 text-muted-foreground" />
                        </button>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          size="icon"
                          variant="outline"
                          className="h-8 w-8"
                          onClick={() =>
                            setLines((prev) =>
                              prev.map((l) =>
                                l.key === line.key ? { ...l, quantity: Math.max(1, l.quantity - 1) } : l,
                              ),
                            )
                          }
                        >
                          <Minus className="h-3 w-3" />
                        </Button>
                        <Input
                          className="w-16 h-8 text-center"
                          type="number"
                          min={1}
                          value={line.quantity}
                          onChange={(e) =>
                            setLines((prev) =>
                              prev.map((l) =>
                                l.key === line.key
                                  ? { ...l, quantity: Math.max(1, Number(e.target.value) || 1) }
                                  : l,
                              ),
                            )
                          }
                        />
                        <Button
                          size="icon"
                          variant="outline"
                          className="h-8 w-8"
                          onClick={() =>
                            setLines((prev) =>
                              prev.map((l) => (l.key === line.key ? { ...l, quantity: l.quantity + 1 } : l)),
                            )
                          }
                        >
                          <Plus className="h-3 w-3" />
                        </Button>
                        <div className="ml-auto text-sm">
                          {previewLine
                            ? formatPriceMx(previewLine.lineTotal)
                            : formatPriceMx((line.unitPriceDisplay ?? line.unitPrice ?? 0) * line.quantity)}
                        </div>
                      </div>
                      {previewLine && previewLine.promotionDiscount > 0 ? (
                        <div className="text-xs text-muted-foreground">
                          Promo −{formatPriceMx(previewLine.promotionDiscount)}
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}

            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="space-y-1">
                <Label>Descuento manual</Label>
                <div className="flex gap-1">
                  <select
                    className="h-9 border border-border px-1"
                    value={discountType}
                    onChange={(e) => setDiscountType(e.target.value as "percent" | "amount")}
                  >
                    <option value="percent">%</option>
                    <option value="amount">$</option>
                  </select>
                  <Input
                    type="number"
                    value={discountValue}
                    onChange={(e) => setDiscountValue(e.target.value)}
                    placeholder="0"
                  />
                </div>
                <Input
                  placeholder="Motivo *"
                  value={discountReason}
                  onChange={(e) => setDiscountReason(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label>Cupón</Label>
                <Input value={couponCode} onChange={(e) => setCouponCode(e.target.value)} placeholder="CODIGO" />
              </div>
            </div>

            <div className="space-y-2 text-sm">
              <Label>Pago</Label>
              <select
                className="w-full h-10 border border-border px-2"
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
              >
                {Object.entries(PAYMENT_METHOD_LABELS)
                  .filter(([k]) => k !== "ONLINE")
                  .map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
              </select>
              {paymentMethod !== "PENDING" ? (
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={markPaid} onChange={(e) => setMarkPaid(e.target.checked)} />
                  Marcar como pagado
                </label>
              ) : null}
              <Input
                placeholder="Referencia"
                value={paymentReference}
                onChange={(e) => setPaymentReference(e.target.value)}
              />
              <Input placeholder="Nota de pago" value={paymentNote} onChange={(e) => setPaymentNote(e.target.value)} />
            </div>

            <div className="space-y-2 text-sm">
              <Label>Notas</Label>
              <Textarea placeholder="Nota para producción" value={productionNotes} onChange={(e) => setProductionNotes(e.target.value)} />
              <Textarea placeholder="Nota interna" value={internalNotes} onChange={(e) => setInternalNotes(e.target.value)} />
              <Textarea placeholder="Nota para cliente" value={customerNotes} onChange={(e) => setCustomerNotes(e.target.value)} />
            </div>

            <label className={cn("flex items-start gap-2 text-sm border border-border p-3", forceAvailability && "bg-muted/40")}>
              <input
                type="checkbox"
                className="mt-1"
                checked={forceAvailability}
                onChange={(e) => setForceAvailability(e.target.checked)}
              />
              <span className="space-y-1 flex-1">
                <span className="font-medium block">Forzar disponibilidad</span>
                <Input
                  placeholder="Motivo obligatorio"
                  value={overrideReason}
                  disabled={!forceAvailability}
                  onChange={(e) => setOverrideReason(e.target.value)}
                />
              </span>
            </label>

            <div className="mt-auto border-t border-border pt-4 space-y-1 text-sm">
              {preview?.errors?.length ? (
                <div className="text-destructive text-xs mb-2">{preview.errors.join(" · ")}</div>
              ) : null}
              <div className="flex justify-between">
                <span>Subtotal</span>
                <span>{formatPriceMx(preview?.subtotal ?? 0)}</span>
              </div>
              {(preview?.promotionDiscountTotal ?? 0) > 0 ? (
                <div className="flex justify-between text-muted-foreground">
                  <span>Promociones</span>
                  <span>−{formatPriceMx(preview!.promotionDiscountTotal)}</span>
                </div>
              ) : null}
              {(preview?.discountAmount ?? 0) > 0 ? (
                <div className="flex justify-between text-muted-foreground">
                  <span>Descuento manual</span>
                  <span>−{formatPriceMx(preview!.discountAmount)}</span>
                </div>
              ) : null}
              {(preview?.couponDiscount ?? 0) > 0 ? (
                <div className="flex justify-between text-muted-foreground">
                  <span>Cupón</span>
                  <span>−{formatPriceMx(preview!.couponDiscount)}</span>
                </div>
              ) : null}
              <div className="flex justify-between text-muted-foreground">
                <span>Delivery</span>
                <span>{formatPriceMx(preview?.deliveryFee ?? 0)}</span>
              </div>
              <div className="flex justify-between text-lg font-medium pt-2">
                <span>Total</span>
                <span>{formatPriceMx(preview?.total ?? 0)}</span>
              </div>
              <Button className="w-full mt-3" size="lg" disabled={createMutation.isPending || !lines.length} onClick={confirm}>
                {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirmar pedido"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
