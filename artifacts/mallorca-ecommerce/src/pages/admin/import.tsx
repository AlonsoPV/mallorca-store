import { useRef, useState } from "react";
import * as XLSX from "xlsx";
import { AdminLayout } from "@/components/layout/admin-layout";
import { Button } from "@/components/ui/button";
import { useImportInventory, usePreviewInventoryImport } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";

type Preview = {
  rows?: unknown[];
  errors?: Array<{ row?: number; message?: string }>;
  valid?: boolean;
};

export default function AdminImport() {
  const [csv, setCsv] = useState("");
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState<Preview>();
  const fileInput = useRef<HTMLInputElement>(null);
  const previewMutation = usePreviewInventoryImport();
  const importMutation = useImportInventory();
  const { toast } = useToast();

  const readFile = async (file: File) => {
    try {
      setFileName(file.name);
      setPreview(undefined);
      if (file.name.toLowerCase().endsWith(".xlsx")) {
        const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        if (!firstSheet) throw new Error("El archivo no contiene hojas.");
        setCsv(XLSX.utils.sheet_to_csv(firstSheet, { blankrows: false }));
      } else {
        setCsv(await file.text());
      }
    } catch (error) {
      setCsv("");
      toast({
        title: "No se pudo leer el archivo",
        description: error instanceof Error ? error.message : "Verifica el formato.",
        variant: "destructive",
      });
    }
  };

  const previewImport = () => {
    previewMutation.mutate(
      { data: { csv } },
      {
        onSuccess: setPreview,
        onError: () => toast({ title: "No se pudo validar el archivo", variant: "destructive" }),
      },
    );
  };

  const confirmImport = () => {
    importMutation.mutate(
      { data: { csv } },
      {
        onSuccess: (result) => {
          toast({ title: `Importación completada: ${result.imported} filas` });
          setPreview(undefined);
          setCsv("");
          setFileName("");
          if (fileInput.current) fileInput.current.value = "";
        },
        onError: () => toast({ title: "La importación fue rechazada", description: "Corrige todos los errores y vuelve a validar.", variant: "destructive" }),
      },
    );
  };

  return (
    <AdminLayout>
      <div className="max-w-4xl space-y-6 overflow-auto p-6 md:p-10">
        <div>
          <h1 className="text-3xl font-bold">Importar inventario</h1>
          <p className="mt-2 text-muted-foreground">Carga un CSV o XLSX con las columnas exactas <code>sku</code>, <code>branch_code</code> y <code>quantity</code>.</p>
        </div>

        <div className="rounded-lg border bg-card p-5">
          <input
            ref={fileInput}
            type="file"
            accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void readFile(file);
            }}
          />
          {fileName && <p className="mt-3 text-sm text-muted-foreground">Archivo seleccionado: {fileName}</p>}
          {csv && (
            <Button className="mt-4" onClick={previewImport} disabled={previewMutation.isPending}>
              {previewMutation.isPending ? "Validando…" : "Previsualizar"}
            </Button>
          )}
        </div>

        {preview && (
          <div className="space-y-4 rounded-lg border bg-card p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-medium">
                {preview.rows?.length ?? 0} filas válidas · {preview.errors?.length ?? 0} errores
              </p>
              <span className={preview.valid ? "text-sm font-medium text-emerald-700" : "text-sm font-medium text-destructive"}>
                {preview.valid ? "Listo para confirmar" : "Requiere correcciones"}
              </span>
            </div>
            {!!preview.errors?.length && (
              <div className="space-y-2 rounded-md bg-destructive/5 p-3">
                {preview.errors.map((error, index) => (
                  <p className="text-sm text-destructive" key={`${error.row ?? "row"}-${index}`}>
                    Fila {error.row ?? "—"}: {error.message ?? "Error de validación"}
                  </p>
                ))}
              </div>
            )}
            <Button disabled={!preview.valid || importMutation.isPending} onClick={confirmImport}>
              {importMutation.isPending ? "Importando…" : "Confirmar importación"}
            </Button>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}