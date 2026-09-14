import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getListInventoryAlertsQueryKey,
  useCreateInventoryAlert,
  type CreateInventoryAlertInput,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

const ALERT_TYPES: Array<{ value: CreateInventoryAlertInput["type"]; label: string }> = [
  { value: "INVENTORY_REVIEW", label: "Revisión de inventario" },
  { value: "RESTOCK_REQUEST", label: "Solicitud de reposición" },
  { value: "INVENTORY_MISMATCH", label: "Descuadre" },
  { value: "CUSTOM", label: "Personalizada" },
];

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productId?: number;
  productIds?: number[];
  branchId: number;
  productLabel?: string;
};

export function GenerateInventoryAlertDialog({
  open,
  onOpenChange,
  productId,
  productIds,
  branchId,
  productLabel,
}: Props) {
  const [type, setType] = useState<CreateInventoryAlertInput["type"]>("RESTOCK_REQUEST");
  const [priority, setPriority] = useState<NonNullable<CreateInventoryAlertInput["priority"]>>("MEDIUM");
  const [message, setMessage] = useState("");
  const create = useCreateInventoryAlert();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const submit = async () => {
    if (!message.trim()) {
      toast({ title: "Escribe un mensaje", variant: "destructive" });
      return;
    }
    try {
      await create.mutateAsync({
        data: {
          branchId,
          type,
          priority,
          message: message.trim(),
          ...(productIds?.length ? { productIds } : { productId }),
        },
      });
      await queryClient.invalidateQueries({ queryKey: getListInventoryAlertsQueryKey() });
      toast({ title: "Alerta creada" });
      setMessage("");
      onOpenChange(false);
    } catch {
      toast({ title: "No se pudo crear la alerta", variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Generar alerta</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          {productLabel ? <p className="text-muted-foreground">{productLabel}</p> : null}
          <label className="block space-y-1">
            <span>Tipo</span>
            <select
              className="h-10 w-full rounded-md border bg-background px-3"
              value={type}
              onChange={(e) => setType(e.target.value as CreateInventoryAlertInput["type"])}
            >
              {ALERT_TYPES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-1">
            <span>Prioridad</span>
            <select
              className="h-10 w-full rounded-md border bg-background px-3"
              value={priority}
              onChange={(e) =>
                setPriority(e.target.value as NonNullable<CreateInventoryAlertInput["priority"]>)
              }
            >
              {["LOW", "MEDIUM", "HIGH", "CRITICAL"].map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-1">
            <span>Mensaje</span>
            <Input
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Describe la situación…"
            />
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={create.isPending}>
            Crear alerta
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
