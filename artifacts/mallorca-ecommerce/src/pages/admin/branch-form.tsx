import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useLocation, useParams } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useCreateAdminBranch,
  useGetAdminBranch,
  useUpdateAdminBranch,
  useListAdminUsers,
  useCreateBranchAssignment,
  useUpdateBranchAssignment,
  getListAdminBranchesQueryKey,
  getGetAdminBranchQueryKey,
  getListBranchAssignmentsQueryKey,
  type BranchHour,
  type BranchCreate,
  type BranchUpdate,
} from "@workspace/api-client-react";
import { AdminLayout } from "@/components/layout/admin-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { getImageUrl } from "@/lib/image-url";
import {
  assetsFromPaths,
  nextImageId,
  uploadImageFile,
  validateImageFiles,
  type ImageAsset,
} from "@/lib/image-upload";
import { Loader2, Trash2, Upload, ExternalLink, Eye, ChevronDown, Copy } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

const SECTIONS = [
  { id: "identidad", label: "Identidad" },
  { id: "ubicacion", label: "Ubicación y contacto" },
  { id: "horarios", label: "Horarios y canales" },
  { id: "operacion", label: "Operación" },
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

function hydrateFormFromBranch(b: Record<string, any>, primaryUserId = ""): FormState {
  const street =
    b.street ||
    // Legacy rows sometimes only have a flat `address` — seed the street input so
    // the user sees and can edit what the list currently shows.
    (!b.externalNumber && !b.neighborhood ? b.address : "") ||
    "";
  return {
    ...emptyForm(),
    ...b,
    street,
    externalNumber: b.externalNumber ?? "",
    internalNumber: b.internalNumber ?? "",
    neighborhood: b.neighborhood ?? "",
    borough: b.borough ?? "",
    city: b.city ?? emptyForm().city,
    state: b.state ?? emptyForm().state,
    postalCode: b.postalCode ?? "",
    country: b.country ?? emptyForm().country,
    // Do not keep a stale derived address in form state; rebuild on persist.
    address: "",
    // Empty hours array = all closed (don't re-open with defaultHours).
    // Missing hours = new/legacy branch → open defaults.
    hours: (Array.isArray(b.hours)
      ? b.hours.length
        ? b.hours
        : defaultHours().map((h) => ({ ...h, closed: true }))
      : defaultHours()) as BranchHour[],
    gallery: b.gallery ?? [],
    links: b.links ?? [],
    images: b.images ?? [],
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
    primaryUserId,
    whatsappDefaultMessage:
      b.whatsappDefaultMessage || (b.name ? `Hola, quiero información de ${b.name}.` : ""),
  };
}

function buildAddressFromForm(form: {
  street?: string | null;
  externalNumber?: string | null;
  internalNumber?: string | null;
  neighborhood?: string | null;
  borough?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  country?: string | null;
}): string {
  const line1 = [form.street, form.externalNumber, form.internalNumber ? `Int. ${form.internalNumber}` : null]
    .filter(Boolean)
    .join(" ");
  const rest = [
    form.neighborhood,
    form.borough,
    form.city,
    form.state,
    form.postalCode,
    form.country,
  ]
    .filter(Boolean)
    .join(", ");
  return [line1, rest].filter(Boolean).join(", ");
}

function fieldMismatches(
  sent: Record<string, unknown>,
  saved: Record<string, unknown>,
): string[] {
  const norm = (value: unknown) => {
    if (value === undefined || value === "") return null;
    return value;
  };
  const keys: Array<{ key: string; label: string }> = [
    { key: "name", label: "nombre" },
    { key: "branchCode", label: "código" },
    { key: "phone", label: "teléfono" },
    { key: "email", label: "correo" },
    { key: "slug", label: "slug" },
    { key: "status", label: "estado" },
    { key: "imageUrl", label: "imagen principal" },
    { key: "street", label: "calle" },
    { key: "externalNumber", label: "número exterior" },
    { key: "neighborhood", label: "colonia" },
    { key: "borough", label: "alcaldía" },
    { key: "city", label: "ciudad" },
    { key: "state", label: "estado" },
    { key: "postalCode", label: "código postal" },
    { key: "country", label: "país" },
    { key: "whatsapp", label: "whatsapp" },
    { key: "mapsUrl", label: "maps" },
    { key: "openTableUrl", label: "OpenTable" },
    { key: "instagramUrl", label: "Instagram" },
    { key: "preparationTimeMinutes", label: "tiempo preparación" },
    { key: "deliveryFee", label: "costo entrega" },
    { key: "pickupSlotCapacity", label: "capacidad slots" },
  ];
  const mismatches: string[] = [];
  for (const { key, label } of keys) {
    if (String(norm(sent[key])) !== String(norm(saved[key]))) mismatches.push(label);
  }
  const sentGallery = Array.isArray(sent.gallery) ? sent.gallery : [];
  const savedGallery = Array.isArray(saved.gallery) ? saved.gallery : [];
  if (JSON.stringify(sentGallery) !== JSON.stringify(savedGallery)) mismatches.push("galería");
  return mismatches;
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
  const updateAssign = useUpdateBranchAssignment();

  const [section, setSection] = useState(0);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [codeWarning, setCodeWarning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [imageAssets, setImageAssets] = useState<ImageAsset[]>([]);
  const [uploading, setUploading] = useState(false);
  const [showAdvancedIdentity, setShowAdvancedIdentity] = useState(false);
  const [showAdvancedLocation, setShowAdvancedLocation] = useState(false);
  const [showAdvancedOps, setShowAdvancedOps] = useState(false);
  const [channelEnabled, setChannelEnabled] = useState({
    openTable: false,
    external: false,
    instagram: false,
  });
  const skipImageSync = useRef(false);
  const shortNameTouched = useRef(false);
  const slugTouched = useRef(false);

  useEffect(() => {
    if (!existing.data?.branch) return;
    const b = existing.data.branch as Record<string, any>;
    const team = (existing.data as { team?: Array<{ isPrimary?: boolean; userId?: string; user?: { id?: string } }> }).team;
    const primaryFromTeam =
      team?.find((t) => t.isPrimary)?.user?.id ||
      team?.find((t) => t.isPrimary)?.userId ||
      "";
    skipImageSync.current = true;
    shortNameTouched.current = true;
    slugTouched.current = true;
    setForm(
      hydrateFormFromBranch(
        b,
        primaryFromTeam || (b as { primaryResponsible?: { userId?: string } }).primaryResponsible?.userId || "",
      ),
    );
    setImageAssets(assetsFromPaths(b.imageUrl, b.gallery ?? []));
    setChannelEnabled({
      openTable: Boolean(b.openTableUrl) || b.reservationProvider === "opentable",
      external: Boolean(b.reservationUrl) || b.reservationProvider === "external",
      instagram: Boolean(b.instagramUrl),
    });
  }, [existing.data]);

  useEffect(() => {
    if (skipImageSync.current) {
      skipImageSync.current = false;
      return;
    }
    const uploaded = imageAssets.filter((asset) => asset.status === "uploaded" && asset.path);
    setForm((prev) => ({
      ...prev,
      imageUrl: uploaded[0]?.path || "",
      gallery: uploaded.slice(1).map((asset) => asset.path!),
    }));
  }, [imageAssets]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  function slugifyLocal(input: string) {
    return input
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 64);
  }

  function onNameChange(value: string) {
    setForm((prev) => {
      const next = { ...prev, name: value };
      if (!shortNameTouched.current) {
        next.shortName = value.split(" ").filter(Boolean).slice(-1)[0] || value;
      }
      if (!slugTouched.current) {
        next.slug = slugifyLocal(value);
      }
      return next;
    });
  }

  function updateHour(idx: number, patch: Partial<BranchHour>) {
    const hours = [...(form.hours || defaultHours())];
    hours[idx] = { ...hours[idx], ...patch };
    set("hours", hours);
  }

  function applyHoursToWeekdays() {
    const hours = [...(form.hours || defaultHours())];
    const monday = hours.find((h) => h.day === "monday") || hours[0];
    const weekdays = new Set(["monday", "tuesday", "wednesday", "thursday", "friday"]);
    set(
      "hours",
      hours.map((h) =>
        weekdays.has(h.day)
          ? { ...h, open: monday.open, close: monday.close, closed: monday.closed }
          : h,
      ),
    );
  }

  function applyHoursToAll() {
    const hours = [...(form.hours || defaultHours())];
    const monday = hours.find((h) => h.day === "monday") || hours[0];
    set(
      "hours",
      hours.map((h) => ({
        ...h,
        open: monday.open,
        close: monday.close,
        closed: monday.closed,
      })),
    );
  }

  const canActivate = useMemo(() => {
    return !!(
      form.name &&
      form.branchCode &&
      form.street &&
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
    if (!form.street) {
      toast({ title: "Completa la calle de la dirección", variant: "destructive" });
      return;
    }
    setSaving(true);

    const uploaded = imageAssets.filter((asset) => asset.status === "uploaded" && asset.path);
    const imageUrl = uploaded[0]?.path || form.imageUrl || null;
    const gallery = uploaded.length
      ? uploaded.slice(1).map((asset) => asset.path!)
      : form.gallery || [];

    const {
      primaryUserId,
      address: _staleAddress,
      links: _omitLinks,
      images: _omitImages,
      specialHours: _omitSpecialHours,
      ...branchFields
    } = form as FormState & { specialHours?: unknown };
    const derivedAddress = buildAddressFromForm(form);
    const payload: BranchCreate | BranchUpdate = {
      ...branchFields,
      imageUrl,
      gallery,
      status: activate ? "active" : form.status || "inactive",
      shortName: form.shortName || form.name.split(" ").slice(-1)[0],
      slug: form.slug || undefined,
      branchCode: form.branchCode?.toUpperCase(),
      whatsappDefaultMessage:
        form.whatsappDefaultMessage ||
        (form.name ? `Hola, quiero información de ${form.name}.` : undefined),
      // Structured address is source of truth; `address` is always derived.
      street: form.street || null,
      externalNumber: form.externalNumber || null,
      internalNumber: form.internalNumber || null,
      neighborhood: form.neighborhood || "",
      borough: form.borough || null,
      city: form.city || "Ciudad de México",
      state: form.state || "CDMX",
      postalCode: form.postalCode || "",
      country: form.country || "México",
      address: derivedAddress,
      mapsUrl: form.mapsUrl || "https://maps.google.com",
      // Channels are independent — multiple can be set at once.
      openTableUrl: channelEnabled.openTable ? form.openTableUrl || null : null,
      reservationUrl: channelEnabled.external ? form.reservationUrl || null : null,
      reservationCta: channelEnabled.external
        ? form.reservationCta || "Reservar mesa"
        : form.reservationCta || null,
      instagramUrl: channelEnabled.instagram ? form.instagramUrl || null : null,
      reservationProvider: channelEnabled.openTable && form.openTableUrl
        ? "opentable"
        : channelEnabled.external && form.reservationUrl
          ? "external"
          : "none",
    };

    async function ensurePrimaryAssignment(targetId: number, userId: string) {
      try {
        await assign.mutateAsync({
          id: targetId,
          data: { userId, role: "branch_manager", isPrimary: true },
        });
      } catch (err: unknown) {
        const httpStatus = (err as { status?: number })?.status;
        if (httpStatus === 409) {
          await updateAssign.mutateAsync({
            id: targetId,
            data: { userId, role: "branch_manager", isPrimary: true },
          });
          return;
        }
        throw err;
      }
    }

    try {
      let id = branchId;
      let savedBranch: Record<string, unknown> | null = null;

      if (isNew) {
        const created = await create.mutateAsync({ data: payload as BranchCreate });
        id = created.id;
        savedBranch = created as unknown as Record<string, unknown>;
        if (primaryUserId && id) {
          await ensurePrimaryAssignment(id, primaryUserId);
        }
      } else if (id) {
        const updated = await update.mutateAsync({ id, data: payload });
        savedBranch = updated as unknown as Record<string, unknown>;
        if (primaryUserId) {
          try {
            await ensurePrimaryAssignment(id, primaryUserId);
          } catch (err: unknown) {
            const msg =
              (err as { payload?: { error?: string }; message?: string })?.payload?.error ||
              (err as { message?: string })?.message ||
              "No se pudo asignar el responsable";
            toast({ title: msg, variant: "destructive" });
          }
        }
      }

      await qc.invalidateQueries({ queryKey: getListAdminBranchesQueryKey() });
      if (id) {
        await qc.invalidateQueries({ queryKey: getGetAdminBranchQueryKey(id) });
        await qc.invalidateQueries({ queryKey: getListBranchAssignmentsQueryKey(id) });
      }

      const mismatches = savedBranch
        ? fieldMismatches(payload as Record<string, unknown>, savedBranch)
        : [];

      if (mismatches.length) {
        toast({
          title: "Guardado con discrepancias",
          description: `Revisa: ${mismatches.join(", ")}`,
          variant: "destructive",
        });
      } else {
        toast({
          title: activate
            ? "Sucursal activada"
            : isNew
              ? "Borrador guardado"
              : "Cambios guardados",
          description: "Los campos se actualizaron correctamente.",
        });
      }

      // Stay on the form: new → edit URL; edit → same screen (refetch rehydrates).
      if (isNew && id) {
        setLocation(`/admin/sucursales/${id}/editar`);
      } else if (savedBranch) {
        skipImageSync.current = true;
        setForm(hydrateFormFromBranch(savedBranch, primaryUserId || ""));
        setImageAssets(
          assetsFromPaths(
            (savedBranch.imageUrl as string) || null,
            (savedBranch.gallery as string[]) || [],
          ),
        );
      }
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

  function advancedBlock(
    open: boolean,
    onOpenChange: (v: boolean) => void,
    title: string,
    children: ReactNode,
  ) {
    return (
      <Collapsible open={open} onOpenChange={onOpenChange}>
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex w-full items-center justify-between rounded-lg border bg-muted/30 px-3 py-2 text-sm font-medium hover:bg-muted/50"
          >
            {title}
            <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-3 space-y-3">{children}</CollapsibleContent>
      </Collapsible>
    );
  }

  async function handleImageFiles(files: FileList | File[]) {
    const { accepted, rejected } = validateImageFiles([...files]);
    if (rejected.length) {
      toast({
        title: "Algunas imágenes no se aceptaron",
        description: rejected.join(" · "),
        variant: "destructive",
      });
    }
    if (!accepted.length) return;

    const pending: ImageAsset[] = accepted.map((file) => ({
      id: nextImageId(),
      file,
      previewUrl: URL.createObjectURL(file),
      fileName: file.name,
      status: "uploading",
      progress: 0,
    }));
    setImageAssets((current) => [...current, ...pending]);
    setUploading(true);
    try {
      for (const asset of pending) {
        try {
          const path = await uploadImageFile(asset.file!);
          setImageAssets((current) =>
            current.map((item) =>
              item.id === asset.id
                ? {
                    ...item,
                    path,
                    previewUrl: getImageUrl(path) || asset.previewUrl,
                    status: "uploaded",
                    progress: 100,
                  }
                : item,
            ),
          );
        } catch (error) {
          setImageAssets((current) =>
            current.map((item) =>
              item.id === asset.id
                ? {
                    ...item,
                    status: "error",
                    error: error instanceof Error ? error.message : "Error al subir",
                  }
                : item,
            ),
          );
          toast({
            title: `No se pudo subir ${asset.fileName}`,
            variant: "destructive",
          });
        }
      }
    } finally {
      setUploading(false);
    }
  }

  function removeImage(id: string) {
    setImageAssets((current) => {
      const target = current.find((item) => item.id === id);
      if (target?.previewUrl?.startsWith("blob:")) URL.revokeObjectURL(target.previewUrl);
      return current.filter((item) => item.id !== id);
    });
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
          <div className="flex flex-wrap items-center gap-2">
            {!isNew && form.slug ? (
              <Button type="button" variant="outline" asChild>
                <a href={`/sucursales/${form.slug}`} target="_blank" rel="noreferrer">
                  <Eye className="mr-2 h-4 w-4" />
                  Previsualizar
                  <ExternalLink className="ml-1.5 h-3.5 w-3.5 opacity-60" />
                </a>
              </Button>
            ) : null}
            {!isNew ? (
              <Button type="button" variant="ghost" asChild>
                <Link href={`/admin/sucursales/${branchId}`}>Ver operación</Link>
              </Button>
            ) : null}
          </div>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1">
          {SECTIONS.map((item, i) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setSection(i)}
              className={cn(
                "shrink-0 rounded-full px-3 py-1.5 text-xs font-medium border transition-colors",
                section === i ? "bg-foreground text-background" : "bg-background text-muted-foreground hover:text-foreground",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="rounded-xl border bg-card p-5 space-y-4">
          {section === 0 && (
            <>
              {field(
                "Nombre *",
                <Input value={form.name || ""} onChange={(e) => onNameChange(e.target.value)} placeholder="Mallorca Polanco" />,
              )}
              <div className="grid sm:grid-cols-2 gap-3">
                {field(
                  "Nombre corto",
                  <Input
                    value={form.shortName || ""}
                    onChange={(e) => {
                      shortNameTouched.current = true;
                      set("shortName", e.target.value);
                    }}
                    placeholder="Polanco"
                  />,
                )}
                {field(
                  "Código *",
                  <Input
                    value={form.branchCode || ""}
                    onChange={(e) => {
                      if (!isNew && form.branchCode) setCodeWarning(true);
                      set("branchCode", e.target.value.toUpperCase());
                    }}
                    placeholder="POL"
                  />,
                  codeWarning ? "Cambiar el código afecta imports y reportes." : "Único en imports y reportes.",
                )}
              </div>
              <div className="grid sm:grid-cols-2 gap-3 items-end">
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
                <label className="flex items-center gap-2 text-sm h-10">
                  <Checkbox checked={!!form.featured} onCheckedChange={(v) => set("featured", !!v)} />
                  Destacada en storefront
                </label>
              </div>
              {advancedBlock(showAdvancedIdentity, setShowAdvancedIdentity, "Slug, descripción y SEO", (
                <>
                  {field(
                    "Slug",
                    <Input
                      value={form.slug || ""}
                      onChange={(e) => {
                        slugTouched.current = true;
                        set("slug", e.target.value);
                      }}
                      placeholder="polanco"
                    />,
                  )}
                  {field("Descripción corta", <Input value={form.shortDescription || ""} onChange={(e) => set("shortDescription", e.target.value)} />)}
                  {field("Descripción completa", <Textarea value={form.description || ""} onChange={(e) => set("description", e.target.value)} rows={3} />)}
                  {field("SEO title", <Input value={form.seoTitle || ""} onChange={(e) => set("seoTitle", e.target.value)} />)}
                  {field("Meta description", <Textarea value={form.metaDescription || ""} onChange={(e) => set("metaDescription", e.target.value)} rows={2} />)}
                  {field("OG image URL", <Input value={form.ogImageUrl || ""} onChange={(e) => set("ogImageUrl", e.target.value)} />)}
                </>
              ))}
            </>
          )}

          {section === 1 && (
            <>
              <div className="grid sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">{field("Calle *", <Input value={form.street || ""} onChange={(e) => set("street", e.target.value)} />)}</div>
                {field("Núm. exterior", <Input value={form.externalNumber || ""} onChange={(e) => set("externalNumber", e.target.value)} />)}
              </div>
              <div className="grid sm:grid-cols-3 gap-3">
                {field("Colonia", <Input value={form.neighborhood || ""} onChange={(e) => set("neighborhood", e.target.value)} />)}
                {field("C.P.", <Input value={form.postalCode || ""} onChange={(e) => set("postalCode", e.target.value)} />)}
                {field("Alcaldía", <Input value={form.borough || ""} onChange={(e) => set("borough", e.target.value)} />)}
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                {field("Teléfono *", <Input value={form.phone || ""} onChange={(e) => set("phone", e.target.value)} />)}
                {field("WhatsApp", <Input value={form.whatsapp || ""} onChange={(e) => set("whatsapp", e.target.value)} placeholder="+525512345678" />)}
              </div>
              {field("Correo *", <Input type="email" value={form.email || ""} onChange={(e) => set("email", e.target.value)} />)}
              {advancedBlock(showAdvancedLocation, setShowAdvancedLocation, "Más dirección, correos y mapas", (
                <>
                  <div className="grid sm:grid-cols-3 gap-3">
                    {field("Núm. interior", <Input value={form.internalNumber || ""} onChange={(e) => set("internalNumber", e.target.value)} />)}
                    {field("Ciudad", <Input value={form.city || ""} onChange={(e) => set("city", e.target.value)} />)}
                    {field("Estado", <Input value={form.state || ""} onChange={(e) => set("state", e.target.value)} />)}
                  </div>
                  {field("País", <Input value={form.country || ""} onChange={(e) => set("country", e.target.value)} />)}
                  <div className="grid sm:grid-cols-2 gap-3">
                    {field("Tel. secundario", <Input value={form.secondaryPhone || ""} onChange={(e) => set("secondaryPhone", e.target.value)} />)}
                    {field("Mensaje WhatsApp", <Input value={form.whatsappDefaultMessage || ""} onChange={(e) => set("whatsappDefaultMessage", e.target.value)} />)}
                  </div>
                  <div className="grid sm:grid-cols-3 gap-3">
                    {field("Correo pedidos", <Input type="email" value={form.ordersEmail || ""} onChange={(e) => set("ordersEmail", e.target.value)} />)}
                    {field("Correo reservaciones", <Input type="email" value={form.reservationsEmail || ""} onChange={(e) => set("reservationsEmail", e.target.value)} />)}
                    {field("Correo admin", <Input type="email" value={form.adminEmail || ""} onChange={(e) => set("adminEmail", e.target.value)} />)}
                  </div>
                  <div className="grid sm:grid-cols-3 gap-3">
                    {field("Latitud", <Input type="number" value={form.latitude ?? ""} onChange={(e) => set("latitude", e.target.value === "" ? null : Number(e.target.value))} />)}
                    {field("Longitud", <Input type="number" value={form.longitude ?? ""} onChange={(e) => set("longitude", e.target.value === "" ? null : Number(e.target.value))} />)}
                    {field("Place ID", <Input value={form.placeId || ""} onChange={(e) => set("placeId", e.target.value)} />)}
                  </div>
                  {field(
                    "Google Maps URL",
                    <div className="flex gap-2">
                      <Input value={form.mapsUrl || ""} onChange={(e) => set("mapsUrl", e.target.value)} />
                      {form.mapsUrl ? (
                        <Button type="button" variant="outline" asChild>
                          <a href={form.mapsUrl} target="_blank" rel="noreferrer">Abrir</a>
                        </Button>
                      ) : null}
                    </div>,
                  )}
                </>
              ))}
            </>
          )}

          {section === 2 && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium">Horario semanal</p>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" size="sm" variant="outline" onClick={applyHoursToWeekdays}>
                    <Copy className="mr-1.5 h-3.5 w-3.5" />
                    Lun → vie
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={applyHoursToAll}>
                    Aplicar a toda la semana
                  </Button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground -mt-2">
                Ajusta el lunes y replica con un clic.
              </p>
              <div className="space-y-2">
                {(form.hours || defaultHours()).map((h, idx) => (
                  <div key={h.day} className="grid grid-cols-[4.5rem_auto_1fr_1fr] gap-2 items-center">
                    <span className="text-sm font-medium truncate">{h.label}</span>
                    <label className="flex items-center gap-1.5 text-xs whitespace-nowrap">
                      <Checkbox
                        checked={h.closed}
                        onCheckedChange={(v) => updateHour(idx, { closed: !!v })}
                      />
                      Cerrado
                    </label>
                    <Input
                      type="time"
                      disabled={h.closed}
                      value={h.open}
                      onChange={(e) => updateHour(idx, { open: e.target.value })}
                    />
                    <Input
                      type="time"
                      disabled={h.closed}
                      value={h.close}
                      onChange={(e) => updateHour(idx, { close: e.target.value })}
                    />
                  </div>
                ))}
              </div>
              <div className="border-t pt-4 space-y-4">
                <div>
                  <p className="text-sm font-medium">Reservaciones y redes</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Puedes activar varias opciones a la vez.
                  </p>
                </div>

                <div className="space-y-3 rounded-lg border p-3">
                  <label className="flex items-center gap-2 text-sm font-medium">
                    <Checkbox
                      checked={channelEnabled.openTable}
                      onCheckedChange={(v) => {
                        const on = !!v;
                        setChannelEnabled((prev) => ({ ...prev, openTable: on }));
                        if (!on) set("openTableUrl", "");
                      }}
                    />
                    OpenTable
                  </label>
                  {channelEnabled.openTable &&
                    field(
                      "URL OpenTable",
                      <Input
                        value={form.openTableUrl || ""}
                        onChange={(e) => set("openTableUrl", e.target.value)}
                        placeholder="https://www.opentable.com/r/…"
                      />,
                    )}
                </div>

                <div className="space-y-3 rounded-lg border p-3">
                  <label className="flex items-center gap-2 text-sm font-medium">
                    <Checkbox
                      checked={channelEnabled.external}
                      onCheckedChange={(v) => {
                        const on = !!v;
                        setChannelEnabled((prev) => ({ ...prev, external: on }));
                        if (!on) {
                          set("reservationUrl", "");
                        } else if (!form.reservationCta) {
                          set("reservationCta", "Reservar mesa");
                        }
                      }}
                    />
                    URL externa de reservación
                  </label>
                  {channelEnabled.external && (
                    <div className="grid sm:grid-cols-2 gap-3">
                      {field(
                        "URL de reservación",
                        <Input
                          value={form.reservationUrl || ""}
                          onChange={(e) => set("reservationUrl", e.target.value)}
                          placeholder="https://…"
                        />,
                      )}
                      {field(
                        "Texto CTA",
                        <Input
                          value={form.reservationCta || ""}
                          onChange={(e) => set("reservationCta", e.target.value)}
                          placeholder="Reservar mesa"
                        />,
                      )}
                    </div>
                  )}
                </div>

                <div className="space-y-3 rounded-lg border p-3">
                  <label className="flex items-center gap-2 text-sm font-medium">
                    <Checkbox
                      checked={channelEnabled.instagram}
                      onCheckedChange={(v) => {
                        const on = !!v;
                        setChannelEnabled((prev) => ({ ...prev, instagram: on }));
                        if (!on) set("instagramUrl", "");
                        else if (!form.instagramUrl) set("instagramUrl", "https://instagram.com/");
                      }}
                    />
                    Instagram
                  </label>
                  {channelEnabled.instagram &&
                    field(
                      "URL Instagram",
                      <Input
                        value={form.instagramUrl || ""}
                        onChange={(e) => set("instagramUrl", e.target.value)}
                        placeholder="https://instagram.com/…"
                      />,
                    )}
                </div>
              </div>
            </>
          )}

          {section === 3 && (
            <>
              <div className="flex flex-col gap-4 rounded-none border border-border p-4 text-sm max-w-xl">
                <p className="text-muted-foreground">
                  Enciende o apaga los métodos que esta sucursal ofrecerá al cliente.
                </p>
                <label className="flex items-center justify-between gap-4">
                  <span>
                    <span className="font-medium">Recolección (pickup)</span>
                    <span className="mt-0.5 block text-muted-foreground">Cliente puede recoger en sucursal</span>
                  </span>
                  <Switch
                    checked={!!form.pickupAvailable}
                    onCheckedChange={(v) => set("pickupAvailable", v)}
                  />
                </label>
                <label className="flex items-center justify-between gap-4 border-t border-border pt-4">
                  <span>
                    <span className="font-medium">Entrega a domicilio</span>
                    <span className="mt-0.5 block text-muted-foreground">Cliente puede pedir envío</span>
                  </span>
                  <Switch
                    checked={!!form.deliveryAvailable}
                    onCheckedChange={(v) => set("deliveryAvailable", v)}
                  />
                </label>
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                {field("Prep. (min)", <Input type="number" value={form.preparationTimeMinutes ?? 30} onChange={(e) => set("preparationTimeMinutes", Number(e.target.value))} />)}
                {field("Intervalo slots (min)", <Input type="number" value={form.pickupSlotIntervalMinutes ?? 30} onChange={(e) => set("pickupSlotIntervalMinutes", Number(e.target.value))} />)}
                {field("Capacidad / slot", <Input type="number" value={form.pickupSlotCapacity ?? 10} onChange={(e) => set("pickupSlotCapacity", Number(e.target.value))} />)}
                {field("Delivery (min)", <Input type="number" value={form.deliveryTimeMinutes ?? 60} onChange={(e) => set("deliveryTimeMinutes", Number(e.target.value))} />)}
                {field("Radio (km)", <Input type="number" value={form.deliveryRadiusKm ?? ""} onChange={(e) => set("deliveryRadiusKm", e.target.value === "" ? null : Number(e.target.value))} />)}
                {field("Costo delivery", <Input type="number" value={form.deliveryFee ?? 90} onChange={(e) => set("deliveryFee", Number(e.target.value))} />)}
                {field("Pedido mínimo", <Input type="number" value={form.minimumOrder ?? ""} onChange={(e) => set("minimumOrder", e.target.value === "" ? null : Number(e.target.value))} />)}
                {field("Gratis desde", <Input type="number" value={form.freeDeliveryFrom ?? ""} onChange={(e) => set("freeDeliveryFrom", e.target.value === "" ? null : Number(e.target.value))} />)}
              </div>

              {field(
                "Responsable",
                <select
                  className="w-full h-10 rounded-md border px-3 bg-background"
                  value={form.primaryUserId || ""}
                  onChange={(e) => set("primaryUserId", e.target.value)}
                >
                  <option value="">Sin asignar…</option>
                  {(users.data || []).map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} · {u.email}
                    </option>
                  ))}
                </select>,
              )}

              <div className="space-y-2 border-t pt-4">
                <p className="text-sm font-medium">Imágenes</p>
                <p className="text-xs text-muted-foreground">La primera es la foto principal.</p>
                <label
                  className={cn(
                    "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-muted-foreground/40 bg-muted/20 px-4 py-8 text-sm text-muted-foreground transition-colors hover:border-foreground/40 hover:bg-muted/40",
                    uploading && "pointer-events-none opacity-60",
                  )}
                >
                  {uploading ? <Loader2 className="h-6 w-6 animate-spin" /> : <Upload className="h-6 w-6" />}
                  <span>{uploading ? "Subiendo…" : "Cargar imágenes"}</span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
                    multiple
                    className="hidden"
                    disabled={uploading}
                    onChange={(e) => {
                      if (e.target.files?.length) void handleImageFiles(e.target.files);
                      e.target.value = "";
                    }}
                  />
                </label>
                {imageAssets.length > 0 && (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {imageAssets.map((asset, index) => (
                      <div key={asset.id} className="relative overflow-hidden rounded-lg border bg-background">
                        <img src={asset.previewUrl} alt={asset.fileName} className="aspect-[4/3] w-full object-cover" />
                        <div className="flex items-center justify-between gap-2 p-2 text-[11px]">
                          <span className="truncate font-medium">{index === 0 ? "Principal" : `Galería ${index}`}</span>
                          <button
                            type="button"
                            aria-label="Eliminar imagen"
                            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive"
                            onClick={() => removeImage(asset.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        {asset.status === "uploading" && (
                          <div className="absolute inset-0 flex items-center justify-center bg-black/40 text-xs text-white">Subiendo…</div>
                        )}
                        {asset.status === "error" && (
                          <div className="absolute inset-x-0 bottom-0 bg-destructive/90 px-2 py-1 text-[10px] text-white">
                            {asset.error || "Error"}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {advancedBlock(showAdvancedOps, setShowAdvancedOps, "Notificaciones", (
                <>
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
                      WhatsApp
                    </label>
                  </div>
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
                </>
              ))}
            </>
          )}
        </div>

        <div className="sticky bottom-0 z-10 -mx-6 md:-mx-10 border-t bg-background/95 backdrop-blur px-6 md:px-10 py-3 flex flex-wrap items-center justify-between gap-3">
          <Button type="button" variant="outline" disabled={section === 0} onClick={() => setSection((s) => s - 1)}>
            Anterior
          </Button>
          <div className="flex gap-2">
            {section < SECTIONS.length - 1 && (
              <Button type="button" variant="secondary" onClick={() => setSection((s) => s + 1)}>
                Siguiente
              </Button>
            )}
            {isNew ? (
              <>
                <Button type="button" variant="outline" disabled={saving} onClick={() => void persist(false)}>
                  Guardar borrador
                </Button>
                <Button type="button" disabled={saving || !canActivate} onClick={() => void persist(true)}>
                  Activar sucursal
                </Button>
              </>
            ) : (
              <>
                <Button type="button" disabled={saving || uploading} onClick={() => void persist(false)}>
                  Guardar
                </Button>
                {form.status !== "active" && (
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={saving || !canActivate || uploading}
                    onClick={() => void persist(true)}
                  >
                    Activar
                  </Button>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
