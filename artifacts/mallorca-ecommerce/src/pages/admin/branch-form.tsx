import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useLocation, useParams } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useCreateAdminBranch,
  useGetAdminBranch,
  useUpdateAdminBranch,
  useListAdminUsers,
  useCreateBranchAssignment,
  getListAdminBranchesQueryKey,
  getGetAdminBranchQueryKey,
  type BranchHour,
  type BranchCreate,
  type BranchUpdate,
} from "@workspace/api-client-react";
import { AdminLayout } from "@/components/layout/admin-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const STEPS = [
  "General",
  "Ubicación",
  "Contacto",
  "Canales",
  "Horarios",
  "Imágenes",
  "Equipo",
  "Operación",
  "Avanzado",
] as const;

const DAYS: Array<{ day: string; label: string }> = [
  { day: "monday", label: "Lunes" },
  { day: "tuesday", label: "Martes" },
  { day: "wednesday", label: "Miércoles" },
  { day: "thursday", label: "Jueves" },
  { day: "friday", label: "Viernes" },
  { day: "saturday", label: "Sábado" },
  { day: "sunday", label: "Domingo" },
];

function defaultHours(): BranchHour[] {
  return DAYS.map((d) => ({
    day: d.day,
    label: d.label,
    open: "09:00",
    close: "22:00",
    closed: false,
  }));
}

type FormState = BranchUpdate & {
  primaryUserId?: string;
};

function emptyForm(): FormState {
  return {
    name: "",
    shortName: "",
    branchCode: "",
    slug: "",
    shortDescription: "",
    description: "",
    status: "inactive",
    featured: false,
    street: "",
    externalNumber: "",
    internalNumber: "",
    neighborhood: "",
    borough: "",
    city: "Ciudad de México",
    state: "CDMX",
    postalCode: "",
    country: "México",
    latitude: null,
    longitude: null,
    placeId: "",
    mapsUrl: "https://maps.google.com",
    phone: "",
    secondaryPhone: "",
    whatsapp: "",
    whatsappDefaultMessage: "",
    email: "",
    ordersEmail: "",
    reservationsEmail: "",
    adminEmail: "",
    reservationProvider: "none",
    reservationUrl: "",
    reservationCta: "Reservar mesa",
    openTableUrl: "",
    instagramUrl: "",
    hours: defaultHours(),
    imageUrl: "",
    gallery: [],
    links: [],
    images: [],
    pickupAvailable: true,
    deliveryAvailable: true,
    preparationTimeMinutes: 30,
    deliveryTimeMinutes: 60,
    pickupSlotIntervalMinutes: 30,
    pickupSlotCapacity: 10,
    deliveryRadiusKm: 5,
    minimumOrder: 0,
    freeDeliveryFrom: null,
    deliveryFee: 90,
    notificationPreferences: {
      email: true,
      inApp: true,
      whatsapp: false,
      lowStock: true,
      criticalStock: true,
      outOfStock: true,
      newOrder: true,
      cancelledOrder: true,
      incident: true,
    },
    seoTitle: "",
    metaDescription: "",
    ogImageUrl: "",
    primaryUserId: "",
  };
}

export default function AdminBranchForm() {
  const params = useParams<{ id?: string }>();
  const isNew = !params.id || params.id === "nueva";
  const branchId = isNew ? null : Number(params.id);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const existing = useGetAdminBranch(branchId ?? 0, {
    query: {
      enabled: !!branchId && Number.isFinite(branchId),
      queryKey: getGetAdminBranchQueryKey(branchId ?? 0),
    },
  });
  const users = useListAdminUsers();
  const create = useCreateAdminBranch();
  const update = useUpdateAdminBranch();
  const assign = useCreateBranchAssignment();

  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [codeWarning, setCodeWarning] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!existing.data?.branch) return;
    const b = existing.data.branch;
    setForm({
      ...emptyForm(),
      ...b,
      hours: (b.hours?.length ? b.hours : defaultHours()) as BranchHour[],
      gallery: b.gallery ?? [],
      links: (b as any).links ?? [],
      images: (b as any).images ?? [],
      notificationPreferences: {
        email: true,
        inApp: true,
        whatsapp: false,
        lowStock: true,
        criticalStock: true,
        outOfStock: true,
        newOrder: true,
        cancelledOrder: true,
        incident: true,
        ...(b.notificationPreferences || {}),
      },
      primaryUserId: (b as any).primaryResponsible?.userId || "",
      whatsappDefaultMessage: b.whatsappDefaultMessage || `Hola, quiero información de ${b.name}.`,
    });
  }, [existing.data]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const canActivate = useMemo(() => {
    return !!(
      form.name &&
      form.branchCode &&
      (form.street || form.address) &&
      form.phone &&
      form.email &&
      (form.hours?.some((h) => !h.closed) ?? false)
    );
  }, [form]);

  async function persist(activate: boolean) {
    if (!form.name || !form.branchCode || !form.phone || !form.email) {
      toast({ title: "Completa nombre, código, teléfono y correo", variant: "destructive" });
      return;
    }
    setSaving(true);
    const payload: BranchCreate | BranchUpdate = {
      ...form,
      status: activate ? "active" : form.status || "inactive",
      shortName: form.shortName || form.name.split(" ").slice(-1)[0],
      slug: form.slug || undefined,
      branchCode: form.branchCode?.toUpperCase(),
      whatsappDefaultMessage:
        form.whatsappDefaultMessage ||
        (form.name ? `Hola, quiero información de ${form.name}.` : undefined),
      address:
        form.address ||
        [form.street, form.externalNumber, form.neighborhood, form.city, form.postalCode]
          .filter(Boolean)
          .join(", "),
      mapsUrl: form.mapsUrl || "https://maps.google.com",
      openTableUrl:
        form.reservationProvider === "opentable"
          ? form.reservationUrl || form.openTableUrl || null
          : form.openTableUrl || null,
      reservationUrl:
        form.reservationProvider === "none" ? null : form.reservationUrl || form.openTableUrl || null,
    };
    try {
      let id = branchId;
      if (isNew) {
        const created = await create.mutateAsync({ data: payload as BranchCreate });
        id = created.id;
        if (form.primaryUserId && id) {
          await assign.mutateAsync({
            id,
            data: { userId: form.primaryUserId, role: "branch_manager", isPrimary: true },
          });
        }
        toast({ title: activate ? "Sucursal activada" : "Borrador guardado" });
      } else if (id) {
        await update.mutateAsync({ id, data: payload });
        if (form.primaryUserId) {
          try {
            await assign.mutateAsync({
              id,
              data: { userId: form.primaryUserId, role: "branch_manager", isPrimary: true },
            });
          } catch {
            /* may already exist — hub can update */
          }
        }
        toast({ title: "Sucursal actualizada" });
      }
      await qc.invalidateQueries({ queryKey: getListAdminBranchesQueryKey() });
      if (id) await qc.invalidateQueries({ queryKey: getGetAdminBranchQueryKey(id) });
      if (id) setLocation(`/admin/sucursales/${id}`);
    } catch (err: any) {
      toast({ title: err?.payload?.error || err?.message || "Error al guardar", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  function field(label: string, children: ReactNode, hint?: string) {
    return (
      <label className="block space-y-1.5 text-sm">
        <span className="font-medium">{label}</span>
        {children}
        {hint && <span className="text-xs text-muted-foreground block">{hint}</span>}
      </label>
    );
  }

  return (
    <AdminLayout>
      <div className="p-6 md:p-10 space-y-6 overflow-auto max-w-4xl">
        <div className="flex items-center justify-between gap-4">
          <div>
            <Link href="/admin/sucursales" className="text-sm text-muted-foreground hover:text-foreground">
              ← Sucursales
            </Link>
            <h1 className="text-3xl font-serif font-bold mt-1">
              {isNew ? "Nueva sucursal" : `Editar · ${form.name || "Sucursal"}`}
            </h1>
          </div>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-2">
          {STEPS.map((label, i) => (
            <button
              key={label}
              type="button"
              onClick={() => setStep(i)}
              className={cn(
                "shrink-0 rounded-full px-3 py-1.5 text-xs font-medium border",
                step === i ? "bg-foreground text-background" : "bg-background text-muted-foreground",
              )}
            >
              {i + 1}. {label}
            </button>
          ))}
        </div>

        <div className="rounded-xl border bg-card p-5 space-y-4">
          {step === 0 && (
            <>
              {field("Nombre *", <Input value={form.name || ""} onChange={(e) => set("name", e.target.value)} placeholder="Mallorca Polanco" />)}
              {field("Nombre corto", <Input value={form.shortName || ""} onChange={(e) => set("shortName", e.target.value)} placeholder="Polanco" />)}
              {field(
                "Código de sucursal *",
                <Input
                  value={form.branchCode || ""}
                  onChange={(e) => {
                    if (!isNew && form.branchCode) setCodeWarning(true);
                    set("branchCode", e.target.value.toUpperCase());
                  }}
                  placeholder="POL"
                />,
                codeWarning ? "Advertencia: cambiar el código afecta imports, reportes e integraciones." : "Único. Usado en imports y reportes.",
              )}
              {field("Slug", <Input value={form.slug || ""} onChange={(e) => set("slug", e.target.value)} placeholder="polanco" />)}
              {field("Descripción corta", <Input value={form.shortDescription || ""} onChange={(e) => set("shortDescription", e.target.value)} />)}
              {field("Descripción completa", <Textarea value={form.description || ""} onChange={(e) => set("description", e.target.value)} rows={4} />)}
              <div className="grid sm:grid-cols-2 gap-3">
                {field(
                  "Estado",
                  <select
                    className="w-full h-10 rounded-md border px-3 bg-background"
                    value={form.status || "inactive"}
                    onChange={(e) => set("status", e.target.value as FormState["status"])}
                  >
                    <option value="active">Activa</option>
                    <option value="inactive">Inactiva</option>
                    <option value="archived">Archivada</option>
                  </select>,
                )}
                <label className="flex items-center gap-2 text-sm mt-6">
                  <Checkbox checked={!!form.featured} onCheckedChange={(v) => set("featured", !!v)} />
                  Sucursal destacada
                </label>
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <div className="grid sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">{field("Calle *", <Input value={form.street || ""} onChange={(e) => set("street", e.target.value)} />)}</div>
                {field("Núm. exterior *", <Input value={form.externalNumber || ""} onChange={(e) => set("externalNumber", e.target.value)} />)}
              </div>
              <div className="grid sm:grid-cols-3 gap-3">
                {field("Núm. interior", <Input value={form.internalNumber || ""} onChange={(e) => set("internalNumber", e.target.value)} />)}
                {field("Colonia *", <Input value={form.neighborhood || ""} onChange={(e) => set("neighborhood", e.target.value)} />)}
                {field("Alcaldía / Municipio", <Input value={form.borough || ""} onChange={(e) => set("borough", e.target.value)} />)}
              </div>
              <div className="grid sm:grid-cols-3 gap-3">
                {field("Ciudad *", <Input value={form.city || ""} onChange={(e) => set("city", e.target.value)} />)}
                {field("Estado *", <Input value={form.state || ""} onChange={(e) => set("state", e.target.value)} />)}
                {field("C.P. *", <Input value={form.postalCode || ""} onChange={(e) => set("postalCode", e.target.value)} />)}
              </div>
              {field("País *", <Input value={form.country || ""} onChange={(e) => set("country", e.target.value)} />)}
              <div className="grid sm:grid-cols-3 gap-3">
                {field("Latitud", <Input type="number" value={form.latitude ?? ""} onChange={(e) => set("latitude", e.target.value === "" ? null : Number(e.target.value))} />)}
                {field("Longitud", <Input type="number" value={form.longitude ?? ""} onChange={(e) => set("longitude", e.target.value === "" ? null : Number(e.target.value))} />)}
                {field("Place ID", <Input value={form.placeId || ""} onChange={(e) => set("placeId", e.target.value)} />)}
              </div>
              {field(
                "Google Maps URL",
                <div className="flex gap-2">
                  <Input value={form.mapsUrl || ""} onChange={(e) => set("mapsUrl", e.target.value)} />
                  {form.mapsUrl && (
                    <Button type="button" variant="outline" asChild>
                      <a href={form.mapsUrl} target="_blank" rel="noreferrer">Abrir</a>
                    </Button>
                  )}
                </div>,
              )}
            </>
          )}

          {step === 2 && (
            <>
              <div className="grid sm:grid-cols-2 gap-3">
                {field("Teléfono principal *", <Input value={form.phone || ""} onChange={(e) => set("phone", e.target.value)} />)}
                {field("Teléfono secundario", <Input value={form.secondaryPhone || ""} onChange={(e) => set("secondaryPhone", e.target.value)} />)}
              </div>
              {field("WhatsApp (internacional)", <Input value={form.whatsapp || ""} onChange={(e) => set("whatsapp", e.target.value)} placeholder="+525512345678" />, "Se genera automáticamente el enlace wa.me")}
              {field("Mensaje predeterminado", <Input value={form.whatsappDefaultMessage || ""} onChange={(e) => set("whatsappDefaultMessage", e.target.value)} />)}
              {field("Correo general *", <Input type="email" value={form.email || ""} onChange={(e) => set("email", e.target.value)} />)}
              <div className="grid sm:grid-cols-3 gap-3">
                {field("Correo pedidos", <Input type="email" value={form.ordersEmail || ""} onChange={(e) => set("ordersEmail", e.target.value)} />)}
                {field("Correo reservaciones", <Input type="email" value={form.reservationsEmail || ""} onChange={(e) => set("reservationsEmail", e.target.value)} />)}
                {field("Correo administrativo", <Input type="email" value={form.adminEmail || ""} onChange={(e) => set("adminEmail", e.target.value)} />)}
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <div className="space-y-2">
                <p className="text-sm font-medium">Reservaciones</p>
                {(["opentable", "external", "none"] as const).map((p) => (
                  <label key={p} className="flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name="reservationProvider"
                      checked={form.reservationProvider === p}
                      onChange={() => set("reservationProvider", p)}
                    />
                    {p === "opentable" ? "OpenTable" : p === "external" ? "URL externa" : "Sin reservaciones"}
                  </label>
                ))}
              </div>
              {form.reservationProvider !== "none" && (
                <>
                  {field("URL de reservación", <Input value={form.reservationUrl || ""} onChange={(e) => set("reservationUrl", e.target.value)} />)}
                  {field("Texto CTA", <Input value={form.reservationCta || ""} onChange={(e) => set("reservationCta", e.target.value)} />)}
                </>
              )}
              {field("Instagram", <Input value={form.instagramUrl || ""} onChange={(e) => set("instagramUrl", e.target.value)} />)}
              <p className="text-xs text-muted-foreground">
                Más canales (Uber Eats, Rappi, etc.) se pueden añadir desde el hub en Configuración → Enlaces.
              </p>
            </>
          )}

          {step === 4 && (
            <div className="space-y-3">
              {(form.hours || defaultHours()).map((h, idx) => (
                <div key={h.day} className="grid grid-cols-[1fr_auto_auto_auto] gap-2 items-center">
                  <span className="text-sm font-medium">{h.label}</span>
                  <label className="flex items-center gap-1 text-xs">
                    <Checkbox
                      checked={h.closed}
                      onCheckedChange={(v) => {
                        const hours = [...(form.hours || defaultHours())];
                        hours[idx] = { ...hours[idx], closed: !!v };
                        set("hours", hours);
                      }}
                    />
                    Cerrado
                  </label>
                  <Input
                    type="time"
                    disabled={h.closed}
                    value={h.open}
                    onChange={(e) => {
                      const hours = [...(form.hours || defaultHours())];
                      hours[idx] = { ...hours[idx], open: e.target.value };
                      set("hours", hours);
                    }}
                    className="w-28"
                  />
                  <Input
                    type="time"
                    disabled={h.closed}
                    value={h.close}
                    onChange={(e) => {
                      const hours = [...(form.hours || defaultHours())];
                      hours[idx] = { ...hours[idx], close: e.target.value };
                      set("hours", hours);
                    }}
                    className="w-28"
                  />
                </div>
              ))}
            </div>
          )}

          {step === 5 && (
            <>
              {field("Foto principal / Hero (URL)", <Input value={form.imageUrl || ""} onChange={(e) => set("imageUrl", e.target.value)} />)}
              {field(
                "Galería (URLs, una por línea)",
                <Textarea
                  rows={5}
                  value={(form.gallery || []).join("\n")}
                  onChange={(e) =>
                    set(
                      "gallery",
                      e.target.value
                        .split("\n")
                        .map((s) => s.trim())
                        .filter(Boolean),
                    )
                  }
                />,
              )}
              <p className="text-xs text-muted-foreground">Desde el hub podrás reordenar, tipar (logo/card) y agregar alt text.</p>
            </>
          )}

          {step === 6 && (
            <>
              {field(
                "Responsable de sucursal",
                <select
                  className="w-full h-10 rounded-md border px-3 bg-background"
                  value={form.primaryUserId || ""}
                  onChange={(e) => set("primaryUserId", e.target.value)}
                >
                  <option value="">Buscar usuario…</option>
                  {(users.data || []).map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} · {u.role} · {u.email}
                    </option>
                  ))}
                </select>,
                "Se guarda como asignación real (no solo texto).",
              )}
            </>
          )}

          {step === 7 && (
            <>
              <div className="flex gap-6">
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={!!form.pickupAvailable} onCheckedChange={(v) => set("pickupAvailable", !!v)} />
                  Pickup habilitado
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={!!form.deliveryAvailable} onCheckedChange={(v) => set("deliveryAvailable", !!v)} />
                  Delivery habilitado
                </label>
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                {field("Tiempo mínimo prep. (min)", <Input type="number" value={form.preparationTimeMinutes ?? 30} onChange={(e) => set("preparationTimeMinutes", Number(e.target.value))} />)}
                {field("Intervalo de slots (min)", <Input type="number" value={form.pickupSlotIntervalMinutes ?? 30} onChange={(e) => set("pickupSlotIntervalMinutes", Number(e.target.value))} />)}
                {field("Capacidad por slot", <Input type="number" value={form.pickupSlotCapacity ?? 10} onChange={(e) => set("pickupSlotCapacity", Number(e.target.value))} />)}
                {field("Tiempo delivery (min)", <Input type="number" value={form.deliveryTimeMinutes ?? 60} onChange={(e) => set("deliveryTimeMinutes", Number(e.target.value))} />)}
                {field("Radio delivery (km)", <Input type="number" value={form.deliveryRadiusKm ?? ""} onChange={(e) => set("deliveryRadiusKm", e.target.value === "" ? null : Number(e.target.value))} />)}
                {field("Costo base delivery", <Input type="number" value={form.deliveryFee ?? 90} onChange={(e) => set("deliveryFee", Number(e.target.value))} />)}
                {field("Pedido mínimo", <Input type="number" value={form.minimumOrder ?? ""} onChange={(e) => set("minimumOrder", e.target.value === "" ? null : Number(e.target.value))} />)}
                {field("Entrega gratis desde", <Input type="number" value={form.freeDeliveryFrom ?? ""} onChange={(e) => set("freeDeliveryFrom", e.target.value === "" ? null : Number(e.target.value))} />)}
              </div>
            </>
          )}

          {step === 8 && (
            <>
              <p className="text-sm font-medium">Canales de notificación</p>
              <div className="flex flex-wrap gap-4 text-sm">
                <label className="flex items-center gap-2">
                  <Checkbox
                    checked={!!form.notificationPreferences?.inApp}
                    onCheckedChange={(v) =>
                      set("notificationPreferences", { ...form.notificationPreferences, inApp: !!v })
                    }
                  />
                  En el sistema
                </label>
                <label className="flex items-center gap-2">
                  <Checkbox
                    checked={!!form.notificationPreferences?.email}
                    onCheckedChange={(v) =>
                      set("notificationPreferences", { ...form.notificationPreferences, email: !!v })
                    }
                  />
                  Email
                </label>
                <label className="flex items-center gap-2">
                  <Checkbox
                    checked={!!form.notificationPreferences?.whatsapp}
                    onCheckedChange={(v) =>
                      set("notificationPreferences", { ...form.notificationPreferences, whatsapp: !!v })
                    }
                  />
                  WhatsApp (cola)
                </label>
              </div>
              <p className="text-sm font-medium pt-2">Tipos de alerta de inventario</p>
              <div className="flex flex-wrap gap-4 text-sm">
                <label className="flex items-center gap-2">
                  <Checkbox
                    checked={form.notificationPreferences?.lowStock !== false}
                    onCheckedChange={(v) =>
                      set("notificationPreferences", { ...form.notificationPreferences, lowStock: !!v })
                    }
                  />
                  Stock bajo
                </label>
                <label className="flex items-center gap-2">
                  <Checkbox
                    checked={form.notificationPreferences?.criticalStock !== false}
                    onCheckedChange={(v) =>
                      set("notificationPreferences", {
                        ...form.notificationPreferences,
                        criticalStock: !!v,
                      })
                    }
                  />
                  Crítico
                </label>
                <label className="flex items-center gap-2">
                  <Checkbox
                    checked={form.notificationPreferences?.outOfStock !== false}
                    onCheckedChange={(v) =>
                      set("notificationPreferences", { ...form.notificationPreferences, outOfStock: !!v })
                    }
                  />
                  Agotado
                </label>
              </div>
              <p className="text-xs text-muted-foreground">
                WhatsApp se encola como pendiente; el envío outbound aún no está conectado.
              </p>
              <div className="grid gap-3 pt-2">
                {field("SEO title", <Input value={form.seoTitle || ""} onChange={(e) => set("seoTitle", e.target.value)} />)}
                {field("Meta description", <Textarea value={form.metaDescription || ""} onChange={(e) => set("metaDescription", e.target.value)} rows={3} />)}
                {field("OG image URL", <Input value={form.ogImageUrl || ""} onChange={(e) => set("ogImageUrl", e.target.value)} />)}
              </div>
            </>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button type="button" variant="outline" disabled={step === 0} onClick={() => setStep((s) => s - 1)}>
            Anterior
          </Button>
          <div className="flex gap-2">
            {step < STEPS.length - 1 && (
              <Button type="button" variant="secondary" onClick={() => setStep((s) => s + 1)}>
                Siguiente
              </Button>
            )}
            <Button type="button" variant="outline" disabled={saving} onClick={() => void persist(false)}>
              Guardar borrador
            </Button>
            <Button type="button" disabled={saving || !canActivate} onClick={() => void persist(true)}>
              Activar sucursal
            </Button>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
