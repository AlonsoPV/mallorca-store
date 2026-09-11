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
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Save, Loader2, Image as ImageIcon } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Checkbox } from "@/components/ui/checkbox";

const formSchema = z.object({
  sku: z.string().min(1, "SKU es requerido"),
  name: z.string().min(1, "Nombre es requerido"),
  slug: z.string().min(1, "Slug es requerido"),
  shortDescription: z.string().min(1, "Descripción corta es requerida"),
  description: z.string().min(1, "Descripción completa es requerida"),
  price: z.coerce.number().min(0, "Precio debe ser mayor o igual a 0"),
  salePrice: z.coerce.number().nullable().optional(),
  categoryId: z.coerce.number().min(1, "Seleccione una categoría"),
  imageUrl: z
    .string()
    .nullable()
    .optional()
    .refine((value) => {
      if (!value || value.startsWith("/")) return true;
      try {
        new URL(value);
        return true;
      } catch {
        return false;
      }
    }, "URL inválida"),
  featured: z.boolean().default(false),
  seasonal: z.boolean().default(false),
  status: z.enum(['draft', 'active', 'inactive']),
  minimumLeadTimeHours: z.coerce.number().min(0).default(0),
});

type FormValues = z.infer<typeof formSchema>;

export default function AdminProductForm() {
  const { id } = useParams<{ id?: string }>();
  const isEditing = !!id && id !== "nuevo";
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: categories } = useListCategories();
  const { data: branches } = useListAdminBranches();
  const [branchConfigurations, setBranchConfigurations] = useState<Record<number, any>>({});
  
  // Use slug based fetch if editing. Wait, our API uses ID for update, but getProduct takes slug? 
  // Let's assume the route passes slug or ID. The schema says updateProduct takes id (number) and getProduct takes slug.
  // Actually, listAdminProducts returns ID, but getProduct requires slug. We can't fetch by ID directly with generated hooks unless there is a useGetAdminProduct, which there isn't.
  // Wait, if id is a number, we can't use useGetProduct(id) because it expects slug.
  // We'll need a hack or we assume `id` in route is actually `slug` for fetching but we parse it to ID for update.
  // Let's change the route in App.tsx to use :slug for edit? The prompt said `/admin/productos/:id`, but we only have `useGetProduct(slug)`.
  // Wait! The list returns products with `slug` and `id`. 
  // Let's modify the list to link to `/admin/productos/${product.id}?slug=${product.slug}` maybe? 
  // For simplicity, if we need to fetch, we need the slug.
  // Let's use `id` param. If we have to, we listAdminProducts and find the one.
  const adminProductParams = {};
  const { data: adminProducts, isLoading: isLoadingList } = useListAdminProducts(
    adminProductParams,
    {
      query: {
        enabled: isEditing,
        queryKey: getListAdminProductsQueryKey(adminProductParams),
      },
    },
  );
  const existingProduct = isEditing ? adminProducts?.find(p => p.id === Number(id)) : undefined;
  
  // Now we have the slug to fetch full details
  const productSlug = existingProduct?.slug || "";
  const { data: productDetail, isLoading: isLoadingDetail } = useGetProduct(
    productSlug,
    {
      query: {
        enabled: !!existingProduct?.slug,
        queryKey: getGetProductQueryKey(productSlug),
      },
    },
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

  // Auto-generate slug from name if empty
  const nameValue = form.watch("name");
  const slugValue = form.watch("slug");
  
  useEffect(() => {
    if (!isEditing && nameValue && !slugValue) {
      form.setValue("slug", nameValue.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, ''));
    }
  }, [nameValue, isEditing, slugValue, form]);

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
        status: (existingProduct as any)?.status || "draft", // Admin list has status
        minimumLeadTimeHours: productDetail.minimumLeadTimeHours,
      });
      initialized.current = true;
    }
  }, [isEditing, productDetail, existingProduct, form, categories]);

  const onSubmit = (data: FormValues) => {
    const payload = {
      ...data,
      imageUrl: data.imageUrl || null,
      salePrice: data.salePrice || null,
      branchConfigurations: Object.entries(branchConfigurations).map(([branchId, config]) => ({
        branchId: Number(branchId), ...config,
      })),
    };

    if (isEditing) {
      updateMutation.mutate({ id: Number(id), data: payload as any }, {
        onSuccess: () => {
          void queryClient.invalidateQueries({
            queryKey: getListAdminProductsQueryKey(),
          });
          void queryClient.invalidateQueries({
            queryKey: getListProductsQueryKey(),
          });
          void queryClient.invalidateQueries({
            queryKey: getGetAdminSummaryQueryKey(),
          });
          toast({ title: "Producto actualizado", description: "Los cambios se guardaron correctamente." });
          setLocation("/admin/productos");
        },
        onError: () => {
          toast({ title: "Error", description: "No se pudo actualizar el producto.", variant: "destructive" });
        }
      });
    } else {
      createMutation.mutate({ data: payload as ProductInput }, {
        onSuccess: () => {
          void queryClient.invalidateQueries({
            queryKey: getListAdminProductsQueryKey(),
          });
          void queryClient.invalidateQueries({
            queryKey: getListProductsQueryKey(),
          });
          void queryClient.invalidateQueries({
            queryKey: getGetAdminSummaryQueryKey(),
          });
          toast({ title: "Producto creado", description: "El producto se creó correctamente." });
          setLocation("/admin/productos");
        },
        onError: () => {
          toast({ title: "Error", description: "No se pudo crear el producto.", variant: "destructive" });
        }
      });
    }
  };

  const isLoading = (isEditing && (isLoadingList || isLoadingDetail)) || !categories;
  const isSaving = createMutation.isPending || updateMutation.isPending;

  if (isLoading) {
    return (
      <AdminLayout>
        <div className="p-6 md:p-10 max-w-4xl mx-auto w-full space-y-6">
          <div className="h-8 w-64 bg-muted animate-pulse rounded" />
          <div className="h-[600px] bg-muted animate-pulse rounded-xl" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="flex-1 overflow-y-auto bg-muted/20">
        <div className="p-6 md:p-10 max-w-4xl mx-auto">
          
          <div className="flex items-center gap-4 mb-8">
            <Button variant="ghost" size="icon" asChild className="rounded-full">
              <Link href="/admin/productos"><ArrowLeft className="h-5 w-5" /></Link>
            </Button>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">
                {isEditing ? "Editar Producto" : "Nuevo Producto"}
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                Completa los detalles para el catálogo en línea.
              </p>
            </div>
          </div>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                {/* Left Column - Main info */}
                <div className="md:col-span-2 space-y-6 bg-card p-6 rounded-xl border border-border shadow-sm">
                  <h2 className="text-lg font-semibold mb-4 border-b border-border pb-2">Información Principal</h2>
                  
                  <FormField control={form.control} name="name" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nombre del Producto</FormLabel>
                      <FormControl><Input {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />

                  <div className="grid grid-cols-2 gap-4">
                    <FormField control={form.control} name="sku" render={({ field }) => (
                      <FormItem>
                        <FormLabel>SKU</FormLabel>
                        <FormControl><Input {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="slug" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Slug (URL)</FormLabel>
                        <FormControl><Input {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>

                  <FormField control={form.control} name="shortDescription" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Descripción Corta (Tarjetas)</FormLabel>
                      <FormControl><Input {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />

                  <FormField control={form.control} name="description" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Descripción Completa (Detalle)</FormLabel>
                      <FormControl><Textarea {...field} className="min-h-[120px]" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>

                {/* Right Column - Organization & Status */}
                <div className="space-y-6">
                  <div className="bg-card p-6 rounded-xl border border-border shadow-sm space-y-4">
                    <h2 className="text-lg font-semibold mb-4 border-b border-border pb-2">Publicación</h2>
                    
                    <FormField control={form.control} name="status" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Estado</FormLabel>
                        <FormControl>
                          <select 
                            {...field}
                            className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                          >
                            <option value="draft">Borrador</option>
                            <option value="active">Activo</option>
                            <option value="inactive">Inactivo</option>
                          </select>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />

                    <FormField control={form.control} name="categoryId" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Categoría</FormLabel>
                        <FormControl>
                          <select 
                            {...field}
                            className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                          >
                            <option value="0">Seleccionar categoría...</option>
                            {categories?.map(c => (
                              <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                          </select>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />

                    <div className="pt-2 flex flex-col gap-3">
                      <FormField control={form.control} name="featured" render={({ field }) => (
                        <FormItem className="flex flex-row items-start space-x-3 space-y-0 p-3 border rounded-md">
                          <FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                          <div className="space-y-1 leading-none">
                            <FormLabel className="cursor-pointer">Destacado</FormLabel>
                          </div>
                        </FormItem>
                      )} />
                      
                      <FormField control={form.control} name="seasonal" render={({ field }) => (
                        <FormItem className="flex flex-row items-start space-x-3 space-y-0 p-3 border rounded-md">
                          <FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                          <div className="space-y-1 leading-none">
                            <FormLabel className="cursor-pointer">Temporada</FormLabel>
                          </div>
                        </FormItem>
                      )} />
                    </div>
                  </div>

                  <div className="bg-card p-6 rounded-xl border border-border shadow-sm space-y-4">
                    <h2 className="text-lg font-semibold mb-4 border-b border-border pb-2">Precios e Inventario</h2>
                    
                    <FormField control={form.control} name="price" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Precio Base (MXN)</FormLabel>
                        <FormControl><Input type="number" step="0.01" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />

                    <FormField control={form.control} name="salePrice" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Precio Oferta (MXN) - Opcional</FormLabel>
                        <FormControl>
                          <Input 
                            type="number" 
                            step="0.01" 
                            value={field.value || ""} 
                            onChange={e => field.onChange(e.target.value ? parseFloat(e.target.value) : null)} 
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />

                    <FormField control={form.control} name="minimumLeadTimeHours" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Lead Time (Horas)</FormLabel>
                        <FormControl><Input type="number" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>
                </div>
              </div>

              {/* Image Section */}
              <div className="bg-card p-6 rounded-xl border border-border shadow-sm">
                <h2 className="text-lg font-semibold mb-4 border-b border-border pb-2">Configuración por sucursal</h2>
                <div className="space-y-4">
                  {branches?.map((branch) => {
                    const config = branchConfigurations[branch.id] || {};
                    const setConfig = (key: string, value: any) => setBranchConfigurations(prev => ({ ...prev, [branch.id]: { ...prev[branch.id], [key]: value } }));
                    return <div key={branch.id} className="grid grid-cols-2 md:grid-cols-4 gap-3 items-end border-b pb-4 last:border-0">
                      <div className="col-span-2 font-medium">{branch.name}</div>
                      <label className="flex gap-2 items-center text-sm"><Checkbox checked={config.available ?? false} onCheckedChange={v => setConfig("available", !!v)} /> Disponible</label>
                      <label className="text-sm">Inventario<Input type="number" min="0" value={config.inventory ?? 0} onChange={e => setConfig("inventory", Number(e.target.value))}/></label>
                      <label className="text-sm">Mínimo<Input type="number" min="0" value={config.minStock ?? 0} onChange={e => setConfig("minStock", Number(e.target.value))}/></label>
                      <label className="text-sm">Precio local<Input type="number" min="0" step="0.01" placeholder="Base" value={config.priceOverride ?? ""} onChange={e => setConfig("priceOverride", e.target.value ? Number(e.target.value) : null)}/></label>
                      <label className="flex gap-2 items-center text-sm"><Checkbox checked={config.pickupAvailable ?? branch.pickupAvailable} onCheckedChange={v => setConfig("pickupAvailable", !!v)} /> Recogida</label>
                      <label className="flex gap-2 items-center text-sm"><Checkbox checked={config.deliveryAvailable ?? branch.deliveryAvailable} onCheckedChange={v => setConfig("deliveryAvailable", !!v)} /> Entrega</label>
                      <label className="text-sm">Preparación (min)<Input type="number" min="0" value={config.preparationTimeMinutes ?? branch.preparationTimeMinutes} onChange={e => setConfig("preparationTimeMinutes", Number(e.target.value))}/></label>
                    </div>
                  })}
                </div>
              </div>

              {/* Image Section */}
              <div className="bg-card p-6 rounded-xl border border-border shadow-sm">
                <h2 className="text-lg font-semibold mb-4 border-b border-border pb-2">Imagen del Producto</h2>
                <FormField control={form.control} name="imageUrl" render={({ field }) => (
                  <FormItem>
                    <FormLabel>URL de Imagen</FormLabel>
                    <div className="flex gap-6 items-start mt-2">
                      <div className="w-32 h-32 bg-secondary border border-border rounded-md overflow-hidden flex items-center justify-center shrink-0">
                        {field.value ? (
                          <img src={field.value} alt="Preview" className="w-full h-full object-cover" onError={(e) => (e.currentTarget.style.display = 'none')} />
                        ) : (
                          <ImageIcon className="h-8 w-8 text-muted-foreground/40" />
                        )}
                      </div>
                      <div className="flex-1 pt-2">
                        <FormControl><Input placeholder="https://..." value={field.value || ""} onChange={field.onChange} /></FormControl>
                        <p className="text-xs text-muted-foreground mt-2">Proporciona una URL pública de la imagen. Recomendado: formato cuadrado o 4:5.</p>
                      </div>
                    </div>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              <div className="flex justify-end gap-4 pt-4 pb-12">
                <Button variant="outline" type="button" asChild>
                  <Link href="/admin/productos">Cancelar</Link>
                </Button>
                <Button type="submit" disabled={isSaving} className="min-w-[120px]">
                  {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Save className="h-4 w-4 mr-2" /> Guardar</>}
                </Button>
              </div>

            </form>
          </Form>
        </div>
      </div>
    </AdminLayout>
  );
}