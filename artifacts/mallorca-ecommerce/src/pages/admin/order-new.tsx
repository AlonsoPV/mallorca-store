import { AdminLayout } from "@/components/layout/admin-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useToast } from "@/hooks/use-toast";
import {
  ORDER_SOURCE_LABELS,
  PAYMENT_METHOD_LABELS,
  fulfillmentLabel,
} from "@/lib/order-source";
import { formatPriceMx } from "@/lib/order-status";
import { cn } from "@/lib/utils";
import {
  useCreateAdminOrder,
  useDuplicateAdminOrder,
  useListAdminBranches,
  useListAdminInventory,
  useListAdminProducts,
  useListCategories,
  useListFulfillmentSlots,
  usePreviewAdminOrder,
  useSearchAdminCustomers,
  type AdminOrderInput,
  type AdminOrderLineInput,
  type OrderSource,
  type PaymentMethod,
} from "@workspace/api-client-react";
import { Loader2, Minus, Plus, Search, Trash2, X } from "lucide-react";
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
  imageUrl?: string | null;
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
  const categories = useListCategories();
  const preBranch = params.get("branchId");
  const duplicateFrom = params.get("duplicateFrom");
  const preCustomerName = params.get("customerName");
  const preCustomerEmail = params.get("customerEmail");
  const preCustomerPhone = params.get("customerPhone");
  const preUserId = params.get("customerUserId");

  const [orderSource, setOrderSource] = useState<OrderSource>("WHATSAPP");
  const [branchId, setBranchId] = useState<number | null>(preBranch ? Number(preBranch) : null);
  const [customerName, setCustomerName] = useState(preCustomerName ?? "");
  const [customerEmail, setCustomerEmail] = useState(preCustomerEmail ?? "pedido@mallorca.local");
  const [customerPhone, setCustomerPhone] = useState(preCustomerPhone ?? "");
  const [userId, setUserId] = useState<string | null>(preUserId);
  const [customerQuery, setCustomerQuery] = useState("");
  const [quickCustomerOpen, setQuickCustomerOpen] = useState(false);
  const [date, setDate] = useState(tomorrowMexicoDate());
  const [time, setTime] = useState("12:00");
  const [fulfillmentMethod, setFulfillmentMethod] = useState<"pickup" | "delivery">("pickup");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [deliveryLatitude, setDeliveryLatitude] = useState<number | null>(null);
  const [deliveryLongitude, setDeliveryLongitude] = useState<number | null>(null);
  const [lines, setLines] = useState<BuilderLine[]>([]);
  const [productQuery, setProductQuery] = useState("");
  const [categoryId, setCategoryId] = useState<string>("all");
  const [customerNotes, setCustomerNotes] = useState("");
  const [productionNotes, setProductionNotes] = useState("");
  const [internalNotes, setInternalNotes] = useState("");
  const [notesOpen, setNotesOpen] = useState(false);
  const [discountOpen, setDiscountOpen] = useState(false);
  const [mobileCartOpen, setMobileCartOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("CASH_ON_PICKUP");
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
  const [lastAddedId, setLastAddedId] = useState<number | null>(null);

  useEffect(() => {
    if (fulfillmentMethod === "delivery" && paymentMethod === "CASH_ON_PICKUP") {
      setPaymentMethod("PENDING");
    }
    if (fulfillmentMethod === "pickup" && paymentMethod === "PENDING") {
      setPaymentMethod("CASH_ON_PICKUP");
    }
    if (paymentMethod === "CASH_ON_PICKUP" || paymentMethod === "PENDING") {
      setMarkPaid(false);
    }
  }, [fulfillmentMethod, paymentMethod]);

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

  // Do not auto-select branch — staff must choose (availability gate)
  useEffect(() => {
    if (branchId != null || !preBranch) return;
    setBranchId(Number(preBranch));
  }, [branchId, preBranch]);

  const products = useListAdminProducts({
    status: "active",
    search: productQuery.trim() || undefined,
  });
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

  const customerSearch = useSearchAdminCustomers({
    q: customerQuery.trim().length >= 2 ? customerQuery : "__",
    limit: 8,
  });

  const categoryList = categories.data ?? [];

  const filteredProducts = useMemo(() => {
    let list = products.data ?? [];
    if (categoryId !== "all") {
      const catId = Number(categoryId);
      const slug = categoryList.find((c) => c.id === catId)?.slug;
      list = list.filter((p) => {
        const cats = (p as { categories?: Array<{ id: number }> }).categories;
        if (cats?.length) return cats.some((c) => c.id === catId);
        return slug ? p.categorySlug === slug : false;
      });
    }
    return list.slice(0, 40).map((p) => {
      const stock = inventoryByProduct.get(p.id);
      const inventoryQty = stock?.inventory;
      const available = stock
        ? stock.available && (inventoryQty == null || inventoryQty > 0)
        : branchId == null
          ? false
          : true;
      return {
        ...p,
        inventory: inventoryQty,
        available,
        soldOut: stock ? !stock.available || (inventoryQty != null && inventoryQty <= 0) : false,
      };
    });
  }, [products.data, inventoryByProduct, categoryId, categoryList, branchId]);

  const crossSell = useMemo(() => {
    if (lastAddedId == null) return [];
    return filteredProducts.filter((p) => p.id !== lastAddedId && p.available).slice(0, 3);
  }, [filteredProducts, lastAddedId]);

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
      markPaid:
        paymentMethod === "PENDING" || paymentMethod === "CASH_ON_PICKUP"
          ? false
          : markPaid || ["CASH", "TERMINAL", "COURTESY"].includes(paymentMethod),
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
  }, [
    lines,
    branchId,
    date,
    time,
    fulfillmentMethod,
    discountValue,
    discountReason,
    couponCode,
    forceAvailability,
    deliveryLatitude,
    deliveryLongitude,
  ]);

  const preview = previewMutation.data;

  const addProduct = (product: {
    id: number;
    name: string;
    sku?: string | null;
    price: number;
    inventory?: number;
    imageUrl?: string | null;
    available?: boolean;
    soldOut?: boolean;
  }) => {
    if (branchId == null) {
      toast({ title: "Selecciona una sucursal para ver disponibilidad.", variant: "destructive" });
      return;
    }
    if (product.soldOut && !forceAvailability) return;
    setLines((prev) => {
      const existing = prev.find((l) => l.productId === product.id && !l.manualLineItem);
      if (existing) {
        return prev.map((l) => (l.key === existing.key ? { ...l, quantity: l.quantity + 1 } : l));
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
          imageUrl: product.imageUrl,
        },
      ];
    });
    setLastAddedId(product.id);
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

  const blockingReason = useMemo(() => {
    if (branchId == null) return "Selecciona una sucursal para continuar.";
    if (!customerName.trim()) return "Selecciona o crea un cliente.";
    if (!lines.length) return "Añade al menos un producto.";
    if (!time) return "Selecciona una hora para continuar.";
    if (fulfillmentMethod === "delivery" && !deliveryAddress.trim()) {
      return "Ingresa la dirección de delivery.";
    }
    if (forceAvailability && !overrideReason.trim()) {
      return "Indica el motivo del override.";
    }
    if (preview?.errors?.length) return preview.errors[0];
    const badLine = preview?.lines.find((l) => l.reason);
    if (badLine?.reason) return badLine.reason;
    return null;
  }, [
    branchId,
    customerName,
    lines.length,
    time,
    fulfillmentMethod,
    deliveryAddress,
    forceAvailability,
    overrideReason,
    preview,
  ]);

  const confirm = async () => {
    const payload = buildPayload();
    if (!payload || blockingReason) {
      toast({
        title: blockingReason ?? "Completa los datos requeridos",
        variant: "destructive",
      });
      return;
    }
    try {
      const order = await createMutation.mutateAsync({ data: payload });
      toast({ title: `Pedido #${order.orderNumber} creado correctamente` });
      setLocation(`/admin/pedidos/${order.id}`);
    } catch (error: unknown) {
      const err = error as { message?: string };
      toast({
        title: err?.message ?? "No se pudo crear el pedido",
        variant: "destructive",
      });
    }
  };

  const branchName = branches.data?.find((b) => b.id === branchId)?.name;
  const itemCount = lines.reduce((sum, l) => sum + l.quantity, 0);
  const displayTotal = preview?.total ?? lines.reduce(
    (sum, l) => sum + (l.unitPriceDisplay ?? l.unitPrice ?? 0) * l.quantity,
    0,
  );

  const OrderSummaryPanel = (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-border px-4 py-3">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          Pedido actual
        </h2>
        <div className="mt-2 space-y-0.5 text-sm">
          <p className="font-medium">{customerName || "Sin cliente"}</p>
          <p className="text-muted-foreground">{branchName ?? "Sin sucursal"}</p>
          <p className="text-muted-foreground">
            {fulfillmentLabel(fulfillmentMethod)}
            {" · "}
            {date}
            {" · "}
            {time}
          </p>
          {paymentMethod === "CASH_ON_PICKUP" ? (
            <p className="pt-1 text-xs font-medium text-amber-800">
              Por cobrar {formatPriceMx(displayTotal)}
            </p>
          ) : null}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {!lines.length ? (
          <p className="text-sm text-muted-foreground">Agrega productos desde la búsqueda.</p>
        ) : (
          <ul className="space-y-3">
            {lines.map((line) => {
              const previewLine = preview?.lines.find(
                (p) =>
                  (line.manualLineItem &&
                    p.manualLineItem &&
                    p.name === (line.description || line.name)) ||
                  (!line.manualLineItem && p.productId === line.productId),
              );
              return (
                <li key={line.key} className="space-y-1.5 border-b border-border pb-3 last:border-0">
                  <div className="flex justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">
                        {previewLine?.name ?? line.name ?? line.description}
                      </div>
                      {line.sku ? (
                        <div className="text-xs text-muted-foreground">{line.sku}</div>
                      ) : null}
                      {previewLine?.reason ? (
                        <div className="text-xs text-destructive">{previewLine.reason}</div>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      className="shrink-0 text-muted-foreground hover:text-foreground"
                      onClick={() => setLines((prev) => prev.filter((l) => l.key !== line.key))}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="icon"
                      variant="outline"
                      className="h-7 w-7 rounded-none"
                      onClick={() =>
                        setLines((prev) =>
                          prev.map((l) =>
                            l.key === line.key
                              ? { ...l, quantity: Math.max(1, l.quantity - 1) }
                              : l,
                          ),
                        )
                      }
                    >
                      <Minus className="h-3 w-3" />
                    </Button>
                    <span className="w-6 text-center text-sm tabular-nums">{line.quantity}</span>
                    <Button
                      size="icon"
                      variant="outline"
                      className="h-7 w-7 rounded-none"
                      onClick={() =>
                        setLines((prev) =>
                          prev.map((l) =>
                            l.key === line.key ? { ...l, quantity: l.quantity + 1 } : l,
                          ),
                        )
                      }
                    >
                      <Plus className="h-3 w-3" />
                    </Button>
                    <div className="ml-auto text-sm tabular-nums">
                      {previewLine
                        ? formatPriceMx(previewLine.lineTotal)
                        : formatPriceMx((line.unitPriceDisplay ?? line.unitPrice ?? 0) * line.quantity)}
                    </div>
                  </div>
                  {previewLine && previewLine.promotionDiscount > 0 ? (
                    <div className="text-xs text-amber-800">
                      Promo −{formatPriceMx(previewLine.promotionDiscount)}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}

        {crossSell.length > 0 && lines.length > 0 ? (
          <div className="mt-4 border-t border-border pt-3">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Sugerencias
            </p>
            <ul className="space-y-1.5">
              {crossSell.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="truncate">{p.name}</span>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 rounded-none px-2"
                    onClick={() => addProduct(p as never)}
                  >
                    +
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      <div className="border-t border-border bg-background px-4 py-3 space-y-2">
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 rounded-none px-2 text-xs"
            onClick={() => setDiscountOpen(true)}
          >
            + Aplicar descuento
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 rounded-none px-2 text-xs"
            onClick={() => setNotesOpen(true)}
          >
            + Añadir nota
          </Button>
        </div>

        <div>
          <Label className="text-xs">Forma de pago</Label>
          <select
            className="mt-1 h-9 w-full border border-border bg-background px-2 text-sm"
            value={paymentMethod}
            onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
          >
            {Object.entries(PAYMENT_METHOD_LABELS)
              .filter(([k]) => k !== "ONLINE")
              .filter(([k]) => fulfillmentMethod === "pickup" || k !== "CASH_ON_PICKUP")
              .map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
          </select>
          {paymentMethod !== "PENDING" && paymentMethod !== "CASH_ON_PICKUP" ? (
            <label className="mt-1.5 flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={markPaid}
                onChange={(e) => setMarkPaid(e.target.checked)}
              />
              Marcar como pagado
            </label>
          ) : null}
        </div>

        <dl className="space-y-1 text-sm">
          <div className="flex justify-between">
            <dt>Subtotal</dt>
            <dd className="tabular-nums">{formatPriceMx(preview?.subtotal ?? displayTotal)}</dd>
          </div>
          {(preview?.promotionDiscountTotal ?? 0) > 0 ? (
            <div className="flex justify-between text-muted-foreground">
              <dt>Promoción</dt>
              <dd>−{formatPriceMx(preview!.promotionDiscountTotal)}</dd>
            </div>
          ) : null}
          {(preview?.discountAmount ?? 0) > 0 ? (
            <div className="flex justify-between text-muted-foreground">
              <dt>Descuento</dt>
              <dd>−{formatPriceMx(preview!.discountAmount)}</dd>
            </div>
          ) : null}
          <div className="flex justify-between text-muted-foreground">
            <dt>Delivery</dt>
            <dd>{formatPriceMx(preview?.deliveryFee ?? 0)}</dd>
          </div>
          <div className="flex justify-between border-t border-border pt-2 text-base font-semibold">
            <dt>Total</dt>
            <dd className="tabular-nums">{formatPriceMx(displayTotal)}</dd>
          </div>
        </dl>

        {blockingReason ? (
          <p className="text-xs text-amber-800">{blockingReason}</p>
        ) : null}

        <Button
          className="w-full rounded-none"
          size="lg"
          disabled={createMutation.isPending || Boolean(blockingReason)}
          onClick={confirm}
        >
          {createMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            "Crear pedido"
          )}
        </Button>
      </div>
    </div>
  );

  return (
    <AdminLayout>
      <div className="flex h-[calc(100vh-3.5rem)] flex-col overflow-hidden">
        {/* Compact context bar */}
        <div className="shrink-0 border-b border-border bg-background px-3 py-2 md:px-4">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div>
              <h1 className="text-lg font-semibold leading-tight md:text-xl">Nuevo pedido</h1>
              <p className="text-xs text-muted-foreground">Toma de pedido · misma lógica que el ecommerce</p>
            </div>
            <Button variant="ghost" size="sm" className="rounded-none" asChild>
              <Link href="/admin/pedidos">Cancelar</Link>
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-2 md:grid-cols-4 lg:grid-cols-6">
            <div className="space-y-0.5">
              <Label className="text-[11px]">Sucursal *</Label>
              <select
                className="h-9 w-full border border-border bg-background px-2 text-sm"
                value={branchId ?? ""}
                onChange={(e) => {
                  setBranchId(e.target.value ? Number(e.target.value) : null);
                  setLines([]);
                }}
                disabled={Boolean(preBranch)}
              >
                <option value="">Seleccionar…</option>
                {(branches.data ?? []).map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="relative space-y-0.5 md:col-span-2">
              <Label className="text-[11px]">Cliente *</Label>
              {customerName ? (
                <div className="flex h-9 items-center gap-2 border border-border bg-background px-2 text-sm">
                  <span className="min-w-0 flex-1 truncate font-medium">{customerName}</span>
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-foreground"
                    onClick={() => {
                      setCustomerName("");
                      setCustomerPhone("");
                      setCustomerEmail("pedido@mallorca.local");
                      setUserId(null);
                    }}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      className="h-9 rounded-none pl-7 text-sm"
                      placeholder="Buscar cliente…"
                      value={customerQuery}
                      onChange={(e) => setCustomerQuery(e.target.value)}
                    />
                  </div>
                  {customerQuery.trim().length >= 2 ? (
                    <ul className="absolute z-20 mt-0.5 max-h-40 w-full overflow-y-auto border border-border bg-background text-sm shadow-sm">
                      {(customerSearch.data ?? []).map((c) => (
                        <li key={`${c.email}-${c.userId}`}>
                          <button
                            type="button"
                            className="w-full px-2 py-1.5 text-left hover:bg-muted"
                            onClick={() => {
                              setCustomerName(c.name);
                              setCustomerEmail(c.email);
                              setCustomerPhone(c.phone ?? "");
                              setUserId(c.userId ?? null);
                              setCustomerQuery("");
                            }}
                          >
                            <span className="font-medium">{c.name}</span>
                            <span className="block text-xs text-muted-foreground">
                              {c.phone} · {c.email}
                            </span>
                          </button>
                        </li>
                      ))}
                      <li>
                        <button
                          type="button"
                          className="w-full border-t border-border px-2 py-1.5 text-left text-primary hover:bg-muted"
                          onClick={() => {
                            setQuickCustomerOpen(true);
                            setCustomerQuery("");
                          }}
                        >
                          + Cliente rápido
                        </button>
                      </li>
                    </ul>
                  ) : (
                    <button
                      type="button"
                      className="mt-0.5 text-xs text-primary"
                      onClick={() => setQuickCustomerOpen(true)}
                    >
                      + Cliente rápido
                    </button>
                  )}
                </>
              )}
            </div>

            <div className="space-y-0.5">
              <Label className="text-[11px]">Origen</Label>
              <select
                className="h-9 w-full border border-border bg-background px-2 text-sm"
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

            <div className="space-y-0.5">
              <Label className="text-[11px]">Entrega</Label>
              <div className="flex h-9">
                {(["pickup", "delivery"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    className={cn(
                      "flex-1 border text-xs font-medium",
                      fulfillmentMethod === m
                        ? "border-foreground bg-foreground text-background"
                        : "border-border bg-background hover:bg-muted",
                    )}
                    onClick={() => setFulfillmentMethod(m)}
                  >
                    {fulfillmentLabel(m)}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-0.5">
                <Label className="text-[11px]">Fecha</Label>
                <Input
                  type="date"
                  className="h-9 rounded-none text-sm"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </div>
              <div className="space-y-0.5">
                <Label className="text-[11px]">Hora</Label>
                <select
                  className="h-9 w-full border border-border bg-background px-1 text-sm"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  disabled={branchId == null}
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
                          {!s.available ? " *" : ""}
                        </option>
                      );
                    })}
                </select>
              </div>
            </div>
          </div>

          {fulfillmentMethod === "delivery" ? (
            <div className="mt-2 grid gap-2 md:grid-cols-3">
              <Textarea
                className="rounded-none text-sm md:col-span-2"
                rows={2}
                placeholder="Dirección de delivery"
                value={deliveryAddress}
                onChange={(e) => setDeliveryAddress(e.target.value)}
              />
              <div className="grid grid-cols-2 gap-2">
                <Input
                  type="number"
                  step="any"
                  className="rounded-none text-sm"
                  placeholder="Lat"
                  value={deliveryLatitude ?? ""}
                  onChange={(e) =>
                    setDeliveryLatitude(e.target.value ? Number(e.target.value) : null)
                  }
                />
                <Input
                  type="number"
                  step="any"
                  className="rounded-none text-sm"
                  placeholder="Lng"
                  value={deliveryLongitude ?? ""}
                  onChange={(e) =>
                    setDeliveryLongitude(e.target.value ? Number(e.target.value) : null)
                  }
                />
              </div>
            </div>
          ) : null}
        </div>

        {/* Split workspace */}
        <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="min-h-0 overflow-y-auto border-r border-border px-3 py-3 md:px-4">
            <div className="relative mb-2">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="h-10 rounded-none pl-9"
                placeholder="Buscar producto o SKU…"
                value={productQuery}
                disabled={branchId == null}
                onChange={(e) => setProductQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && filteredProducts[0]?.available) {
                    e.preventDefault();
                    addProduct(filteredProducts[0] as never);
                  }
                }}
              />
            </div>

            <div className="mb-3 flex gap-1.5 overflow-x-auto pb-1">
              <button
                type="button"
                className={cn(
                  "shrink-0 border px-2.5 py-1 text-xs",
                  categoryId === "all"
                    ? "border-foreground bg-foreground text-background"
                    : "border-border hover:bg-muted",
                )}
                onClick={() => setCategoryId("all")}
              >
                Todos
              </button>
              {categoryList.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className={cn(
                    "shrink-0 border px-2.5 py-1 text-xs",
                    categoryId === String(c.id)
                      ? "border-foreground bg-foreground text-background"
                      : "border-border hover:bg-muted",
                  )}
                  onClick={() => setCategoryId(String(c.id))}
                >
                  {c.name}
                </button>
              ))}
            </div>

            {branchId == null ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                Selecciona una sucursal para ver disponibilidad.
              </p>
            ) : (
              <ul className="divide-y border border-border">
                {filteredProducts.map((p) => {
                  const soldOut = Boolean((p as { soldOut?: boolean }).soldOut);
                  const promoPrice = (p as { promotionalPrice?: number | null }).promotionalPrice;
                  return (
                    <li key={p.id} className="flex items-center gap-3 px-2 py-2 text-sm">
                      <div className="h-10 w-10 shrink-0 overflow-hidden border border-border bg-muted">
                        {p.imageUrl ? (
                          <img src={p.imageUrl} alt="" className="h-full w-full object-cover" />
                        ) : null}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium">{p.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {p.sku}
                          {(p as { inventory?: number }).inventory != null
                            ? ` · Stock ${(p as { inventory?: number }).inventory}`
                            : ""}
                          {soldOut ? " · AGOTADO" : ""}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        {promoPrice != null && promoPrice < p.price ? (
                          <div>
                            <div className="text-xs text-muted-foreground line-through">
                              {formatPriceMx(p.price)}
                            </div>
                            <div className="font-medium tabular-nums">{formatPriceMx(promoPrice)}</div>
                          </div>
                        ) : (
                          <div className="font-medium tabular-nums">{formatPriceMx(p.price)}</div>
                        )}
                      </div>
                      <Button
                        size="sm"
                        className="h-8 shrink-0 rounded-none"
                        disabled={soldOut && !forceAvailability}
                        onClick={() => addProduct(p as never)}
                      >
                        Añadir
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}

            <div className="mt-4 flex gap-2 border-t border-border pt-3">
              <Input
                className="rounded-none text-sm"
                placeholder="Concepto manual"
                value={manualDesc}
                onChange={(e) => setManualDesc(e.target.value)}
              />
              <Input
                type="number"
                className="w-24 rounded-none text-sm"
                placeholder="$"
                value={manualPrice}
                onChange={(e) => setManualPrice(e.target.value)}
              />
              <Button type="button" variant="outline" className="rounded-none" onClick={addManualLine}>
                +
              </Button>
            </div>

            <label className="mt-3 flex items-start gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={forceAvailability}
                onChange={(e) => setForceAvailability(e.target.checked)}
              />
              <span className="flex-1 space-y-1">
                Forzar disponibilidad
                {forceAvailability ? (
                  <Input
                    className="h-8 rounded-none"
                    placeholder="Motivo *"
                    value={overrideReason}
                    onChange={(e) => setOverrideReason(e.target.value)}
                  />
                ) : null}
              </span>
            </label>
          </div>

          {/* Desktop sticky summary */}
          <aside className="hidden min-h-0 lg:block">{OrderSummaryPanel}</aside>
        </div>

        {/* Mobile sticky cart CTA */}
        <div className="border-t border-border bg-background p-3 lg:hidden">
          <Button
            className="w-full rounded-none"
            size="lg"
            onClick={() => setMobileCartOpen(true)}
          >
            Ver pedido · {itemCount} {itemCount === 1 ? "producto" : "productos"} ·{" "}
            {formatPriceMx(displayTotal)}
          </Button>
        </div>
      </div>

      <Sheet open={mobileCartOpen} onOpenChange={setMobileCartOpen}>
        <SheetContent side="bottom" className="h-[85vh] rounded-none p-0">
          <SheetHeader className="sr-only">
            <SheetTitle>Pedido actual</SheetTitle>
          </SheetHeader>
          {OrderSummaryPanel}
        </SheetContent>
      </Sheet>

      <Dialog open={quickCustomerOpen} onOpenChange={setQuickCustomerOpen}>
        <DialogContent className="rounded-none sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Cliente rápido</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Nombre *</Label>
              <Input
                className="mt-1 rounded-none"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
              />
            </div>
            <div>
              <Label>Teléfono</Label>
              <Input
                className="mt-1 rounded-none"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
              />
            </div>
            <div>
              <Label>Email</Label>
              <Input
                className="mt-1 rounded-none"
                value={customerEmail}
                onChange={(e) => setCustomerEmail(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              className="rounded-none"
              disabled={!customerName.trim()}
              onClick={() => {
                if (!customerEmail.trim()) setCustomerEmail("pedido@mallorca.local");
                setQuickCustomerOpen(false);
              }}
            >
              Crear y seleccionar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={discountOpen} onOpenChange={setDiscountOpen}>
        <DialogContent className="rounded-none sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Descuento manual</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex gap-2">
              <select
                className="h-10 border border-border px-2"
                value={discountType}
                onChange={(e) => setDiscountType(e.target.value as "percent" | "amount")}
              >
                <option value="percent">%</option>
                <option value="amount">$</option>
              </select>
              <Input
                type="number"
                className="rounded-none"
                value={discountValue}
                onChange={(e) => setDiscountValue(e.target.value)}
                placeholder="0"
              />
            </div>
            <Input
              className="rounded-none"
              placeholder="Motivo *"
              value={discountReason}
              onChange={(e) => setDiscountReason(e.target.value)}
            />
            <Input
              className="rounded-none"
              placeholder="Cupón (opcional)"
              value={couponCode}
              onChange={(e) => setCouponCode(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button className="rounded-none" onClick={() => setDiscountOpen(false)}>
              Aplicar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={notesOpen} onOpenChange={setNotesOpen}>
        <DialogContent className="rounded-none sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Notas</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Producción</Label>
              <Textarea
                className="mt-1 rounded-none"
                value={productionNotes}
                onChange={(e) => setProductionNotes(e.target.value)}
              />
            </div>
            <div>
              <Label>Interna</Label>
              <Textarea
                className="mt-1 rounded-none"
                value={internalNotes}
                onChange={(e) => setInternalNotes(e.target.value)}
              />
            </div>
            <div>
              <Label>Cliente</Label>
              <Textarea
                className="mt-1 rounded-none"
                value={customerNotes}
                onChange={(e) => setCustomerNotes(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button className="rounded-none" onClick={() => setNotesOpen(false)}>
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
