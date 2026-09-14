import { useRef, useState } from "react";
import * as XLSX from "xlsx";
import { AdminLayout } from "@/components/layout/admin-layout";
import { Button } from "@/components/ui/button";
import { useImportInventory, usePreviewInventoryImport } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { FileUp, CheckCircle2, AlertCircle, Download, ChevronRight, RefreshCcw } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { getListProductsQueryKey, getListAdminProductsQueryKey, getGetAdminSummaryQueryKey } from "@workspace/api-client-react";

type Preview = {
  rows?: unknown[];
  errors?: Array<{ row?: number; message?: string }>;
  valid?: boolean;
};

export default function AdminImport() {
  const [csv, setCsv] = useState("");
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState<Preview>();
  const [step, setStep] = useState<1 | 2 | 3>(1);

  const fileInput = useRef<HTMLInputElement>(null);
  const previewMutation = usePreviewInventoryImport();
  const importMutation = useImportInventory();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const downloadTemplate = () => {
    const ws = XLSX.utils.aoa_to_sheet([["sku", "branch_code", "quantity"], ["PAN-001", "reforma", 100]]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Plantilla");
    XLSX.writeFile(wb, "plantilla_inventario.xlsx");
  };

  const readFile = async (file: File) => {
    try {
      setFileName(file.name);
      setPreview(undefined);
      let content = "";
      if (file.name.toLowerCase().endsWith(".xlsx")) {
        const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        if (!firstSheet) throw new Error("El archivo no contiene hojas.");
        content = XLSX.utils.sheet_to_csv(firstSheet, { blankrows: false });
      } else {
        content = await file.text();
      }
      setCsv(content);

      // Auto-preview
      previewMutation.mutate(
        { data: { csv: content } },
        {
          onSuccess: (data) => {
            setPreview(data);
            setStep(2);
          },
          onError: () => toast({ title: "No se pudo validar el archivo", variant: "destructive" }),
        }
      );
    } catch (error) {
      setCsv("");
      toast({
        title: "No se pudo leer el archivo",
        description: error instanceof Error ? error.message : "Verifica el formato.",
        variant: "destructive",
      });
    }
  };

  const confirmImport = () => {
    importMutation.mutate(
      { data: { csv } },
      {
        onSuccess: (result) => {
          // Invalidate cache
          void queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() });
          void queryClient.invalidateQueries({ queryKey: getListAdminProductsQueryKey() });
          void queryClient.invalidateQueries({ queryKey: getGetAdminSummaryQueryKey() });

          toast({ title: `Importación completada`, description: `${result.imported} filas actualizadas.` });
          setStep(3);
        },
        onError: () => toast({ title: "La importación fue rechazada", description: "Corrige todos los errores y vuelve a validar.", variant: "destructive" }),
      }
    );
  };

  const reset = () => {
    setPreview(undefined);
    setCsv("");
    setFileName("");
    setStep(1);
    if (fileInput.current) fileInput.current.value = "";
  };

  return (
    <AdminLayout>
      <div className="flex-1 flex flex-col h-full bg-[#FBFAF7] dark:bg-background overflow-auto">
        <div className="max-w-3xl w-full mx-auto p-8 space-y-8 mt-4">

          <div>
            <h1 className="text-3xl font-serif text-[#25211E] dark:text-foreground tracking-tight">Importar Inventario</h1>
            <p className="mt-2 text-muted-foreground text-sm font-sans">
              Actualiza las existencias de múltiples productos a través de un archivo CSV o XLSX.
            </p>
          </div>

          {/* Stepper */}
          <div className="flex items-center gap-2 text-sm font-medium">
            <div className={`flex items-center gap-2 ${step >= 1 ? "text-[#D43B2B]" : "text-muted-foreground"}`}>
              <div className={`w-6 h-6 rounded-full flex items-center justify-center border-2 ${step >= 1 ? "border-[#D43B2B] bg-[#D43B2B]/10" : "border-muted-foreground/30"}`}>1</div>
              Cargar archivo
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground/30" />
            <div className={`flex items-center gap-2 ${step >= 2 ? "text-[#D43B2B]" : "text-muted-foreground"}`}>
              <div className={`w-6 h-6 rounded-full flex items-center justify-center border-2 ${step >= 2 ? "border-[#D43B2B] bg-[#D43B2B]/10" : "border-muted-foreground/30"}`}>2</div>
              Validación
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground/30" />
            <div className={`flex items-center gap-2 ${step === 3 ? "text-[#D43B2B]" : "text-muted-foreground"}`}>
              <div className={`w-6 h-6 rounded-full flex items-center justify-center border-2 ${step === 3 ? "border-[#D43B2B] bg-[#D43B2B]/10" : "border-muted-foreground/30"}`}>3</div>
              Completado
            </div>
          </div>

          <div className="bg-white dark:bg-card border border-[#E8DED0] dark:border-border p-8 relative">

            {step === 1 && (
              <div className="space-y-6">
                <div className="border-2 border-dashed border-[#E8DED0] dark:border-border bg-[#F5F0E8]/50 dark:bg-muted/10 p-12 text-center flex flex-col items-center">
                  <div className="w-16 h-16 bg-white dark:bg-background border border-[#E8DED0] dark:border-border rounded-full flex items-center justify-center mb-4">
                    <FileUp className="w-6 h-6 text-[#D43B2B]" />
                  </div>
                  <h3 className="text-lg font-medium text-[#25211E] dark:text-foreground font-serif">Selecciona un archivo</h3>
                  <p className="text-sm text-muted-foreground mt-1 mb-6 max-w-sm">
                    Formatos soportados: .csv, .xlsx. El archivo debe incluir las columnas <code className="bg-white dark:bg-background px-1 rounded text-[#D43B2B] border border-[#E8DED0] font-mono font-medium">sku</code>, <code className="bg-white dark:bg-background px-1 rounded text-[#D43B2B] border border-[#E8DED0] font-mono font-medium">branch_code</code> y <code className="bg-white dark:bg-background px-1 rounded text-[#D43B2B] border border-[#E8DED0] font-mono font-medium">quantity</code>.
                  </p>

                  <input
                    ref={fileInput}
                    type="file"
                    className="hidden"
                    accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) void readFile(file);
                    }}
                  />
                  <Button
                    onClick={() => fileInput.current?.click()}
                    disabled={previewMutation.isPending}
                    className="rounded-none bg-[#4B3028] hover:bg-[#25211E] text-white px-8 h-12"
                  >
                    {previewMutation.isPending ? "Procesando..." : "Explorar Archivos"}
                  </Button>
                </div>

                <div className="flex items-center justify-between p-4 bg-[#FBFAF7] dark:bg-muted/30 border border-[#E8DED0] dark:border-border">
                  <div className="text-sm">
                    <span className="font-semibold text-[#25211E] dark:text-foreground">¿No tienes el formato correcto?</span>
                    <p className="text-muted-foreground">Descarga nuestra plantilla preconfigurada.</p>
                  </div>
                  <Button variant="outline" size="sm" onClick={downloadTemplate} className="rounded-none border-[#E8DED0] text-[#4B3028] hover:bg-[#F5F0E8] h-9">
                    <Download className="w-4 h-4 mr-2" />
                    Descargar Plantilla
                  </Button>
                </div>
              </div>
            )}

            {step === 2 && preview && (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div className="flex items-center justify-between border-b border-[#E8DED0] dark:border-border pb-6">
                  <div>
                    <h3 className="text-lg font-semibold font-serif text-[#25211E] dark:text-foreground">Resultados de Validación</h3>
                    <p className="text-sm text-muted-foreground mt-1 font-mono">{fileName}</p>
                  </div>
                  {preview.valid ? (
                    <div className="flex items-center gap-2 text-emerald-700 bg-emerald-50 px-3 py-1.5 border border-emerald-200 text-sm font-semibold">
                      <CheckCircle2 className="w-4 h-4" />
                      Listo para importar
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-destructive bg-destructive/10 px-3 py-1.5 border border-destructive/20 text-sm font-semibold">
                      <AlertCircle className="w-4 h-4" />
                      Requiere correcciones
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-[#FBFAF7] dark:bg-muted/20 p-4 border border-[#E8DED0] dark:border-border">
                    <div className="text-3xl font-serif text-[#25211E] dark:text-foreground mb-1">{preview.rows?.length ?? 0}</div>
                    <div className="text-sm text-muted-foreground">Filas válidas encontradas</div>
                  </div>
                  <div className={`p-4 border ${preview.errors?.length ? 'bg-destructive/5 border-destructive/20' : 'bg-[#FBFAF7] dark:bg-muted/20 border-[#E8DED0] dark:border-border'}`}>
                    <div className={`text-3xl font-serif mb-1 ${preview.errors?.length ? 'text-destructive' : 'text-[#25211E] dark:text-foreground'}`}>{preview.errors?.length ?? 0}</div>
                    <div className="text-sm text-muted-foreground">Errores de formato</div>
                  </div>
                </div>

                {!!preview.errors?.length && (
                  <div className="space-y-2 border border-destructive/20 bg-destructive/5 p-4 max-h-[250px] overflow-y-auto">
                    <h4 className="text-sm font-semibold text-destructive mb-3">Detalle de errores:</h4>
                    {preview.errors.map((error, index) => (
                      <div className="text-sm text-destructive flex gap-3 pb-2 border-b border-destructive/10 last:border-0 last:pb-0" key={`${error.row ?? "row"}-${index}`}>
                        <span className="font-mono bg-destructive/10 px-1.5 py-0.5 rounded text-xs min-w-[60px] text-center font-semibold">Fila {error.row ?? "—"}</span>
                        <span>{error.message ?? "Error de validación"}</span>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex gap-4 pt-4 border-t border-[#E8DED0] dark:border-border">
                  <Button variant="outline" onClick={reset} className="rounded-none border-[#E8DED0] text-[#4B3028] h-12 hover:bg-[#F5F0E8]">
                    Cancelar y subir otro
                  </Button>
                  <Button
                    disabled={!preview.valid || importMutation.isPending}
                    onClick={confirmImport}
                    className="rounded-none bg-[#D43B2B] hover:bg-[#B83225] text-white flex-1 h-12"
                  >
                    {importMutation.isPending ? "Importando..." : "Confirmar e Importar"}
                  </Button>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="py-12 text-center flex flex-col items-center animate-in fade-in zoom-in-95 duration-500">
                <div className="w-20 h-20 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 rounded-full flex items-center justify-center mb-6 border border-emerald-200">
                  <CheckCircle2 className="w-10 h-10" />
                </div>
                <h3 className="text-2xl font-serif text-[#25211E] dark:text-foreground mb-2">Importación Exitosa</h3>
                <p className="text-muted-foreground max-w-sm mb-8 font-sans">
                  El inventario ha sido actualizado correctamente. Los cambios ya se reflejan en el catálogo y sucursales.
                </p>
                <Button onClick={reset} className="rounded-none bg-[#4B3028] hover:bg-[#25211E] text-white h-12">
                  <RefreshCcw className="w-4 h-4 mr-2" />
                  Realizar otra importación
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
