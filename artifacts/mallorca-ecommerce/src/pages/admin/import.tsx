import { useRef, useState } from "react";
import * as XLSX from "xlsx";
import { AdminLayout } from "@/components/layout/admin-layout";
import { Button } from "@/components/ui/button";
import {
  getListAdminProductsQueryKey,
  getListProductsQueryKey,
  getGetAdminSummaryQueryKey,
  useImportProducts,
  usePreviewProductImport,
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

const MAPPING_STORAGE_KEY = "mallorca_product_import_mapping";

const IMPORT_FIELDS = [
  { key: "sku", label: "SKU", required: true },
  { key: "name", label: "Nombre", required: false },
  { key: "slug", label: "Slug", required: false },
  { key: "shortDescription", label: "Descripción corta", required: false },
  { key: "description", label: "Descripción", required: false },
  { key: "price", label: "Precio", required: false },
  { key: "salePrice", label: "Precio oferta", required: false },
  { key: "categoryId", label: "ID de categoría", required: false },
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
] as const;

const TEMPLATE_HEADERS = IMPORT_FIELDS.map((field) => field.key);
const TEMPLATE_ROWS = [
  TEMPLATE_HEADERS,
  [
    "PAN-001",
    "Pan de masa madre",
    "pan-de-masa-madre",
    "Pan artesanal",
    "Pan de masa madre horneado cada mañana",
    95,
    "",
    1,
    "",
    false,
    false,
    "active",
    0,
    "CENTRO",
    true,
    20,
    5,
    "",
    "",
    15,
    true,
    true,
  ],
  [
    "PAN-001",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "REFORMA",
    true,
    12,
    3,
    "",
    "",
    "",
    true,
    true,
  ],
];

const FIELD_ALIASES: Record<string, string[]> = {
  inventory: ["quantity", "cantidad", "stock"],
};

type Mapping = Record<string, string>;
type PreviewRow = ProductImportPreview["rows"][number];

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
    const expected = [field.key, ...(FIELD_ALIASES[field.key] ?? [])].map(normalizeHeader);
    const match = headers.find((header) => expected.includes(normalizeHeader(header)));
    if (match) result[field.key] = match;
  }
  return result;
}

export default function AdminImport() {
  const [csv, setCsv] = useState("");
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Mapping>({});
  const [preview, setPreview] = useState<ProductImportPreview>();
  const [result, setResult] = useState<ProductImportResult>();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const fileInput = useRef<HTMLInputElement>(null);
  const previewMutation = usePreviewProductImport();
  const importMutation = useImportProducts();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const downloadTemplate = () => {
    const ws = XLSX.utils.aoa_to_sheet(TEMPLATE_ROWS);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Productos");
    XLSX.writeFile(wb, "plantilla_productos_mallorca.xlsx");
  };

  const readFile = async (file: File) => {
    try {
      setFileName(file.name);
      setPreview(undefined);
      setResult(undefined);
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
    if (!mapping.sku) {
      toast({ title: "Selecciona la columna SKU", variant: "destructive" });
      return;
    }
    localStorage.setItem(MAPPING_STORAGE_KEY, JSON.stringify(mapping));
    previewMutation.mutate(
      { data: { csv, mapping } },
      {
        onSuccess: (data) => setPreview(data),
        onError: () =>
          toast({
            title: "No se pudo validar el archivo",
            description: "Revisa el formato y el mapeo de columnas.",
            variant: "destructive",
          }),
      },
    );
  };

  const confirmImport = () => {
    if (!preview?.rows.length) return;
    importMutation.mutate(
      { data: { csv, mapping } },
      {
        onSuccess: (data) => {
          void queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() });
          void queryClient.invalidateQueries({ queryKey: getListAdminProductsQueryKey() });
          void queryClient.invalidateQueries({ queryKey: getGetAdminSummaryQueryKey() });
          setResult(data);
          setStep(3);
          toast({
            title: data.errors.length ? "Importación parcial completada" : "Importación completada",
            description: `${data.created} nuevos y ${data.updated} actualizados.`,
          });
        },
        onError: () =>
          toast({
            title: "No se pudo completar la importación",
            description: "El archivo no pudo procesarse.",
            variant: "destructive",
          }),
      },
    );
  };

  const reset = () => {
    setCsv("");
    setFileName("");
    setHeaders([]);
    setMapping({});
    setPreview(undefined);
    setResult(undefined);
    setStep(1);
    if (fileInput.current) fileInput.current.value = "";
  };

  return (
    <AdminLayout>
      <div className="flex-1 flex flex-col h-full overflow-auto bg-[#FBFAF7] dark:bg-background">
        <div className="max-w-5xl w-full mx-auto p-8 space-y-8 mt-4">
          <div className="flex items-start justify-between gap-6">
            <div>
              <h1 className="text-3xl font-serif text-[#25211E] dark:text-foreground tracking-tight">
                Importar productos
              </h1>
              <p className="mt-2 text-muted-foreground">
                Crea o actualiza el catálogo por SKU y configura existencias por sucursal.
              </p>
            </div>
            <Button variant="outline" onClick={downloadTemplate} className="rounded-none shrink-0">
              <Download className="w-4 h-4 mr-2" />
              Descargar plantilla
            </Button>
          </div>

          <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground">
            <span className={step >= 1 ? "text-[#D43B2B] font-bold" : ""}>1. Archivo</span>
            <ChevronRight className="w-4 h-4" />
            <span className={step >= 2 ? "text-[#D43B2B] font-bold" : ""}>2. Mapeo y revisión</span>
            <ChevronRight className="w-4 h-4" />
            <span className={step >= 3 ? "text-[#D43B2B] font-bold" : ""}>3. Resultado</span>
          </div>

          <div className="bg-white dark:bg-card border border-[#E8DED0] dark:border-border">
            {step === 1 && (
              <div className="p-10 text-center">
                <div className="mx-auto mb-5 w-16 h-16 rounded-full bg-[#F5F0E8] dark:bg-muted flex items-center justify-center text-[#4B3028] dark:text-foreground">
                  <FileUp className="w-7 h-7" />
                </div>
                <h2 className="text-xl font-serif text-[#25211E] dark:text-foreground">Sube tu catálogo</h2>
                <p className="text-sm text-muted-foreground mt-2 max-w-lg mx-auto">
                  Acepta CSV y XLSX. Puedes incluir una fila por sucursal para el mismo SKU; el producto se creará una sola vez.
                </p>
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
                <Button onClick={() => fileInput.current?.click()} className="mt-7 rounded-none bg-[#D43B2B] hover:bg-[#B83225] text-white h-12 px-8">
                  Seleccionar CSV o XLSX
                </Button>
                <p className="text-xs text-muted-foreground mt-4">La plantilla incluye campos de producto y sucursal.</p>
              </div>
            )}

            {step === 2 && (
              <div className="p-8 space-y-7">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E8DED0] dark:border-border pb-5">
                  <div>
                    <h2 className="text-xl font-serif text-[#25211E] dark:text-foreground">Mapea las columnas</h2>
                    <p className="text-sm text-muted-foreground mt-1">
                      {fileName} · El mapeo se guarda para la próxima importación.
                    </p>
                  </div>
                  <Button variant="outline" onClick={reset} className="rounded-none">Elegir otro archivo</Button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3">
                  {IMPORT_FIELDS.map((field) => (
                    <label key={field.key} className="flex items-center gap-3 text-sm">
                      <span className="w-44 shrink-0 text-[#4B3028] dark:text-foreground">
                        {field.label}
                        {field.required ? <span className="text-[#D43B2B]"> *</span> : null}
                      </span>
                      <select
                        value={mapping[field.key] ?? ""}
                        onChange={(event) => updateMapping(field.key, event.target.value)}
                        className="h-9 min-w-0 flex-1 border border-input bg-background px-2 text-sm rounded-md"
                      >
                        <option value="">No importar</option>
                        {headers.map((header) => (
                          <option key={header} value={header}>{header}</option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>

                <div className="flex justify-end border-t border-[#E8DED0] dark:border-border pt-5">
                  <Button
                    onClick={previewImport}
                    disabled={!mapping.sku || previewMutation.isPending}
                    className="rounded-none bg-[#D43B2B] hover:bg-[#B83225] text-white h-11 px-7"
                  >
                    {previewMutation.isPending ? "Validando..." : "Previsualizar importación"}
                    {!previewMutation.isPending && <ChevronRight className="w-4 h-4 ml-2" />}
                  </Button>
                </div>

                {preview && (
                  <div className="space-y-5 border-t border-[#E8DED0] dark:border-border pt-6">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <h3 className="text-lg font-serif text-[#25211E] dark:text-foreground">Revisión de filas válidas</h3>
                        <p className="text-sm text-muted-foreground">Las filas con error se omitirán; las demás sí se importarán.</p>
                      </div>
                      <div className="flex gap-3 text-sm">
                        <span className="px-3 py-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200">{preview.rows.filter((row) => row.action === "new").length} nuevos</span>
                        <span className="px-3 py-1.5 bg-blue-50 text-blue-700 border border-blue-200">{preview.rows.filter((row) => row.action === "update").length} actualizaciones</span>
                      </div>
                    </div>

                    {preview.rows.length > 0 && (
                      <div className="border border-[#E8DED0] dark:border-border max-h-64 overflow-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-[#FBFAF7] dark:bg-muted/30 text-left sticky top-0">
                            <tr><th className="p-3">Fila</th><th className="p-3">SKU</th><th className="p-3">Nombre</th><th className="p-3">Sucursal</th><th className="p-3">Acción</th></tr>
                          </thead>
                          <tbody>
                            {preview.rows.map((row: PreviewRow) => (
                              <tr key={`${row.row}-${row.sku}-${row.branchCode}`} className="border-t border-[#E8DED0] dark:border-border">
                                <td className="p-3 font-mono">{row.row}</td>
                                <td className="p-3 font-medium">{row.sku}</td>
                                <td className="p-3">{row.name || "—"}</td>
                                <td className="p-3">{row.branchCode || "Todas / sin configurar"}</td>
                                <td className="p-3">{row.action === "new" ? "Nuevo" : "Actualizar"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {preview.errors.length > 0 && (
                      <div className="space-y-2 border border-destructive/20 bg-destructive/5 p-4 max-h-56 overflow-y-auto">
                        <h4 className="text-sm font-semibold text-destructive flex items-center gap-2">
                          <AlertCircle className="w-4 h-4" /> {preview.errors.length} filas con error
                        </h4>
                        {preview.errors.map((error, index) => (
                          <div key={`${error.row}-${index}`} className="text-sm text-destructive flex gap-3">
                            <span className="font-mono bg-destructive/10 px-1.5 py-0.5 rounded text-xs min-w-[52px] text-center">Fila {error.row}</span>
                            <span>{error.message}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="flex justify-end pt-2">
                      <Button
                        disabled={!preview.rows.length || importMutation.isPending}
                        onClick={confirmImport}
                        className="rounded-none bg-[#4B3028] hover:bg-[#25211E] text-white h-11 px-8"
                      >
                        {importMutation.isPending ? "Importando..." : "Importar filas válidas"}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {step === 3 && result && (
              <div className="p-10">
                <div className="text-center">
                  <div className="w-20 h-20 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-6 border border-emerald-200">
                    <CheckCircle2 className="w-10 h-10" />
                  </div>
                  <h2 className="text-2xl font-serif text-[#25211E] dark:text-foreground">Importación procesada</h2>
                  <p className="text-muted-foreground mt-2">Los cambios ya se reflejan en el catálogo y las sucursales.</p>
                </div>
                <div className="grid grid-cols-3 gap-4 max-w-xl mx-auto mt-8">
                  <div className="p-4 text-center bg-emerald-50 border border-emerald-200"><div className="text-2xl font-serif text-emerald-700">{result.created}</div><div className="text-xs text-emerald-800">Nuevos</div></div>
                  <div className="p-4 text-center bg-blue-50 border border-blue-200"><div className="text-2xl font-serif text-blue-700">{result.updated}</div><div className="text-xs text-blue-800">Actualizados</div></div>
                  <div className="p-4 text-center bg-red-50 border border-red-200"><div className="text-2xl font-serif text-red-700">{result.errors.length}</div><div className="text-xs text-red-800">Con error</div></div>
                </div>
                {result.errors.length > 0 && (
                  <div className="mt-8 space-y-2 border border-destructive/20 bg-destructive/5 p-4 max-h-56 overflow-y-auto">
                    <h4 className="text-sm font-semibold text-destructive">Filas omitidas</h4>
                    {result.errors.map((error, index) => (
                      <div key={`${error.row}-${index}`} className="text-sm text-destructive">Fila {error.row}: {error.message}</div>
                    ))}
                  </div>
                )}
                <div className="flex justify-center mt-8">
                  <Button onClick={reset} className="rounded-none bg-[#4B3028] hover:bg-[#25211E] text-white h-11 px-7">
                    <RefreshCcw className="w-4 h-4 mr-2" /> Realizar otra importación
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}