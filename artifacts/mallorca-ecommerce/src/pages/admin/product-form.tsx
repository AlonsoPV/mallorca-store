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
  type ProductInput,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useParams, Link, useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Save, Loader2, Image as ImageIcon, Store, AlertCircle, Info } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";

const formSchema = z.object({
  sku: z.string().min(1, "SKU es requerido"),
  name: z.string().min(1, "Nombre es requerido"),
  slug: z.string().min(1, "Slug es requerido"),
  shortDescription: z.string().min(1, "Descripción corta requerida"),
  description: z.string().min(1, "Descripción completa requerida"),
  price: z.coerce.number().min(0, "Precio debe ser mayor o igual a 0"),
  salePrice: z.coerce.number().nullable().optional(),
  categoryId: z.coerce.number().min(1, "Seleccione una categoría"),
  imageUrl: z.string().nullable().optional().refine((val) => !val || val.startsWith("/") || val.startsWith("http"), "URL inválida"),
  featured: z.boolean().default(false),
  seasonal: z.boolean().default(false),
  status: z.enum(['draft', 'active', 'inactive']),
  minimumLeadTimeHours: z.coerce.number().min(0).default(0),
});

type FormValues = z.infer<typeof formSchema>;

const DRAFT_STORAGE_KEY = "mallorca_product_draft";

export default function AdminProductForm() {
  const { id } = useParams<{ id?: string }>();
  const isEditing = !!id && id !== "nuevo";
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: categories } = useListCategories();
  const { data: branches } = useListAdminBranches();
  const [branchConfigurations, setBranchConfigurations] = useState<Record<number, any>>({});

  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [pendingSubmitData, setPendingSubmitData] = useState<FormValues | null>(null);

  const adminProductParams = {};
  const { data: adminProducts, isLoading: isLoadingList } = useListAdminProducts(
    adminProductParams,
    { query: { enabled: isEditing, queryKey: getListAdminProductsQueryKey(adminProductParams) } },
  );

  const existingProduct = isEditing ? adminProducts?.find(p => p.id === Number(id)) : undefined;
  const productSlug = existingProduct?.slug || "";

  const { data: productDetail, isLoading: isLoadingDetail } = useGetProduct(
    productSlug,
    { query: { enabled: !!existingProduct?.slug, queryKey: getGetProductQueryKey(productSlug) } },
  );

  const createMutation = useCreateProduct();
  const updateMutation = useUpdateProduct();

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
        featured: productDetail.featured,
        seasonal: productDetail.seasonal,
        status: (existingProduct as any)?.status || "draft",
        minimumLeadTimeHours: productDetail.minimumLeadTimeHours,
      });
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
    // Validation: At least one branch must be available if active
    if (data.status === 'active') {
      const isAvailableAnywhere = Object.values(branchConfigurations).some(c => c.available);
      if (!isAvailableAnywhere) {
        toast({ title: "Validación Fallida", description: "El producto debe estar disponible en al menos una sucursal para ser publicado.", variant: "destructive" });
        return;
      }
    }

    setPendingSubmitData(data);
    setShowConfirmDialog(true);
  };

  const confirmSubmit = () => {
    if (!pendingSubmitData) return;
    const data = pendingSubmitData;

    const payload = {
      ...data,
      imageUrl: data.imageUrl || null,
      salePrice: data.salePrice || null,
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

                    <FormField control={form.control} name="imageUrl" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Imagen del Producto (URL)</FormLabel>
                        <div className="flex gap-6 items-start mt-2">
                          <div className="w-28 h-28 bg-[#F5F0E8] dark:bg-muted border border-[#E8DED0] dark:border-border overflow-hidden flex items-center justify-center shrink-0">
                            {field.value ? (
                              <img src={field.value} alt="Preview" className="w-full h-full object-cover" onError={(e) => (e.currentTarget.style.display = 'none')} />
                            ) : (
                              <ImageIcon className="h-8 w-8 text-muted-foreground/30" />
                            )}
                          </div>
                          <div className="flex-1 pt-2">
                            <FormControl><Input placeholder="https://..." value={field.value || ""} onChange={field.onChange} className="rounded-none border-[#E8DED0] dark:border-border focus-visible:ring-[#D43B2B]" /></FormControl>
                            <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1"><Info className="w-3 h-3"/> Recomendado: formato cuadrado, fondo claro.</p>
                          </div>
                        </div>
                        <FormMessage />
                      </FormItem>
                    )} />
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
