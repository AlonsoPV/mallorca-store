import { useRef, useState } from "react";
import * as XLSX from "xlsx";
import { AdminLayout } from "@/components/layout/admin-layout";
import { Button } from "@/components/ui/button";
import {
  getListAdminProductsQueryKey,
  getListProductsQueryKey,
  getGetAdminSummaryQueryKey,
  getListAdminInventoryQueryKey,
  getListImportJobsQueryKey,
  useImportProducts,
  usePreviewProductImport,
  usePreviewInventoryImport,
  useImportInventory,
  useListImportJobs,
  type ProductImportPreview,
  type ProductImportResult,
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  Download,
  FileUp,
  RefreshCcw,
} from "lucide-react";
import { cn } from "@/lib/utils";

const MAPPING_STORAGE_KEY = "mallorca_product_import_mapping";
const UPDATE_FIELDS = [
  { key: "general", label: "Información general" },
  { key: "categories", label: "Categorías" },
  { key: "tags", label: "Etiquetas" },
  { key: "price", label: "Precio" },
  { key: "inventory", label: "Inventario" },
  { key: "branches", label: "Sucursales" },
  { key: "promotions", label: "Promociones" },
  { key: "cross-sell", label: "Cross-sell" },
  { key: "images", label: "Imágenes" },
] as const;

const IMPORT_FIELDS = [
  { key: "sku", label: "SKU", required: true },
  { key: "name", label: "Nombre", required: false },
  { key: "slug", label: "Slug", required: false },
  { key: "shortDescription", label: "Descripción corta", required: false },
  { key: "description", label: "Descripción", required: false },
  { key: "price", label: "Precio", required: false },
  { key: "salePrice", label: "Precio oferta", required: false },
  { key: "categoryId", label: "ID de categoría", required: false },
  { key: "categories", label: "Categorías (|)", required: false },
  { key: "primaryCategory", label: "Categoría principal", required: false },
  { key: "tags", label: "Etiquetas (|)", required: false },
  { key: "imageUrl", label: "URL de imagen", required: false },
  { key: "featured", label: "Destacado", required: false },
  { key: "seasonal", label: "De temporada", required: false },
  { key: "status", label: "Estado", required: false },
  { key: "minimumLeadTimeHours", label: "Horas de preparación", required: false },
  { key: "branchCode", label: "Código de sucursal", required: false },
  { key: "available", label: "Disponible", required: false },
  { key: "inventory", label: "Inventario", required: false },
  { key: "minStock", label: "Stock mínimo", required: false },
  { key: "priceOverride", label: "Precio sucursal", required: false },
  { key: "salePriceOverride", label: "Oferta sucursal", required: false },
  { key: "preparationTimeMinutes", label: "Minutos de preparación", required: false },
  { key: "pickupAvailable", label: "Recogida disponible", required: false },
  { key: "deliveryAvailable", label: "Entrega disponible", required: false },
  { key: "discountType", label: "Tipo descuento", required: false },
  { key: "discountValue", label: "Valor descuento", required: false },
  { key: "discountStart", label: "Inicio promo", required: false },
  { key: "discountEnd", label: "Fin promo", required: false },
  { key: "discountBranches", label: "Sucursales promo (|)", required: false },
  { key: "crossSellSkus", label: "Cross-sell SKUs (|)", required: false },
] as const;

type Mapping = Record<string, string>;
type Mode = "products" | "inventory";

function normalizeHeader(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function readStoredMapping(): Mapping {
  try {
    const value = localStorage.getItem(MAPPING_STORAGE_KEY);
    return value ? (JSON.parse(value) as Mapping) : {};
  } catch {
    return {};
  }
}

function getInitialMapping(headers: string[]) {
  const stored = readStoredMapping();
  const result: Mapping = {};
  for (const field of IMPORT_FIELDS) {
    const savedHeader = stored[field.key];
    if (savedHeader && headers.includes(savedHeader)) {
      result[field.key] = savedHeader;
      continue;
    }
    const aliases = field.key === "inventory" ? ["quantity", "cantidad", "stock"] : [];
    const expected = [field.key, ...aliases].map(normalizeHeader);
    const match = headers.find((header) => expected.includes(normalizeHeader(header)));
    if (match) result[field.key] = match;
  }
  return result;
}

function downloadErrorsCsv(errors: Array<{ row: number; message: string }>) {
  const lines = ["fila,mensaje", ...errors.map((e) => `${e.row},"${e.message.replace(/"/g, '""')}"`)];
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "errores-importacion.csv";
  a.click();
  URL.revokeObjectURL(url);
}

export default function AdminImport() {
  const [mode, setMode] = useState<Mode>("products");
  const [csv, setCsv] = useState("");
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Mapping>({});
  const [preview, setPreview] = useState<ProductImportPreview>();
  const [inventoryPreview, setInventoryPreview] = useState<{
    rows: unknown[];
    errors: Array<{ row?: number; message?: string }>;
    valid: boolean;
  }>();
  const [result, setResult] = useState<ProductImportResult>();
  const [inventoryResult, setInventoryResult] = useState<{ imported: number; errors: Array<{ row?: number; message?: string }> }>();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [updateExisting, setUpdateExisting] = useState(true);
  const [updateFields, setUpdateFields] = useState<string[]>(UPDATE_FIELDS.map((f) => f.key));
  const [relationMode, setRelationMode] = useState<"add" | "replace">("add");
  const fileInput = useRef<HTMLInputElement>(null);
  const previewMutation = usePreviewProductImport();
  const importMutation = useImportProducts();
  const inventoryPreviewMutation = usePreviewInventoryImport();
  const inventoryImportMutation = useImportInventory();
  const jobs = useListImportJobs();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const downloadTemplate = (kind: "full" | "quick" | "inventory" | "prices") => {
    if (kind === "inventory") {
      const ws = XLSX.utils.aoa_to_sheet([
        ["sku", "branch_code", "quantity", "min_stock", "critical_stock", "auto_alert"],
        ["PAN-001", "REF", 12, 5, 2, true],
        ["PAN-001", "LOM", 7, 5, 2, true],
      ]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Inventario");
      XLSX.writeFile(wb, "plantilla_inventario_mallorca.xlsx");
      return;
    }
    if (kind === "prices") {
      const ws = XLSX.utils.aoa_to_sheet([
        ["sku", "price", "salePrice"],
        ["PAN-001", 350, 280],
      ]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Precios");
      XLSX.writeFile(wb, "plantilla_precios_mallorca.xlsx");
      return;
    }
    if (kind === "quick") {
      const ws = XLSX.utils.aoa_to_sheet([
        ["sku", "name", "categoryId", "price", "branchCode", "inventory", "status"],
        ["CRO-001", "Croissant", 2, 65, "REF", 20, "active"],
      ]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "AltaRapida");
      XLSX.writeFile(wb, "plantilla_alta_rapida_mallorca.xlsx");
      return;
    }
    const headersRow = IMPORT_FIELDS.map((f) => f.key);
    const ws = XLSX.utils.aoa_to_sheet([
      headersRow,
      ["PAN-001", "Panettone", "panettone", "Clásico", "Descripción", 350, "", 1, "", false, true, "active", 0, "REF", true, 8, 5, "", "", 60, true, true],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Productos");
    XLSX.writeFile(wb, "plantilla_productos_mallorca.xlsx");
  };

  const readFile = async (file: File) => {
    try {
      setFileName(file.name);
      setPreview(undefined);
      setInventoryPreview(undefined);
      setResult(undefined);
      setInventoryResult(undefined);
      let content: string;
      if (file.name.toLowerCase().endsWith(".xlsx")) {
        const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        if (!firstSheet) throw new Error("El archivo no contiene hojas.");
        content = XLSX.utils.sheet_to_csv(firstSheet, { blankrows: false });
      } else {
        content = await file.text();
      }
      const workbook = XLSX.read(content, { type: "string" });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = firstSheet
        ? (XLSX.utils.sheet_to_json<unknown[]>(firstSheet, { header: 1, blankrows: false }) as unknown[][])
        : [];
      const fileHeaders = (rows[0] ?? []).map(String).filter(Boolean);
      if (!fileHeaders.length) throw new Error("El archivo no contiene encabezados.");
      setCsv(content);
      setHeaders(fileHeaders);
      setMapping(getInitialMapping(fileHeaders));
      setStep(2);
    } catch (error) {
      setCsv("");
      toast({
        title: "No se pudo leer el archivo",
        description: error instanceof Error ? error.message : "Verifica el formato CSV o XLSX.",
        variant: "destructive",
      });
    }
  };

  const updateMapping = (key: string, value: string) => {
    const next = { ...mapping };
    if (value) next[key] = value;
    else delete next[key];
    setMapping(next);
    localStorage.setItem(MAPPING_STORAGE_KEY, JSON.stringify(next));
  };

  const previewImport = () => {
    if (mode === "inventory") {
      inventoryPreviewMutation.mutate(
        { data: { csv } },
        {
          onSuccess: (data) => setInventoryPreview(data as any),
          onError: () => toast({ title: "No se pudo validar inventario", variant: "destructive" }),
        },
      );
      return;
    }
    if (!mapping.sku) {
      toast({ title: "Selecciona la columna SKU", variant: "destructive" });
      return;
    }
    previewMutation.mutate(
      {
        data: {
          csv,
          mapping,
          updateExisting,
          updateFields: updateExisting ? updateFields : undefined,
          relationMode,
        },
      },
      {
        onSuccess: (data) => setPreview(data),
        onError: () => toast({ title: "No se pudo validar el archivo", variant: "destructive" }),
      },
    );
  };

  const confirmImport = () => {
    if (mode === "inventory") {
      inventoryImportMutation.mutate(
        { data: { csv, filename: fileName, idempotencyKey: `inv-${fileName}-${csv.length}` } },
        {
          onSuccess: (data) => {
            void queryClient.invalidateQueries({ queryKey: getListAdminInventoryQueryKey() });
            void queryClient.invalidateQueries({ queryKey: getListImportJobsQueryKey() });
            setInventoryResult(data as any);
            setStep(3);
            toast({ title: "Inventario importado", description: `${data.imported} filas.` });
          },
          onError: (err: any) => {
            const payload = err?.data ?? err?.response?.data;
            if (payload?.errors) {
              setInventoryResult({ imported: 0, errors: payload.errors });
              setStep(3);
            }
            toast({ title: "Error al importar inventario", variant: "destructive" });
          },
        },
      );
      return;
    }
    if (!preview?.rows.length) return;
    importMutation.mutate(
      {
        data: {
          csv,
          mapping,
          updateExisting,
          updateFields: updateExisting ? updateFields : undefined,
          relationMode,
          filename: fileName,
          idempotencyKey: `prod-${fileName}-${csv.length}`,
        },
      },
      {
        onSuccess: (data) => {
          void queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() });
          void queryClient.invalidateQueries({ queryKey: getListAdminProductsQueryKey() });
          void queryClient.invalidateQueries({ queryKey: getGetAdminSummaryQueryKey() });
          void queryClient.invalidateQueries({ queryKey: getListImportJobsQueryKey() });
          setResult(data);
          setStep(3);
          toast({
            title: data.errors.length ? "Importación parcial" : "Importación completada",
            description: `${data.created} creados · ${data.updated} actualizados`,
          });
        },
        onError: () => toast({ title: "No se pudo completar la importación", variant: "destructive" }),
      },
    );
  };

  const reset = () => {
    setCsv("");
    setFileName("");
    setHeaders([]);
    setMapping({});
    setPreview(undefined);
    setInventoryPreview(undefined);
    setResult(undefined);
    setInventoryResult(undefined);
    setStep(1);
    if (fileInput.current) fileInput.current.value = "";
  };

  return (
    <AdminLayout>
      <div className="flex-1 overflow-auto bg-[#FBFAF7] dark:bg-background">
        <div className="max-w-5xl w-full mx-auto p-8 space-y-8 mt-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-3xl font-serif tracking-tight">Importar</h1>
              <p className="mt-2 text-muted-foreground text-sm">
                Productos por SKU o inventario por sucursal. Sin duplicados silenciosos.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" className="rounded-none" onClick={() => downloadTemplate("full")}>
                Plantilla completa
              </Button>
              <Button variant="outline" className="rounded-none" onClick={() => downloadTemplate("quick")}>
                Alta rápida
              </Button>
              <Button variant="outline" className="rounded-none" onClick={() => downloadTemplate("inventory")}>
                Inventario
              </Button>
              <Button variant="outline" className="rounded-none" onClick={() => downloadTemplate("prices")}>
                Precios
              </Button>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              className={cn("px-3 py-1.5 text-sm border", mode === "products" ? "bg-primary text-primary-foreground border-primary" : "bg-background")}
              onClick={() => { setMode("products"); reset(); }}
            >
              Productos
            </button>
            <button
              type="button"
              className={cn("px-3 py-1.5 text-sm border", mode === "inventory" ? "bg-primary text-primary-foreground border-primary" : "bg-background")}
              onClick={() => { setMode("inventory"); reset(); }}
            >
              Inventario
            </button>
          </div>

          <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground">
            <span className={step >= 1 ? "text-[#D43B2B] font-bold" : ""}>1. Archivo</span>
            <ChevronRight className="w-4 h-4" />
            <span className={step >= 2 ? "text-[#D43B2B] font-bold" : ""}>2. Validación</span>
            <ChevronRight className="w-4 h-4" />
            <span className={step >= 3 ? "text-[#D43B2B] font-bold" : ""}>3. Resultado</span>
          </div>

          <div className="bg-white dark:bg-card border border-border">
            {step === 1 && (
              <div className="p-10 text-center">
                <div className="mx-auto mb-5 w-16 h-16 rounded-full bg-muted flex items-center justify-center">
                  <FileUp className="w-7 h-7" />
                </div>
                <h2 className="text-xl font-serif">
                  {mode === "products" ? "Sube catálogo CSV/XLSX" : "Sube inventario sku,branch_code,quantity"}
                </h2>
                <input
                  ref={fileInput}
                  type="file"
                  accept=".csv,.xlsx"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void readFile(file);
                  }}
                />
                <Button onClick={() => fileInput.current?.click()} className="mt-7 rounded-none h-12 px-8">
                  Seleccionar archivo
                </Button>
              </div>
            )}

            {step === 2 && (
              <div className="p-8 space-y-6">
                <div className="flex justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-serif">Validación</h2>
                    <p className="text-sm text-muted-foreground">{fileName}</p>
                  </div>
                  <Button variant="outline" className="rounded-none" onClick={reset}>
                    Otro archivo
                  </Button>
                </div>

                {mode === "products" ? (
                  <>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {IMPORT_FIELDS.map((field) => (
                        <label key={field.key} className="flex items-center gap-3 text-sm">
                          <span className="w-40 shrink-0">
                            {field.label}
                            {field.required ? " *" : ""}
                          </span>
                          <select
                            value={mapping[field.key] ?? ""}
                            onChange={(e) => updateMapping(field.key, e.target.value)}
                            className="h-9 flex-1 border border-input bg-background px-2 text-sm"
                          >
                            <option value="">No importar</option>
                            {headers.map((header) => (
                              <option key={header} value={header}>{header}</option>
                            ))}
                          </select>
                        </label>
                      ))}
                    </div>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={updateExisting}
                        onChange={(e) => setUpdateExisting(e.target.checked)}
                      />
                      Actualizar productos existentes (clave = SKU)
                    </label>
                    {updateExisting ? (
                      <div className="border border-border p-4 space-y-2">
                        <p className="text-sm font-medium">Campos a actualizar</p>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                          {UPDATE_FIELDS.map((field) => (
                            <label key={field.key} className="flex items-center gap-2 text-sm">
                              <input
                                type="checkbox"
                                checked={updateFields.includes(field.key)}
                                onChange={(e) => {
                                  setUpdateFields((prev) =>
                                    e.target.checked
                                      ? [...prev, field.key]
                                      : prev.filter((k) => k !== field.key),
                                  );
                                }}
                              />
                              {field.label}
                            </label>
                          ))}
                        </div>
                        <div className="pt-3 space-y-2">
                          <p className="text-sm font-medium">Modo de relaciones (categorías / etiquetas / cross-sell)</p>
                          <label className="flex items-center gap-2 text-sm">
                            <input
                              type="radio"
                              name="relationMode"
                              checked={relationMode === "add"}
                              onChange={() => setRelationMode("add")}
                            />
                            Añadir a existentes (recomendado)
                          </label>
                          <label className="flex items-center gap-2 text-sm">
                            <input
                              type="radio"
                              name="relationMode"
                              checked={relationMode === "replace"}
                              onChange={() => setRelationMode("replace")}
                            />
                            Reemplazar existentes
                          </label>
                        </div>
                      </div>
                    ) : null}
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Formato esperado: <code>sku,branch_code,quantity[,min_stock]</code>
                  </p>
                )}

                <div className="flex justify-end">
                  <Button className="rounded-none" onClick={previewImport} disabled={previewMutation.isPending || inventoryPreviewMutation.isPending}>
                    Previsualizar
                  </Button>
                </div>

                {preview && mode === "products" ? (
                  <div className="space-y-4 border-t pt-6">
                    <div className="flex flex-wrap gap-3 text-sm">
                      <span className="px-3 py-1.5 border">{preview.rows.length} filas válidas</span>
                      <span className="px-3 py-1.5 border border-emerald-200 bg-emerald-50">
                        {preview.rows.filter((r) => r.action === "new").length} crear
                      </span>
                      <span className="px-3 py-1.5 border border-blue-200 bg-blue-50">
                        {preview.rows.filter((r) => r.action === "update").length} actualizar
                      </span>
                      <span className="px-3 py-1.5 border border-red-200 bg-red-50">
                        {preview.errors.length} errores
                      </span>
                    </div>
                    <div className="max-h-64 overflow-auto border">
                      <table className="w-full text-sm">
                        <thead className="bg-muted/40 sticky top-0">
                          <tr>
                            <th className="p-2 text-left">Fila</th>
                            <th className="p-2 text-left">SKU</th>
                            <th className="p-2 text-left">Producto</th>
                            <th className="p-2 text-left">Acción</th>
                            <th className="p-2 text-left">Resultado</th>
                          </tr>
                        </thead>
                        <tbody>
                          {preview.rows.map((row) => (
                            <tr key={`${row.row}-${row.sku}`} className="border-t">
                              <td className="p-2 font-mono">{row.row}</td>
                              <td className="p-2">{row.sku}</td>
                              <td className="p-2">{row.name || "—"}</td>
                              <td className="p-2">{row.action === "new" ? "Crear" : "Actualizar"}</td>
                              <td className="p-2 text-emerald-700">OK</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {preview.errors.length > 0 ? (
                      <div className="space-y-2">
                        <div className="flex justify-between items-center">
                          <h4 className="text-sm font-semibold text-destructive flex items-center gap-2">
                            <AlertCircle className="w-4 h-4" /> Errores
                          </h4>
                          <Button variant="outline" size="sm" className="rounded-none" onClick={() => downloadErrorsCsv(preview.errors)}>
                            <Download className="w-4 h-4 mr-1" /> Descargar errores
                          </Button>
                        </div>
                        {preview.errors.map((error, index) => (
                          <div key={`${error.row}-${index}`} className="text-sm text-destructive">
                            Fila {error.row}: {error.message}
                          </div>
                        ))}
                      </div>
                    ) : null}
                    <div className="flex justify-end">
                      <Button className="rounded-none" disabled={!preview.rows.length || importMutation.isPending} onClick={confirmImport}>
                        Confirmar importación
                      </Button>
                    </div>
                  </div>
                ) : null}

                {inventoryPreview && mode === "inventory" ? (
                  <div className="space-y-4 border-t pt-6">
                    <p className="text-sm">
                      {inventoryPreview.rows.length} filas · {inventoryPreview.errors.length} errores ·{" "}
                      {inventoryPreview.valid ? "válido" : "con problemas"}
                    </p>
                    {(inventoryPreview.rows as any[]).some((row) => row.willTriggerAlert) ? (
                      <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                        {(inventoryPreview.rows as any[]).filter((row) => row.willTriggerAlert).length} fila(s)
                        generarán alerta automática al confirmar (p. ej. stock bajo/crítico/agotado).
                      </div>
                    ) : null}
                    {inventoryPreview.errors.length > 0 ? (
                      <div className="space-y-1">
                        <Button
                          variant="outline"
                          size="sm"
                          className="rounded-none"
                          onClick={() =>
                            downloadErrorsCsv(
                              inventoryPreview.errors.map((e) => ({
                                row: Number(e.row ?? 0),
                                message: String(e.message ?? ""),
                              })),
                            )
                          }
                        >
                          Descargar errores
                        </Button>
                        {inventoryPreview.errors.map((error, index) => (
                          <div key={index} className="text-sm text-destructive">
                            Fila {String(error.row)}: {String(error.message)}
                          </div>
                        ))}
                      </div>
                    ) : null}
                    <Button
                      className="rounded-none"
                      disabled={!inventoryPreview.valid || inventoryImportMutation.isPending}
                      onClick={confirmImport}
                    >
                      Confirmar inventario
                    </Button>
                  </div>
                ) : null}
              </div>
            )}

            {step === 3 && (result || inventoryResult) ? (
              <div className="p-10 space-y-6">
                <div className="text-center">
                  <CheckCircle2 className="w-12 h-12 mx-auto text-emerald-600 mb-4" />
                  <h2 className="text-2xl font-serif">Importación completada</h2>
                </div>
                {result ? (
                  <div className="grid grid-cols-3 gap-4 max-w-xl mx-auto">
                    <div className="p-4 text-center border"><div className="text-2xl">{result.created}</div><div className="text-xs">Creados</div></div>
                    <div className="p-4 text-center border"><div className="text-2xl">{result.updated}</div><div className="text-xs">Actualizados</div></div>
                    <div className="p-4 text-center border"><div className="text-2xl">{result.errors.length}</div><div className="text-xs">Errores</div></div>
                  </div>
                ) : null}
                {inventoryResult ? (
                  <p className="text-center">{inventoryResult.imported} filas de inventario actualizadas.</p>
                ) : null}
                {(result?.errors.length || inventoryResult?.errors.length) ? (
                  <div className="flex justify-center">
                    <Button
                      variant="outline"
                      className="rounded-none"
                      onClick={() =>
                        downloadErrorsCsv(
                          (result?.errors ??
                            inventoryResult?.errors.map((e) => ({
                              row: Number(e.row ?? 0),
                              message: String(e.message ?? ""),
                            })) ??
                            []) as Array<{ row: number; message: string }>,
                        )
                      }
                    >
                      Descargar errores
                    </Button>
                  </div>
                ) : null}
                <div className="flex justify-center">
                  <Button className="rounded-none" onClick={reset}>
                    <RefreshCcw className="w-4 h-4 mr-2" /> Otra importación
                  </Button>
                </div>
              </div>
            ) : null}
          </div>

          <div className="border border-border bg-background p-5 space-y-3">
            <h3 className="font-medium">Historial de importaciones</h3>
            {!jobs.data?.length ? (
              <p className="text-sm text-muted-foreground">Aún no hay jobs registrados.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="text-left py-2">Fecha</th>
                      <th className="text-left py-2">Tipo</th>
                      <th className="text-left py-2">Archivo</th>
                      <th className="text-left py-2">Estado</th>
                      <th className="text-left py-2">Creados</th>
                      <th className="text-left py-2">Actualizados</th>
                      <th className="text-left py-2">Errores</th>
                    </tr>
                  </thead>
                  <tbody>
                    {jobs.data.map((job) => (
                      <tr key={job.id} className="border-t">
                        <td className="py-2">{new Date(job.createdAt).toLocaleString("es-MX")}</td>
                        <td className="py-2">{job.type}</td>
                        <td className="py-2">{job.filename || "—"}</td>
                        <td className="py-2">{job.status}</td>
                        <td className="py-2">{job.createdCount}</td>
                        <td className="py-2">{job.updatedCount}</td>
                        <td className="py-2">{job.errorCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
