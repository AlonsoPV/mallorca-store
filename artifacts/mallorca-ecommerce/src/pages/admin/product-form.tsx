import { useState, useEffect, useRef } from "react";
import { AdminLayout } from "@/components/layout/admin-layout";
import {
  getGetAdminSummaryQueryKey,
  getGetProductQueryKey,
  getListAdminProductsQueryKey,
  getListProductsQueryKey,
  useCreateProduct,
  useUpdateProduct,
  useGetProduct,
  useListCategories,
  useListAdminProducts,
  useListAdminBranches,
  useListProductPromotions,
  useUpdateProductPromotion,
  useCancelProductPromotion,
  getListProductPromotionsQueryKey,
  type ProductInput,
  type PromotionType,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useParams, Link, useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  ArrowLeft,
  Save,
  Loader2,
  Image as ImageIcon,
  Store,
  AlertCircle,
  Info,
  Upload,
  Trash2,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { getImageUrl } from "@/lib/image-url";
import { ImageWithFallback } from "@/components/image-with-fallback";

const formSchema = z.object({
  sku: z.string().min(1, "SKU es requerido"),
  name: z.string().min(1, "Nombre es requerido"),
  slug: z.string().min(1, "Slug es requerido"),
  shortDescription: z.string().min(1, "Descripción corta requerida"),
  description: z.string().min(1, "Descripción completa requerida"),
  price: z.coerce.number().min(0, "Precio debe ser mayor o igual a 0"),
  salePrice: z.coerce.number().nullable().optional(),
  categoryId: z.coerce.number().min(1, "Seleccione una categoría"),
  imageUrl: z.string().nullable().optional(),
  gallery: z.array(z.string()).default([]),
  featured: z.boolean().default(false),
  seasonal: z.boolean().default(false),
  status: z.enum(['draft', 'active', 'inactive']),
  minimumLeadTimeHours: z.coerce.number().min(0).default(0),
});

type FormValues = z.infer<typeof formSchema>;
type PromotionDraft = {
  name: string;
  type: PromotionType;
  value: number;
  startsAt: string;
  endsAt: string;
};

const DRAFT_STORAGE_KEY = "mallorca_product_draft";
const MAX_IMAGE_SIZE = 8 * 1024 * 1024;
const ACCEPTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"]);

function localDateTimeValue(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function initialPromotionDraft(): PromotionDraft {
  const start = new Date(Date.now() + 5 * 60_000);
  return {
    name: "",
    type: "percentage",
    value: 10,
    startsAt: localDateTimeValue(start),
    endsAt: localDateTimeValue(new Date(start.getTime() + 24 * 60 * 60_000)),
  };
}

type ImageAssetStatus = "uploaded" | "uploading" | "error";
type ImageAsset = {
  id: string;
  path?: string;
  previewUrl: string;
  file?: File;
  fileName: string;
  status: ImageAssetStatus;
  progress: number;
  error?: string;
};

export default function AdminProductForm() {
  const { id } = useParams<{ id?: string }>();
  const isEditing = !!id && id !== "nuevo";
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: categories } = useListCategories();
  const { data: branches } = useListAdminBranches();
  const [branchConfigurations, setBranchConfigurations] = useState<Record<number, any>>({});
  const [promotionEnabled, setPromotionEnabled] = useState(false);
  const [promotionAllBranches, setPromotionAllBranches] = useState(true);
  const [promotionDraft, setPromotionDraft] = useState<PromotionDraft>(initialPromotionDraft);
  const [editingPromotionId, setEditingPromotionId] = useState<number | null>(null);
  const [editingPromotionBranchIds, setEditingPromotionBranchIds] = useState<number[] | null>(null);

  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [pendingSubmitData, setPendingSubmitData] = useState<FormValues | null>(null);
  const [imageAssets, setImageAssets] = useState<ImageAsset[]>([]);
  const [isImageDropActive, setIsImageDropActive] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const imageId = useRef(0);

  const adminProductParams = {};
  const { data: adminProducts, isLoading: isLoadingList } = useListAdminProducts(
    adminProductParams,
    { query: { enabled: isEditing, queryKey: getListAdminProductsQueryKey(adminProductParams) } },
  );

  const existingProduct = isEditing ? adminProducts?.find(p => p.id === Number(id)) : undefined;
  const productSlug = existingProduct?.slug || "";

  const { data: productDetail, isLoading: isLoadingDetail } = useGetProduct(
    productSlug,
    undefined,
    { query: { enabled: !!existingProduct?.slug, queryKey: getGetProductQueryKey(productSlug) } },
  );
  const { data: promotionHistory } = useListProductPromotions(Number(id), {
    query: {
      enabled: isEditing && Boolean(id),
      queryKey: getListProductPromotionsQueryKey(Number(id)),
    },
  });

  const createMutation = useCreateProduct();
  const updateMutation = useUpdateProduct();
  const updatePromotionMutation = useUpdateProductPromotion();
  const cancelPromotionMutation = useCancelProductPromotion();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      sku: "",
      name: "",
      slug: "",
      shortDescription: "",
      description: "",
      price: 0,
      salePrice: null,
      categoryId: 0,
      imageUrl: "",
      gallery: [],
      featured: false,
      seasonal: false,
      status: "draft",
      minimumLeadTimeHours: 0,
    }
  });

  const nameValue = form.watch("name");
  const slugValue = form.watch("slug");
  const priceValue = form.watch("price");
  const salePriceValue = form.watch("salePrice");

  const nextImageId = () => {
    imageId.current += 1;
    return `product-image-${imageId.current}`;
  };

  const assetsFromPaths = (mainPath: string | null | undefined, gallery: string[] = []): ImageAsset[] => {
    return [mainPath, ...gallery]
      .filter((path): path is string => Boolean(path))
      .filter((path, index, paths) => paths.indexOf(path) === index)
      .map((path) => ({
        id: nextImageId(),
        path,
        previewUrl: getImageUrl(path) || path,
        fileName: path.split("/").pop() || "Imagen guardada",
        status: "uploaded" as const,
        progress: 100,
      }));
  };

  const syncImageFields = (assets: ImageAsset[]) => {
    const uploaded = assets.filter((asset) => asset.status === "uploaded" && asset.path);
    form.setValue("imageUrl", uploaded[0]?.path || null, { shouldDirty: true });
    form.setValue("gallery", uploaded.slice(1).map((asset) => asset.path!), { shouldDirty: true });
  };

  useEffect(() => {
    syncImageFields(imageAssets);
  }, [imageAssets]);

  const updateAsset = (id: string, update: Partial<ImageAsset>) => {
    setImageAssets((current) => current.map((asset) => asset.id === id ? { ...asset, ...update } : asset));
  };

  const uploadImage = async (asset: ImageAsset) => {
    if (!asset.file) return;
    updateAsset(asset.id, { status: "uploading", progress: 0, error: undefined });
    try {
      const response = await fetch("/api/storage/uploads/request-url", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: asset.file.name,
          size: asset.file.size,
          contentType: asset.file.type,
        }),
      });
      if (!response.ok) throw new Error("No se pudo preparar la subida.");
      const upload = await response.json() as { uploadURL?: string; objectPath?: string };
      if (!upload.uploadURL || !upload.objectPath) throw new Error("La respuesta de almacenamiento no es válida.");

      await new Promise<void>((resolve, reject) => {
        const request = new XMLHttpRequest();
        request.open("PUT", upload.uploadURL!, true);
        request.setRequestHeader("Content-Type", asset.file!.type);
        request.upload.onprogress = (event) => {
          if (event.lengthComputable) updateAsset(asset.id, { progress: Math.round((event.loaded / event.total) * 100) });
        };
        request.onload = () => request.status >= 200 && request.status < 300
          ? resolve()
          : reject(new Error("El almacenamiento rechazó la imagen."));
        request.onerror = () => reject(new Error("No se pudo completar la subida."));
        request.send(asset.file);
      });

      setImageAssets((current) => {
        return current.map((item) => item.id === asset.id
          ? { ...item, path: upload.objectPath, status: "uploaded" as const, progress: 100, error: undefined }
          : item);
      });
    } catch (error) {
      updateAsset(asset.id, {
        status: "error",
        progress: 0,
        error: error instanceof Error ? error.message : "No se pudo subir la imagen.",
      });
      toast({ title: "No se pudo subir una imagen", description: "El resto del formulario sigue intacto. Puedes reintentar o eliminar este archivo.", variant: "destructive" });
    }
  };

  const handleImageFiles = async (files: File[]) => {
    const accepted: ImageAsset[] = [];
    const rejected: string[] = [];
    for (const file of files) {
      if (!ACCEPTED_IMAGE_TYPES.has(file.type)) {
        rejected.push(`${file.name}: formato no compatible`);
        continue;
      }
      if (file.size > MAX_IMAGE_SIZE) {
        rejected.push(`${file.name}: supera 8 MB`);
        continue;
      }
      accepted.push({
        id: nextImageId(),
        file,
        previewUrl: URL.createObjectURL(file),
        fileName: file.name,
        status: "uploading",
        progress: 0,
      });
    }
    if (rejected.length) {
      toast({ title: "Algunas imágenes no se agregaron", description: rejected.join(". "), variant: "destructive" });
    }
    if (!accepted.length) return;
    setImageAssets((current) => [...current, ...accepted]);
    await Promise.all(accepted.map((asset) => uploadImage(asset)));
  };

  const removeImage = (id: string) => {
    setImageAssets((current) => {
      const removed = current.find((asset) => asset.id === id);
      if (removed?.previewUrl.startsWith("blob:")) URL.revokeObjectURL(removed.previewUrl);
      return current.filter((asset) => asset.id !== id);
    });
  };

  const moveImage = (index: number, direction: -1 | 1) => {
    setImageAssets((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  // Auto-generate slug
  useEffect(() => {
    if (!isEditing && nameValue && !slugValue) {
      form.setValue("slug", nameValue.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, ''));
    }
  }, [nameValue, isEditing, slugValue, form]);

  // Load from local storage for new product draft
  const initializedDraft = useRef(false);
  useEffect(() => {
    if (!isEditing && !initializedDraft.current) {
      const saved = localStorage.getItem(DRAFT_STORAGE_KEY);
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          form.reset(parsed.form);
            setImageAssets(assetsFromPaths(parsed.form?.imageUrl, parsed.form?.gallery));
          if (parsed.branches) setBranchConfigurations(parsed.branches);
          toast({ title: "Borrador recuperado", description: "Se han restaurado los datos guardados localmente." });
        } catch (e) {}
      }
      initializedDraft.current = true;
    }
  }, [isEditing, form, toast]);

  // Load from API for existing product
  const initialized = useRef(false);
  useEffect(() => {
    if (isEditing && productDetail && !initialized.current) {
      setBranchConfigurations(Object.fromEntries((productDetail.availability || []).map((availability) => [availability.branchId, {
        available: availability.available,
        inventory: availability.inventory,
        priceOverride: availability.price,
        pickupAvailable: availability.pickupAvailable,
        deliveryAvailable: availability.deliveryAvailable,
        preparationTimeMinutes: availability.preparationTimeMinutes,
      }])));
      form.reset({
        sku: productDetail.sku,
        name: productDetail.name,
        slug: productDetail.slug,
        shortDescription: productDetail.shortDescription,
        description: productDetail.description,
        price: productDetail.price,
        salePrice: productDetail.salePrice || null,
        categoryId: categories?.find(c => c.slug === productDetail.categorySlug)?.id || 0,
        imageUrl: productDetail.imageUrl || "",
        gallery: productDetail.gallery || [],
        featured: productDetail.featured,
        seasonal: productDetail.seasonal,
        status: (existingProduct as any)?.status || "draft",
        minimumLeadTimeHours: productDetail.minimumLeadTimeHours,
      });
      setImageAssets(assetsFromPaths(productDetail.imageUrl, productDetail.gallery));
      initialized.current = true;
    }
  }, [isEditing, productDetail, existingProduct, form, categories]);

  // LocalStorage Autosave
  const formValues = form.watch();
  useEffect(() => {
    if (isEditing || !initializedDraft.current) return;
    const timer = setTimeout(() => {
      localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({ form: formValues, branches: branchConfigurations }));
    }, 1000);
    return () => clearTimeout(timer);
  }, [formValues, branchConfigurations, isEditing]);

  const preSubmit = (data: FormValues) => {
    if (imageAssets.some((asset) => asset.status === "uploading")) {
      toast({ title: "Espera a que terminen las imágenes", description: "Puedes seguir editando el formulario mientras se completan las subidas." });
      return;
    }

    // Validation: At least one branch must be available if active
    if (data.status === 'active') {
      const isAvailableAnywhere = Object.values(branchConfigurations).some(c => c.available);
      if (!isAvailableAnywhere) {
        toast({ title: "Validación Fallida", description: "El producto debe estar disponible en al menos una sucursal para ser publicado.", variant: "destructive" });
        return;
      }
    }

    if (promotionEnabled) {
      if (!promotionDraft.name.trim() || !promotionDraft.startsAt || !promotionDraft.endsAt) {
        toast({ title: "Promoción incompleta", description: "Agrega un nombre y el horario de la promoción.", variant: "destructive" });
        return;
      }
      if (new Date(promotionDraft.endsAt) <= new Date(promotionDraft.startsAt)) {
        toast({ title: "Horario inválido", description: "La fecha final debe ser posterior a la fecha inicial.", variant: "destructive" });
        return;
      }
      if (promotionDraft.type === "percentage" && (promotionDraft.value < 0 || promotionDraft.value > 100)) {
        toast({ title: "Porcentaje inválido", description: "El porcentaje debe estar entre 0 y 100.", variant: "destructive" });
        return;
      }
      if (!promotionAllBranches && !Object.values(branchConfigurations).some((config) => config.available)) {
        toast({ title: "Alcance vacío", description: "Selecciona al menos una sucursal para esta promoción.", variant: "destructive" });
        return;
      }
    }

    setPendingSubmitData(data);
    setShowConfirmDialog(true);
  };

  const promotionBranchIds = editingPromotionId !== null
    ? editingPromotionBranchIds ?? []
    : promotionAllBranches
      ? []
      : Object.entries(branchConfigurations)
        .filter(([, config]) => config.available)
        .map(([branchId]) => Number(branchId));

  const validatePromotionDraft = () => {
    if (!promotionDraft.name.trim() || !promotionDraft.startsAt || !promotionDraft.endsAt) {
      toast({ title: "Promoción incompleta", description: "Agrega un nombre y el horario de la promoción.", variant: "destructive" });
      return false;
    }
    if (new Date(promotionDraft.endsAt) <= new Date(promotionDraft.startsAt)) {
      toast({ title: "Horario inválido", description: "La fecha final debe ser posterior a la fecha inicial.", variant: "destructive" });
      return false;
    }
    if (promotionDraft.type === "percentage" && (promotionDraft.value < 0 || promotionDraft.value > 100)) {
      toast({ title: "Porcentaje inválido", description: "El porcentaje debe estar entre 0 y 100.", variant: "destructive" });
      return false;
    }
    if (!promotionAllBranches && !promotionBranchIds.length) {
      toast({ title: "Alcance vacío", description: "Selecciona al menos una sucursal para esta promoción.", variant: "destructive" });
      return false;
    }
    return true;
  };

  const promotionPayload = () => ({
    name: promotionDraft.name.trim(),
    type: promotionDraft.type,
    value: promotionDraft.value,
    startsAt: new Date(promotionDraft.startsAt).toISOString(),
    endsAt: new Date(promotionDraft.endsAt).toISOString(),
    branchIds: promotionBranchIds,
  });

  const startEditingPromotion = (promotion: NonNullable<typeof promotionHistory>[number]) => {
    setEditingPromotionId(promotion.id);
    setEditingPromotionBranchIds(promotion.branchIds);
    setPromotionAllBranches(promotion.branchIds.length === 0);
    setPromotionDraft({
      name: promotion.name,
      type: promotion.type,
      value: promotion.value,
      startsAt: localDateTimeValue(new Date(promotion.startsAt)),
      endsAt: localDateTimeValue(new Date(promotion.endsAt)),
    });
    setPromotionEnabled(true);
  };

  const stopEditingPromotion = () => {
    setEditingPromotionId(null);
    setEditingPromotionBranchIds(null);
    setPromotionEnabled(false);
    setPromotionDraft(initialPromotionDraft());
  };

  const savePromotionEdit = () => {
    if (!editingPromotionId || !id || !validatePromotionDraft()) return;
    updatePromotionMutation.mutate(
      { id: Number(id), promotionId: editingPromotionId, data: promotionPayload() },
      {
        onSuccess: () => {
          void queryClient.invalidateQueries({ queryKey: getListProductPromotionsQueryKey(Number(id)) });
          void queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() });
          toast({ title: "Promoción actualizada", description: "La promoción programada conserva su registro histórico." });
          stopEditingPromotion();
        },
        onError: () => {
          toast({ title: "No se pudo actualizar la promoción", description: "Puede que ya haya comenzado o sido cancelada.", variant: "destructive" });
        },
      },
    );
  };

  const cancelPromotion = (promotionId: number) => {
    if (!id || !window.confirm("¿Cancelar esta promoción programada? La entrada permanecerá en el historial.")) return;
    cancelPromotionMutation.mutate(
      { id: Number(id), promotionId },
      {
        onSuccess: () => {
          void queryClient.invalidateQueries({ queryKey: getListProductPromotionsQueryKey(Number(id)) });
          void queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() });
          if (editingPromotionId === promotionId) stopEditingPromotion();
          toast({ title: "Promoción cancelada", description: "La promoción ya no se aplicará cuando llegue su horario." });
        },
        onError: () => {
          toast({ title: "No se pudo cancelar la promoción", description: "Puede que ya haya comenzado o sido cancelada.", variant: "destructive" });
        },
      },
    );
  };

  const confirmSubmit = () => {
    if (!pendingSubmitData) return;
    const data = pendingSubmitData;

    const payload = {
      ...data,
      imageUrl: data.imageUrl || null,
      salePrice: data.salePrice || null,
       promotions: promotionEnabled && editingPromotionId === null ? [{
        ...promotionDraft,
        name: promotionDraft.name.trim(),
        startsAt: new Date(promotionDraft.startsAt).toISOString(),
        endsAt: new Date(promotionDraft.endsAt).toISOString(),
         branchIds: promotionBranchIds,
      }] : undefined,
      branchConfigurations: Object.entries(branchConfigurations).map(([branchId, config]) => ({
        branchId: Number(branchId), ...config,
      })),
    };

    const handleSuccess = (msg: string) => {
      void queryClient.invalidateQueries({ queryKey: getListAdminProductsQueryKey() });
      void queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() });
      void queryClient.invalidateQueries({ queryKey: getGetAdminSummaryQueryKey() });
      if (!isEditing) localStorage.removeItem(DRAFT_STORAGE_KEY);
      toast({ title: msg, description: "Los cambios se reflejarán en el sistema en breve." });
      setShowConfirmDialog(false);
      setLocation("/admin/productos");
    };

    const handleError = () => {
      toast({ title: "Error", description: "Ocurrió un problema al guardar el producto.", variant: "destructive" });
      setShowConfirmDialog(false);
    };

    if (isEditing) {
      updateMutation.mutate({ id: Number(id), data: payload as any }, {
        onSuccess: () => handleSuccess("Producto actualizado"),
        onError: handleError
      });
    } else {
      createMutation.mutate({ data: payload as ProductInput }, {
        onSuccess: () => handleSuccess("Producto creado exitosamente"),
        onError: handleError
      });
    }
  };

  const isLoading = (isEditing && (isLoadingList || isLoadingDetail)) || !categories;
  const isSaving = createMutation.isPending || updateMutation.isPending;

  // Sale Price Calculator
  const discountPercent = (priceValue && salePriceValue) ? Math.round(((priceValue - salePriceValue) / priceValue) * 100) : 0;

  if (isLoading) {
    return (
      <AdminLayout>
        <div className="p-8 max-w-5xl mx-auto w-full space-y-6">
          <div className="h-8 w-64 bg-muted animate-pulse rounded" />
          <div className="h-[600px] bg-muted animate-pulse rounded border border-border" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="flex-1 overflow-y-auto bg-[#FBFAF7] dark:bg-background pb-32">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(preSubmit)} className="space-y-0">

            <div className="px-8 py-6 border-b border-[#E8DED0] dark:border-border bg-white dark:bg-card sticky top-0 z-10 shadow-sm">
              <div className="max-w-5xl mx-auto flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <Button variant="ghost" size="icon" asChild className="rounded-none text-[#4B3028] dark:text-foreground">
                    <Link href="/admin/productos"><ArrowLeft className="h-5 w-5" /></Link>
                  </Button>
                  <div>
                    <h1 className="text-2xl font-serif tracking-tight text-[#25211E] dark:text-foreground">
                      {isEditing ? `Editar: ${existingProduct?.name || ''}` : "Nuevo Producto"}
                    </h1>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-8 max-w-5xl mx-auto">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

                {/* Main Content Column */}
                <div className="lg:col-span-2 space-y-8">

                  {/* Basic Info */}
                  <div className="bg-white dark:bg-card p-8 border border-[#E8DED0] dark:border-border space-y-6">
                    <h2 className="text-lg font-semibold font-serif text-[#25211E] dark:text-foreground border-b border-[#E8DED0] dark:border-border pb-3">Información General</h2>

                    <FormField control={form.control} name="name" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nombre del Producto</FormLabel>
                        <FormControl><Input {...field} className="rounded-none border-[#E8DED0] dark:border-border focus-visible:ring-[#D43B2B] text-lg font-medium" placeholder="Ej. Ensaimada de Mallorca" /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />

                    <div className="grid grid-cols-2 gap-6">
                      <FormField control={form.control} name="sku" render={({ field }) => (
                        <FormItem>
                          <FormLabel>SKU</FormLabel>
                          <FormControl><Input {...field} className="rounded-none font-mono text-sm border-[#E8DED0] dark:border-border focus-visible:ring-[#D43B2B]" /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField control={form.control} name="slug" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Identificador (Slug)</FormLabel>
                          <FormControl><Input {...field} className="rounded-none text-sm border-[#E8DED0] dark:border-border focus-visible:ring-[#D43B2B]" /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                    </div>
                  </div>

                  {/* Pricing */}
                  <div className="bg-white dark:bg-card p-8 border border-[#E8DED0] dark:border-border space-y-6">
                    <h2 className="text-lg font-semibold font-serif text-[#25211E] dark:text-foreground border-b border-[#E8DED0] dark:border-border pb-3">Precios</h2>

                    <div className="grid grid-cols-2 gap-6 items-start">
                      <FormField control={form.control} name="price" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Precio Base (MXN)</FormLabel>
                          <FormControl><Input type="number" step="0.01" {...field} className="rounded-none border-[#E8DED0] dark:border-border text-lg font-medium focus-visible:ring-[#D43B2B]" /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />

                      <FormField control={form.control} name="salePrice" render={({ field }) => (
                        <FormItem>
                          <FormLabel className="flex justify-between items-center w-full">
                            <span>Precio Especial (MXN)</span>
                            {discountPercent > 0 && <span className="text-xs bg-[#D43B2B]/10 text-[#D43B2B] px-2 py-0.5 rounded font-bold">-{discountPercent}% OFF</span>}
                          </FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              step="0.01"
                              value={field.value || ""}
                              onChange={e => field.onChange(e.target.value ? parseFloat(e.target.value) : null)}
                              className="rounded-none border-[#E8DED0] dark:border-border focus-visible:ring-[#D43B2B]"
                              placeholder="Opcional"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                    </div>
                  </div>

                  {/* Content */}
                  <div className="bg-white dark:bg-card p-8 border border-[#E8DED0] dark:border-border space-y-6">
                    <h2 className="text-lg font-semibold font-serif text-[#25211E] dark:text-foreground border-b border-[#E8DED0] dark:border-border pb-3">Contenido</h2>

                    <FormField control={form.control} name="shortDescription" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Descripción Corta (Mostrada en listados)</FormLabel>
                        <FormControl><Input {...field} className="rounded-none border-[#E8DED0] dark:border-border focus-visible:ring-[#D43B2B]" /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />

                    <FormField control={form.control} name="description" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Descripción Completa</FormLabel>
                        <FormControl><Textarea {...field} className="min-h-[140px] rounded-none border-[#E8DED0] dark:border-border focus-visible:ring-[#D43B2B]" /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />

                  <FormItem>
                    <FormLabel>Imágenes del producto</FormLabel>
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => imageInputRef.current?.click()}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") imageInputRef.current?.click();
                      }}
                      onDragOver={(event) => { event.preventDefault(); setIsImageDropActive(true); }}
                      onDragLeave={() => setIsImageDropActive(false)}
                      onDrop={(event) => {
                        event.preventDefault();
                        setIsImageDropActive(false);
                        void handleImageFiles(Array.from(event.dataTransfer.files));
                      }}
                      className={`mt-2 flex min-h-28 cursor-pointer flex-col items-center justify-center border border-dashed px-5 py-6 text-center transition-colors ${
                        isImageDropActive ? "border-[#D43B2B] bg-[#D43B2B]/5" : "border-[#CFC3B5] bg-[#FBFAF7] hover:border-[#D43B2B]"
                      }`}
                    >
                      <Upload className="mb-2 h-6 w-6 text-[#D43B2B]" />
                      <p className="text-sm font-medium">Arrastra imágenes aquí o selecciónalas</p>
                      <p className="mt-1 text-xs text-muted-foreground">JPG, PNG, WEBP, GIF o AVIF · máximo 8 MB por archivo</p>
                      <input
                        ref={imageInputRef}
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
                        multiple
                        className="sr-only"
                        onChange={(event) => {
                          void handleImageFiles(Array.from(event.target.files || []));
                          event.target.value = "";
                        }}
                      />
                    </div>

                    {imageAssets.length > 0 ? (
                      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                        {imageAssets.map((asset, index) => (
                          <div key={asset.id} className="group relative overflow-hidden border border-[#E8DED0] bg-[#F5F0E8]">
                            <div className="aspect-square">
                              <ImageWithFallback
                                src={asset.previewUrl}
                                alt={index === 0 ? "Imagen principal del producto" : `Imagen ${index + 1} del producto`}
                                className="h-full w-full object-cover"
                                fallback={<div role="img" aria-label={`${asset.fileName}: imagen no disponible`} className="flex h-full w-full items-center justify-center p-3 text-center text-xs text-muted-foreground">Imagen no disponible</div>}
                              />
                              {asset.status === "error" && (
                                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[#4B3028]/90 p-3 text-center text-xs text-white">
                                  <AlertCircle className="h-5 w-5" />
                                  <span>{asset.error}</span>
                                </div>
                              )}
                            </div>
                            <div className="absolute left-2 top-2 flex gap-1">
                              {index === 0 && <span className="bg-[#4B3028] px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-white">Principal</span>}
                              {asset.status === "uploading" && <span className="bg-white/90 px-2 py-1 text-[10px] font-semibold text-[#4B3028]">{asset.progress}%</span>}
                            </div>
                            <div className="flex items-center justify-between gap-1 border-t border-[#E8DED0] bg-white p-1">
                              <span className="min-w-0 flex-1 truncate px-1 text-[10px] text-muted-foreground" title={asset.fileName}>{asset.fileName}</span>
                              <div className="flex shrink-0">
                                {asset.status === "error" && asset.file && (
                                  <Button type="button" variant="ghost" size="icon" className="h-7 w-7 rounded-none" onClick={() => void uploadImage(asset)} aria-label={`Reintentar ${asset.fileName}`}>
                                    <RotateCcw className="h-3.5 w-3.5" />
                                  </Button>
                                )}
                                <Button type="button" variant="ghost" size="icon" className="h-7 w-7 rounded-none" onClick={() => moveImage(index, -1)} disabled={index === 0} aria-label="Mover imagen a la izquierda">
                                  <ChevronLeft className="h-3.5 w-3.5" />
                                </Button>
                                <Button type="button" variant="ghost" size="icon" className="h-7 w-7 rounded-none" onClick={() => moveImage(index, 1)} disabled={index === imageAssets.length - 1} aria-label="Mover imagen a la derecha">
                                  <ChevronRight className="h-3.5 w-3.5" />
                                </Button>
                                <Button type="button" variant="ghost" size="icon" className="h-7 w-7 rounded-none text-destructive hover:text-destructive" onClick={() => removeImage(asset.id)} aria-label={`Eliminar ${asset.fileName}`}>
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </div>
                            {asset.status === "uploading" && <div className="h-1 bg-[#E8DED0]"><div className="h-full bg-[#D43B2B] transition-all" style={{ width: `${asset.progress}%` }} /></div>}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
                        <ImageIcon className="h-4 w-4" />
                        <span>La primera imagen será la principal; las demás formarán la galería.</span>
                      </div>
                    )}
                    {imageAssets.length > 0 && <p className="mt-3 flex items-center gap-1 text-xs text-muted-foreground"><Info className="h-3 w-3" /> Usa las flechas para reordenar. La primera imagen será la principal.</p>}
                  </FormItem>
                  </div>

                  {/* Promotions */}
                  <div className="bg-white dark:bg-card p-8 border border-[#E8DED0] dark:border-border space-y-6">
                    <div className="flex items-start justify-between gap-4 border-b border-[#E8DED0] dark:border-border pb-3">
                      <div>
                        <h2 className="text-lg font-semibold font-serif text-[#25211E] dark:text-foreground">Promociones programadas</h2>
                        <p className="mt-1 text-xs text-muted-foreground">El precio final se calcula en el servidor y cambia automáticamente según el horario.</p>
                      </div>
                      {editingPromotionId === null && (
                        <label className="flex shrink-0 items-center gap-2 text-sm font-medium cursor-pointer">
                          <Checkbox checked={promotionEnabled} onCheckedChange={(value) => setPromotionEnabled(!!value)} className="data-[state=checked]:bg-[#D43B2B] data-[state=checked]:border-[#D43B2B]" />
                          Programar
                        </label>
                      )}
                    </div>

                    {promotionEnabled && (
                      <div className="space-y-5">
                        {editingPromotionId !== null && (
                          <div className="flex items-center justify-between gap-3 border border-[#D43B2B]/30 bg-[#D43B2B]/5 px-3 py-2 text-sm">
                            <span className="font-medium text-[#4B3028] dark:text-foreground">Editando una promoción programada</span>
                            <Button type="button" variant="ghost" size="sm" onClick={stopEditingPromotion} className="rounded-none">Descartar</Button>
                          </div>
                        )}
                        <div className="grid grid-cols-1 md:grid-cols-[1fr_180px_140px] gap-4">
                          <label className="text-sm font-medium text-muted-foreground">
                            Nombre de la promoción
                            <Input value={promotionDraft.name} onChange={(event) => setPromotionDraft((current) => ({ ...current, name: event.target.value }))} placeholder="Ej. Fin de semana" className="mt-1 rounded-none border-[#E8DED0] dark:border-border bg-white" />
                          </label>
                          <label className="text-sm font-medium text-muted-foreground">
                            Tipo
                            <select value={promotionDraft.type} onChange={(event) => setPromotionDraft((current) => ({ ...current, type: event.target.value as PromotionType }))} className="mt-1 flex h-10 w-full rounded-none border border-[#E8DED0] bg-white px-3 text-sm dark:border-border dark:bg-background">
                              <option value="fixed">Precio fijo</option>
                              <option value="percentage">Porcentaje</option>
                              <option value="amount">Monto a descontar</option>
                            </select>
                          </label>
                          <label className="text-sm font-medium text-muted-foreground">
                            {promotionDraft.type === "percentage" ? "Porcentaje" : "Valor (MXN)"}
                            <Input type="number" min="0" max={promotionDraft.type === "percentage" ? 100 : undefined} step="0.01" value={promotionDraft.value} onChange={(event) => setPromotionDraft((current) => ({ ...current, value: Number(event.target.value) }))} className="mt-1 rounded-none border-[#E8DED0] dark:border-border bg-white" />
                          </label>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <label className="text-sm font-medium text-muted-foreground">
                            Inicia
                            <Input type="datetime-local" value={promotionDraft.startsAt} onChange={(event) => setPromotionDraft((current) => ({ ...current, startsAt: event.target.value }))} className="mt-1 rounded-none border-[#E8DED0] dark:border-border bg-white" />
                          </label>
                          <label className="text-sm font-medium text-muted-foreground">
                            Finaliza
                            <Input type="datetime-local" value={promotionDraft.endsAt} onChange={(event) => setPromotionDraft((current) => ({ ...current, endsAt: event.target.value }))} className="mt-1 rounded-none border-[#E8DED0] dark:border-border bg-white" />
                          </label>
                        </div>
                        <div className="space-y-3 border-t border-dashed border-[#E8DED0] pt-4">
                          <p className="text-sm font-medium text-muted-foreground">Alcance por sucursal</p>
                          <label className="flex items-center gap-2 text-sm cursor-pointer">
                            <Checkbox
                              checked={promotionAllBranches}
                              onCheckedChange={(value) => {
                                const allBranches = !!value;
                                setPromotionAllBranches(allBranches);
                                if (editingPromotionId !== null) {
                                  setEditingPromotionBranchIds(allBranches
                                    ? []
                                    : (editingPromotionBranchIds?.length
                                      ? editingPromotionBranchIds
                                      : Object.entries(branchConfigurations)
                                        .filter(([, config]) => config.available)
                                        .map(([branchId]) => Number(branchId))));
                                }
                              }}
                              className="data-[state=checked]:bg-[#D43B2B] data-[state=checked]:border-[#D43B2B]"
                            />
                            Todas las sucursales
                          </label>
                          {!promotionAllBranches && (
                            <p className="text-xs text-muted-foreground">
                              {editingPromotionId !== null
                                ? "Se conservarán las sucursales asignadas a esta promoción."
                                : "Se aplicará a las sucursales marcadas como “Publicar aquí” abajo."}
                            </p>
                          )}
                        </div>
                        {editingPromotionId !== null && (
                          <div className="flex justify-end border-t border-dashed border-[#E8DED0] pt-4">
                            <Button
                              type="button"
                              onClick={savePromotionEdit}
                              disabled={updatePromotionMutation.isPending}
                              className="rounded-none bg-[#D43B2B] text-white hover:bg-[#B83225]"
                            >
                              {updatePromotionMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                              Guardar promoción
                            </Button>
                          </div>
                        )}
                      </div>
                    )}

                    {isEditing && (
                      <div className="border-t border-[#E8DED0] pt-5">
                        <p className="mb-3 text-sm font-semibold text-[#25211E] dark:text-foreground">Historial</p>
                        {promotionHistory?.length ? (
                          <div className="space-y-2">
                            {promotionHistory.map((promotion) => (
                              <div key={promotion.id} className="flex flex-wrap items-center justify-between gap-2 border border-[#E8DED0] bg-[#FBFAF7] px-3 py-2 text-xs dark:border-border dark:bg-muted/10">
                                <div>
                                  <span className="font-semibold">{promotion.name}</span>
                                  <span className="ml-2 text-muted-foreground">
                                    {promotion.type === "percentage" ? `${promotion.value}%` : promotion.type === "fixed" ? `$${promotion.value} fijo` : `-$${promotion.value}`}
                                  </span>
                                </div>
                                <div className="flex items-center gap-2 text-muted-foreground">
                                   <span>{promotion.status === "scheduled" ? "Programada" : promotion.status === "active" ? "Activa" : promotion.status === "cancelled" ? "Cancelada" : "Finalizada"}</span>
                                  <span>{new Intl.DateTimeFormat("es-MX", { dateStyle: "short", timeStyle: "short" }).format(new Date(promotion.startsAt))}</span>
                                   {promotion.status === "scheduled" && (
                                     <>
                                       <Button type="button" variant="ghost" size="sm" onClick={() => startEditingPromotion(promotion)} className="h-7 rounded-none px-2 text-[#4B3028]">
                                         Editar
                                       </Button>
                                       <Button type="button" variant="ghost" size="sm" onClick={() => cancelPromotion(promotion.id)} disabled={cancelPromotionMutation.isPending} className="h-7 rounded-none px-2 text-destructive hover:text-destructive">
                                         Cancelar
                                       </Button>
                                     </>
                                   )}
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-muted-foreground">Todavía no hay promociones registradas.</p>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Branches */}
                  <div className="bg-white dark:bg-card p-0 border border-[#E8DED0] dark:border-border shadow-sm">
                    <div className="p-6 border-b border-[#E8DED0] dark:border-border flex items-center gap-2 bg-[#FBFAF7] dark:bg-muted/10">
                      <Store className="w-5 h-5 text-[#D43B2B]" />
                      <h2 className="text-lg font-semibold font-serif text-[#25211E] dark:text-foreground">Disponibilidad por Sucursal</h2>
                    </div>

                    <div className="divide-y divide-[#E8DED0] dark:divide-border">
                      {branches?.map((branch) => {
                        const config = branchConfigurations[branch.id] || {};
                        const setConfig = (key: string, value: any) => setBranchConfigurations(prev => ({ ...prev, [branch.id]: { ...prev[branch.id], [key]: value } }));
                        return (
                          <div key={branch.id} className={`p-6 transition-colors ${config.available ? 'bg-white dark:bg-card' : 'bg-[#F5F0E8]/30 dark:bg-muted/10'}`}>
                            <div className="flex items-center justify-between mb-4">
                              <div className="font-semibold text-base text-[#25211E] dark:text-foreground">{branch.name}</div>
                              <label className="flex gap-2 items-center text-sm font-medium cursor-pointer">
                                <Checkbox checked={config.available ?? false} onCheckedChange={v => setConfig("available", !!v)} className="data-[state=checked]:bg-[#D43B2B] data-[state=checked]:border-[#D43B2B]" />
                                Publicar aquí
                              </label>
                            </div>

                            <div className={`grid grid-cols-2 md:grid-cols-4 gap-4 items-end mt-4 transition-opacity ${config.available ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
                              <label className="text-sm font-medium text-muted-foreground">Inventario<Input type="number" min="0" value={config.inventory ?? 0} onChange={e => setConfig("inventory", Number(e.target.value))} className="mt-1 rounded-none border-[#E8DED0] dark:border-border bg-white" disabled={!config.available}/></label>
                              <label className="text-sm font-medium text-muted-foreground">Stock Mínimo<Input type="number" min="0" value={config.minStock ?? 0} onChange={e => setConfig("minStock", Number(e.target.value))} className="mt-1 rounded-none border-[#E8DED0] dark:border-border bg-white" disabled={!config.available}/></label>
                              <label className="text-sm font-medium text-muted-foreground relative">
                                Precio local
                                <Input type="number" min="0" step="0.01" placeholder="Usar base" value={config.priceOverride ?? ""} onChange={e => setConfig("priceOverride", e.target.value ? Number(e.target.value) : null)} className="mt-1 rounded-none border-[#E8DED0] dark:border-border pl-6 bg-white" disabled={!config.available}/>
                                <span className="absolute left-2.5 top-[34px] text-muted-foreground text-xs">$</span>
                              </label>
                              <label className="text-sm font-medium text-muted-foreground">Prep. (min)<Input type="number" min="0" value={config.preparationTimeMinutes ?? branch.preparationTimeMinutes} onChange={e => setConfig("preparationTimeMinutes", Number(e.target.value))} className="mt-1 rounded-none border-[#E8DED0] dark:border-border bg-white" disabled={!config.available}/></label>
                            </div>

                            <div className={`flex gap-6 mt-4 pt-4 border-t border-dashed border-[#E8DED0] dark:border-border transition-opacity ${config.available ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
                              <label className="flex gap-2 items-center text-sm cursor-pointer text-[#25211E] dark:text-foreground font-medium">
                                <Checkbox checked={config.pickupAvailable ?? branch.pickupAvailable} onCheckedChange={v => setConfig("pickupAvailable", !!v)} disabled={!config.available} /> Pick-up
                              </label>
                              <label className="flex gap-2 items-center text-sm cursor-pointer text-[#25211E] dark:text-foreground font-medium">
                                <Checkbox checked={config.deliveryAvailable ?? branch.deliveryAvailable} onCheckedChange={v => setConfig("deliveryAvailable", !!v)} disabled={!config.available} /> Delivery
                              </label>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>

                {/* Sidebar Column */}
                <div className="space-y-8">
                  <div className="bg-white dark:bg-card p-6 border border-[#E8DED0] dark:border-border space-y-6">
                    <h2 className="text-lg font-semibold font-serif text-[#25211E] dark:text-foreground border-b border-[#E8DED0] dark:border-border pb-3">Publicación</h2>

                    <FormField control={form.control} name="status" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Estado del Sistema</FormLabel>
                        <FormControl>
                          <select
                            {...field}
                            className="flex h-10 w-full items-center justify-between rounded-none border border-[#E8DED0] dark:border-border bg-white dark:bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#D43B2B] appearance-none"
                          >
                            <option value="active">Activo - Visible</option>
                            <option value="draft">Borrador - Oculto</option>
                            <option value="inactive">Inactivo - Archivado</option>
                          </select>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />

                    <FormField control={form.control} name="categoryId" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Categoría Principal</FormLabel>
                        <FormControl>
                          <select
                            {...field}
                            className="flex h-10 w-full items-center justify-between rounded-none border border-[#E8DED0] dark:border-border bg-white dark:bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#D43B2B] appearance-none"
                          >
                            <option value="0">Seleccionar...</option>
                            {categories?.map(c => (
                              <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                          </select>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />

                    <FormField control={form.control} name="minimumLeadTimeHours" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Lead Time Global (Horas)</FormLabel>
                        <FormControl><Input type="number" {...field} className="rounded-none border-[#E8DED0] dark:border-border" /></FormControl>
                        <p className="text-xs text-muted-foreground mt-1 leading-snug">Tiempo mínimo de anticipación para pedidos programados.</p>
                      </FormItem>
                    )} />
                  </div>

                  <div className="bg-white dark:bg-card p-6 border border-[#E8DED0] dark:border-border space-y-4">
                    <h2 className="text-lg font-semibold font-serif text-[#25211E] dark:text-foreground border-b border-[#E8DED0] dark:border-border pb-3">Atributos Especiales</h2>

                    <div className="flex flex-col gap-3 pt-2">
                      <FormField control={form.control} name="featured" render={({ field }) => (
                        <FormItem className="flex flex-row items-center space-x-3 space-y-0 p-3 border border-[#E8DED0] dark:border-border bg-[#FBFAF7] dark:bg-muted/10 hover:border-[#D43B2B]/50 transition-colors">
                          <FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} className="data-[state=checked]:bg-[#D43B2B] data-[state=checked]:border-[#D43B2B]"/></FormControl>
                          <div className="space-y-1 leading-none">
                            <FormLabel className="cursor-pointer font-semibold text-[#25211E] dark:text-foreground">Destacado</FormLabel>
                            <p className="text-xs text-muted-foreground mt-1">Aparece en inicio</p>
                          </div>
                        </FormItem>
                      )} />

                      <FormField control={form.control} name="seasonal" render={({ field }) => (
                        <FormItem className="flex flex-row items-center space-x-3 space-y-0 p-3 border border-[#E8DED0] dark:border-border bg-[#FBFAF7] dark:bg-muted/10 hover:border-[#D43B2B]/50 transition-colors">
                          <FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} className="data-[state=checked]:bg-[#D43B2B] data-[state=checked]:border-[#D43B2B]"/></FormControl>
                          <div className="space-y-1 leading-none">
                            <FormLabel className="cursor-pointer font-semibold text-[#25211E] dark:text-foreground">Temporada</FormLabel>
                            <p className="text-xs text-muted-foreground mt-1">Colecciones especiales</p>
                          </div>
                        </FormItem>
                      )} />
                    </div>
                  </div>
                </div>

              </div>
            </div>

            {/* Sticky Action Area */}
            <div className="fixed bottom-0 left-0 md:left-64 right-0 bg-white dark:bg-card border-t border-[#E8DED0] dark:border-border px-8 py-4 shadow-[0_-10px_30px_rgba(0,0,0,0.03)] z-20 flex justify-between items-center">
              <div className="hidden sm:block text-sm text-muted-foreground font-medium">
                {!isEditing && initializedDraft.current && <span className="flex items-center gap-1.5"><Save className="w-4 h-4 text-emerald-600"/> Borrador local guardado</span>}
              </div>
              <div className="flex gap-4 w-full sm:w-auto">
                <Button variant="outline" type="button" asChild className="rounded-none border-[#E8DED0] dark:border-border text-[#4B3028] dark:text-foreground flex-1 sm:flex-none hover:bg-[#F5F0E8] dark:hover:bg-muted h-11 px-8">
                  <Link href="/admin/productos">Descartar</Link>
                </Button>
                <Button type="submit" disabled={isSaving} className="rounded-none bg-[#D43B2B] hover:bg-[#B83225] text-white flex-1 sm:flex-none h-11 px-8 font-medium">
                  {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                  {isSaving ? "Guardando..." : "Guardar Producto"}
                </Button>
              </div>
            </div>

          </form>
        </Form>
      </div>

      {/* Explicit Publication Confirmation Dialog */}
      <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <DialogContent className="rounded-none border-[#E8DED0] dark:border-border p-0 max-w-md overflow-hidden bg-white dark:bg-card">
          <div className="bg-[#4B3028] p-6 text-[#F5F0E8] text-center border-b border-[#25211E]">
            <h2 className="text-2xl font-serif mb-1">Confirmar Publicación</h2>
            <p className="text-[#F5F0E8]/70 text-sm font-sans">Resumen de los cambios que se aplicarán al catálogo</p>
          </div>
          <div className="p-6 space-y-4">
            {pendingSubmitData && (
              <div className="space-y-4">
                <div className="grid grid-cols-[100px_1fr] gap-x-2 gap-y-3 text-sm">
                  <span className="text-muted-foreground">Producto:</span>
                  <span className="font-semibold text-[#25211E] dark:text-foreground">{pendingSubmitData.name}</span>

                  <span className="text-muted-foreground">SKU:</span>
                  <span className="font-mono text-[#25211E] dark:text-foreground">{pendingSubmitData.sku}</span>

                  <span className="text-muted-foreground">Estado:</span>
                  <span className="font-semibold uppercase tracking-wider text-[11px] flex items-center">
                    {pendingSubmitData.status === 'active' ? <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">Activo - Visible</span> : <span className="text-muted-foreground bg-muted px-2 py-0.5 rounded border border-border">Borrador / Inactivo</span>}
                  </span>

                  <span className="text-muted-foreground">Precio Público:</span>
                  <span className="font-semibold text-[#25211E] dark:text-foreground text-base">${pendingSubmitData.salePrice || pendingSubmitData.price} MXN</span>

                  <span className="text-muted-foreground pt-3 border-t border-[#E8DED0] dark:border-border">Sucursales:</span>
                  <span className="pt-3 border-t border-[#E8DED0] dark:border-border font-medium text-sm text-[#25211E] dark:text-foreground">
                    {Object.entries(branchConfigurations)
                      .filter(([_, config]) => config.available)
                      .map(([branchId]) => branches?.find(b => b.id === Number(branchId))?.name)
                      .join(", ") || <span className="text-destructive flex items-center gap-1"><AlertCircle className="w-3 h-3"/> Ninguna (No se podrá comprar)</span>}
                  </span>
                </div>
              </div>
            )}
          </div>
          <DialogFooter className="p-4 border-t border-[#E8DED0] dark:border-border bg-[#FBFAF7] dark:bg-muted/10 gap-2 sm:gap-0 flex sm:justify-between w-full">
            <Button variant="outline" onClick={() => setShowConfirmDialog(false)} className="rounded-none border-[#E8DED0] text-[#4B3028]">Revisar Detalles</Button>
            <Button onClick={confirmSubmit} disabled={isSaving} className="rounded-none bg-[#D43B2B] hover:bg-[#B83225] text-white font-medium">
              {isSaving ? "Aplicando..." : "Confirmar Cambios"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
