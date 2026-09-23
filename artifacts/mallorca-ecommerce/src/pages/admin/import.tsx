import { useEffect, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { AdminLayout } from "@/components/layout/admin-layout";
import { Button } from "@/components/ui/button";
import {
  getListAdminProductsQueryKey,
  getListProductsQueryKey,
  getGetAdminSummaryQueryKey,
  getListAdminInventoryQueryKey,
  getListImportJobsQueryKey,
  getGetInventoryMatrixQueryKey,
  useImportProducts,
  usePreviewProductImport,
  type ProductImportPreview,
  type ProductImportResult,
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { FileUp } from "lucide-react";

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
  {
    key: "minimumLeadTimeHours",
    label: "Horas de preparación",
    required: false,
  },
  { key: "branchCode", label: "Código de sucursal", required: false },
  { key: "available", label: "Disponible", required: false },
  { key: "inventory", label: "Inventario", required: false },
  { key: "minStock", label: "Stock mínimo", required: false },
  { key: "criticalStock", label: "Stock crítico", required: false },
  { key: "autoAlertEnabled", label: "Alertas automáticas", required: false },
  { key: "priceOverride", label: "Precio sucursal", required: false },
  { key: "salePriceOverride", label: "Oferta sucursal", required: false },
  {
    key: "preparationTimeMinutes",
    label: "Minutos de preparación",
    required: false,
  },
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
    const aliases =
      field.key === "inventory"
        ? ["quantity", "cantidad", "stock"]
        : field.key === "autoAlertEnabled"
          ? ["auto_alert"]
          : [];
    const expected = [field.key, ...aliases].map(normalizeHeader);
    const match = headers.find((header) =>
      expected.includes(normalizeHeader(header)),
    );
    if (match) result[field.key] = match;
  }
  return result;
}

function downloadErrorsCsv(errors: Array<{ row: number; message: string }>) {
  const lines = [
    "fila,mensaje",
    ...errors.map((e) => `${e.row},"${e.message.replace(/"/g, '""')}"`),
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "errores-importacion.csv";
  a.click();
  URL.revokeObjectURL(url);
}

export default function AdminImport({
  embedded = false,
}: {
  embedded?: boolean;
}) {
  const [csv, setCsv] = useState("");
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Mapping>({});
  const [preview, setPreview] = useState<ProductImportPreview>();
  const [result, setResult] = useState<ProductImportResult>();
  const [updateFields, setUpdateFields] = useState<string[]>(
    UPDATE_FIELDS.map((f) => f.key),
  );
  const [requestKey, setRequestKey] = useState(() => crypto.randomUUID());
  const fileInput = useRef<HTMLInputElement>(null);
  const previewMutation = usePreviewProductImport();
  const importMutation = useImportProducts();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const revision = useRef(0);
  const busy = previewMutation.isPending || importMutation.isPending;
  useEffect(() => {
    revision.current++;
    setPreview(undefined);
    setRequestKey(crypto.randomUUID());
  }, [csv, mapping, updateFields]);

  const downloadTemplate = () => {
    const fields = IMPORT_FIELDS.map((f) => f.key);
    const example: Record<string, unknown> = {
      sku: "EJEMPLO-001",
      name: "Producto de ejemplo",
      slug: "producto-de-ejemplo",
      price: 100,
      categoryId: 1,
      status: "draft",
      branchCode: "REF",
      available: true,
      inventory: 10,
      minStock: 5,
      criticalStock: 2,
      autoAlertEnabled: true,
      pickupAvailable: true,
      deliveryAvailable: true,
    };
    const sheet = XLSX.utils.aoa_to_sheet([
      fields,
      fields.map((key) => example[key] ?? ""),
    ]);
    sheet["!cols"] = fields.map((key) => ({
      wch: Math.max(18, key.length + 2),
    }));
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, "Productos");
    XLSX.writeFile(book, "plantilla_productos_inventario.xlsx");
  };
  const readFile = async (file: File) => {
    setPreview(undefined);
    setResult(undefined);
    setCsv("");
    try {
      const book = XLSX.read(await file.arrayBuffer(), {
        type: "array",
        raw: true,
      });
      const sheet = book.Sheets[book.SheetNames[0]];
      if (!sheet) throw new Error("El archivo no contiene hojas.");
      const rows = XLSX.utils.sheet_to_json<string[]>(sheet, {
        header: 1,
        blankrows: false,
        raw: false,
      });
      const columns = (rows[0] ?? []).map(String);
      if (
        !columns.length ||
        columns.some((c) => !c.trim()) ||
        new Set(columns).size !== columns.length
      )
        throw new Error(
          "Revisa los encabezados: deben ser únicos y no estar vacíos.",
        );
      setCsv(XLSX.utils.sheet_to_csv(sheet, { blankrows: false }));
      setHeaders(columns);
      setMapping(getInitialMapping(columns));
      setFileName(file.name);
    } catch (error) {
      toast({
        title: "No se pudo leer el archivo",
        description: String(error),
        variant: "destructive",
      });
    }
  };
  const validate = async () => {
    const current = revision.current;
    setPreview(undefined);
    try {
      const data = await previewMutation.mutateAsync({
        data: {
          csv,
          mapping,
          updateExisting: true,
          updateFields,
          relationMode: "add",
        },
      });
      if (current === revision.current) setPreview(data);
    } catch {
      toast({ title: "No se pudo validar el archivo", variant: "destructive" });
    }
  };
  const confirm = async () => {
    if (!preview?.rows.length || preview.errors.length || busy) return;
    try {
      const data = await importMutation.mutateAsync({
        data: {
          csv,
          mapping,
          updateExisting: true,
          updateFields,
          relationMode: "add",
          filename: fileName,
          idempotencyKey: requestKey,
        },
      });
      setResult(data);
      setPreview(undefined);
      await Promise.all(
        [
          getListProductsQueryKey(),
          getListAdminProductsQueryKey(),
          getListAdminInventoryQueryKey(),
          getGetInventoryMatrixQueryKey(),
          getGetAdminSummaryQueryKey(),
          getListImportJobsQueryKey(),
        ].map((queryKey) => queryClient.invalidateQueries({ queryKey })),
      );
      toast({
        title: data.errors.length
          ? "Importación con errores"
          : "Productos y existencias actualizados",
      });
    } catch {
      toast({
        title: "No se pudo importar. Puedes reintentar.",
        variant: "destructive",
      });
    }
  };
  const content = (
    <div className="space-y-5 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-serif">
            Un archivo para productos e inventario
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Exporta, modifica y vuelve a importar el mismo CSV o Excel. Usa una
            fila por SKU y sucursal; repetir el SKU en sucursales distintas no
            duplica el producto.
          </p>
        </div>
        <Button variant="outline" onClick={downloadTemplate}>
          Descargar plantilla única
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        Para nuevos productos completa nombre, precio y categoría, y utiliza un
        código de sucursal existente. Solo se actualizan las columnas con
        valores; una celda vacía conserva el dato actual.
      </p>
      <input
        ref={fileInput}
        type="file"
        accept=".csv,.xlsx"
        className="sr-only"
        aria-label="Archivo de productos e inventario"
        disabled={busy}
        onChange={(e) => {
          if (e.target.files?.[0]) void readFile(e.target.files[0]);
        }}
      />
      <Button disabled={busy} onClick={() => fileInput.current?.click()}>
        <FileUp className="mr-2 h-4 w-4" />
        {csv ? "Elegir otro archivo" : "Seleccionar CSV o Excel"}
      </Button>
      {csv && !result && (
        <>
          <p className="text-sm font-medium">{fileName}</p>
          <fieldset disabled={busy} className="space-y-4">
            <details className="border p-3">
              <summary className="cursor-pointer text-sm font-medium">
                Revisar columnas ({Object.keys(mapping).length} reconocidas)
              </summary>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {IMPORT_FIELDS.map((field) => (
                  <label key={field.key} className="min-w-0 text-sm">
                    {field.label}
                    <select
                      className="mt-1 h-9 w-full border bg-background px-2"
                      value={mapping[field.key] ?? ""}
                      onChange={(e) => {
                        const next = { ...mapping };
                        if (e.target.value) next[field.key] = e.target.value;
                        else next[field.key] = "";
                        setMapping(next);
                      }}
                    >
                      <option value="">No importar</option>
                      {headers.map((header) => (
                        <option key={header}>{header}</option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
            </details>
            <details className="border p-3">
              <summary className="cursor-pointer text-sm font-medium">
                Datos a actualizar
              </summary>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {UPDATE_FIELDS.map((field) => (
                  <label
                    key={field.key}
                    className="flex items-center gap-2 text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={updateFields.includes(field.key)}
                      onChange={(e) =>
                        setUpdateFields((prev) =>
                          e.target.checked
                            ? [...prev, field.key]
                            : prev.filter((key) => key !== field.key),
                        )
                      }
                    />
                    {field.label}
                  </label>
                ))}
              </div>
            </details>
          </fieldset>
          <Button
            onClick={validate}
            disabled={busy || !mapping.sku || !updateFields.length}
          >
            {previewMutation.isPending ? "Validando…" : "Validar archivo"}
          </Button>
        </>
      )}
      {preview && (
        <div className="space-y-3 border-t pt-4">
          <p className="text-sm">
            {
              new Set(
                preview.rows
                  .filter((r) => r.action === "new")
                  .map((r) => r.sku),
              ).size
            }{" "}
            productos nuevos ·{" "}
            {
              new Set(
                preview.rows
                  .filter((r) => r.action === "update")
                  .map((r) => r.sku),
              ).size
            }{" "}
            productos a actualizar · {preview.rows.length} filas ·{" "}
            {preview.errors.length} errores
          </p>
          <div className="max-h-64 overflow-auto border">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  {["Fila", "SKU", "Producto", "Acción"].map((h) => (
                    <th className="p-2 text-left" key={h}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((row) => (
                  <tr key={row.row} className="border-t">
                    <td className="p-2">{row.row}</td>
                    <td className="p-2">{row.sku}</td>
                    <td className="p-2">{row.name}</td>
                    <td className="p-2">
                      {row.action === "new" ? "Crear" : "Actualizar"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {preview.errors.map((error, i) => (
            <p role="alert" key={i} className="text-sm text-destructive">
              Fila {error.row}: {error.message}
            </p>
          ))}
          {preview.errors.length > 0 && (
            <Button
              variant="outline"
              onClick={() => downloadErrorsCsv(preview.errors)}
            >
              Descargar errores
            </Button>
          )}
          <Button
            disabled={busy || !preview.rows.length || preview.errors.length > 0}
            onClick={confirm}
          >
            {importMutation.isPending ? "Importando…" : "Confirmar importación"}
          </Button>
        </div>
      )}
      {result && (
        <div className="space-y-3 border p-4">
          <h3 className="font-semibold">
            {result.errors.length
              ? "Importación con errores"
              : "Importación completada"}
          </h3>
          <p>
            {result.created} creados · {result.updated} actualizados ·{" "}
            {result.errors.length} errores
          </p>
          {result.errors.length > 0 && (
            <Button
              variant="outline"
              onClick={() => downloadErrorsCsv(result.errors)}
            >
              Descargar errores
            </Button>
          )}
          <Button
            onClick={() => {
              setCsv("");
              setResult(undefined);
              if (fileInput.current) fileInput.current.value = "";
            }}
          >
            Otra importación
          </Button>
        </div>
      )}
    </div>
  );
  return embedded ? content : <AdminLayout>{content}</AdminLayout>;
}
