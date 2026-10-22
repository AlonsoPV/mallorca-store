import { useState } from "react";
import {
  Banknote,
  CreditCard,
  KeyRound,
  Store,
  Truck,
  type LucideIcon,
} from "lucide-react";
import {
  useGetAdminPaymentProvider,
  useListAdminPaymentMethods,
  useUpdateAdminPaymentMethod,
  useUpdateAdminPaymentProvider,
  type PaymentMethodConfig,
} from "@workspace/api-client-react";
import {
  AdminEmptyState,
  AdminError,
  AdminLoading,
  AdminPageHeader,
  AdminPageShell,
} from "@/components/admin";
import { AdminLayout } from "@/components/layout/admin-layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const PROVIDERS = [
  {
    code: "MERCADO_PAGO",
    title: "Mercado Pago",
    blurb: "Cobro con tarjeta y métodos locales en checkout.",
    publicKeyLabel: "Public key",
    secretLabel: "Access token",
    webhookLabel: "Webhook secret",
  },
  {
    code: "PAYPAL",
    title: "PayPal",
    blurb: "Pago en línea con cuenta PayPal o tarjeta.",
    publicKeyLabel: "Client ID",
    secretLabel: "Secret",
    webhookLabel: "Webhook ID",
  },
] as const;

function methodIcon(code: string): LucideIcon {
  if (code === "CASH_ON_PICKUP") return Banknote;
  if (code === "PAYPAL" || code === "MERCADO_PAGO") return CreditCard;
  return CreditCard;
}

function StatusBadge({ configured }: { configured: boolean }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "rounded-none border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em]",
        configured
          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
          : "border-border bg-muted/60 text-muted-foreground",
      )}
    >
      {configured ? "Configurado" : "Sin configurar"}
    </Badge>
  );
}

function EnabledBadge({ enabled }: { enabled: boolean }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "rounded-none border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em]",
        enabled
          ? "border-[var(--mallorca-red)]/25 bg-[var(--mallorca-red)]/8 text-[var(--mallorca-red)]"
          : "border-border bg-background text-muted-foreground",
      )}
    >
      {enabled ? "Activo en tienda" : "Inactivo"}
    </Badge>
  );
}

function ToggleRow({
  id,
  label,
  hint,
  checked,
  disabled,
  onCheckedChange,
}: {
  id: string;
  label: string;
  hint?: string;
  checked: boolean;
  disabled?: boolean;
  onCheckedChange?: (value: boolean) => void;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-4 border-b border-border/70 py-3 last:border-b-0 last:pb-0 first:pt-0",
        disabled && "opacity-55",
      )}
    >
      <div className="min-w-0">
        <Label htmlFor={id} className="cursor-pointer text-sm font-medium text-foreground">
          {label}
        </Label>
        {hint ? <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{hint}</p> : null}
      </div>
      <Switch id={id} checked={checked} disabled={disabled} onCheckedChange={onCheckedChange} />
    </div>
  );
}

function MethodCard({
  method,
  busy,
  onToggle,
}: {
  method: PaymentMethodConfig;
  busy: boolean;
  onToggle: (patch: { enabled?: boolean; allowPickup?: boolean; allowDelivery?: boolean }) => Promise<void>;
}) {
  const Icon = methodIcon(method.code);
  const isCash = method.code === "CASH_ON_PICKUP";
  const configured = method.configurationStatus === "configured";

  return (
    <article className="flex h-full flex-col border border-border bg-card">
      <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4 sm:px-6">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center bg-[var(--mallorca-sand)] text-[var(--mallorca-cacao)]">
            <Icon className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <h3 className="font-serif text-xl leading-tight tracking-tight text-foreground">{method.name}</h3>
            {method.customerDescription ? (
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{method.customerDescription}</p>
            ) : null}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <EnabledBadge enabled={method.enabled} />
          <StatusBadge configured={configured} />
        </div>
      </div>

      <div className="flex flex-1 flex-col px-5 py-2 sm:px-6">
        <ToggleRow
          id={`${method.code}-enabled`}
          label="Visible en checkout"
          hint={
            configured
              ? "Si está activo, el cliente puede elegirlo."
              : "Necesita credenciales antes de mostrarse (excepto efectivo)."
          }
          checked={method.enabled}
          disabled={busy || (!configured && !isCash)}
          onCheckedChange={(enabled) => onToggle({ enabled })}
        />
        <ToggleRow
          id={`${method.code}-pickup`}
          label="Recolección"
          hint={isCash ? "Siempre disponible para efectivo al recoger." : "Disponible en pedidos de pickup."}
          checked={method.allowPickup}
          disabled={busy || isCash}
          onCheckedChange={(allowPickup) => onToggle({ allowPickup })}
        />
        <ToggleRow
          id={`${method.code}-delivery`}
          label="Entrega"
          hint={isCash ? "El efectivo solo aplica en sucursal." : "Disponible en pedidos a domicilio."}
          checked={method.allowDelivery}
          disabled={busy || isCash}
          onCheckedChange={(allowDelivery) => onToggle({ allowDelivery })}
        />
      </div>

      <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border bg-muted/25 px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground sm:px-6">
        <span className="inline-flex items-center gap-1.5">
          <Store className="h-3.5 w-3.5" />
          {method.allowPickup ? "Recolección" : "Sin recolección"}
        </span>
        <span className="text-border" aria-hidden>
          ·
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Truck className="h-3.5 w-3.5" />
          {method.allowDelivery ? "Entrega" : "Sin entrega"}
        </span>
      </div>
    </article>
  );
}

function ProviderCredentialsCard({
  code,
  title,
  blurb,
  publicKeyLabel,
  secretLabel,
  webhookLabel,
}: (typeof PROVIDERS)[number]) {
  const { toast } = useToast();
  const provider = useGetAdminPaymentProvider(code);
  const updateProvider = useUpdateAdminPaymentProvider();
  const [publicKey, setPublicKey] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [sandbox, setSandbox] = useState(true);
  const settings = provider.data;
  const sandboxValue = settings?.sandbox ?? sandbox;
  const configured = Boolean(settings?.configured);

  return (
    <article className="border border-border bg-card">
      <div className="flex flex-col gap-3 border-b border-border px-5 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-6">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center bg-[var(--mallorca-sand)] text-[var(--mallorca-cacao)]">
            <KeyRound className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <h3 className="font-serif text-xl leading-tight tracking-tight">{title}</h3>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{blurb}</p>
          </div>
        </div>
        <StatusBadge configured={configured} />
      </div>

      <div className="space-y-5 px-5 py-5 sm:px-6">
        <p className="text-sm text-muted-foreground">
          {configured
            ? "Credenciales guardadas. Activa el método arriba para mostrarlo en la tienda."
            : "Todavía sin credenciales. No se mostrará en checkout hasta configurarlo."}
        </p>

        {settings?.publicKeyMasked ? (
          <p className="border border-border bg-muted/30 px-3 py-2 font-mono text-xs text-muted-foreground">
            {publicKeyLabel}: {settings.publicKeyMasked}
          </p>
        ) : null}

        <div className="flex items-center justify-between gap-4 border border-border bg-muted/20 px-3 py-3">
          <div>
            <Label htmlFor={`${code}-sandbox`} className="text-sm font-medium">
              Modo sandbox
            </Label>
            <p className="mt-0.5 text-xs text-muted-foreground">Pruebas sin cobros reales.</p>
          </div>
          <Switch id={`${code}-sandbox`} checked={sandboxValue} onCheckedChange={setSandbox} />
        </div>

        <div className="grid gap-4 sm:grid-cols-1">
          <div>
            <Label htmlFor={`${code}-public`}>{publicKeyLabel}</Label>
            <Input
              id={`${code}-public`}
              className="mt-1.5 rounded-none"
              value={publicKey}
              onChange={(e) => setPublicKey(e.target.value)}
              autoComplete="off"
            />
          </div>
          <div>
            <Label htmlFor={`${code}-secret`}>{secretLabel}</Label>
            <Input
              id={`${code}-secret`}
              className="mt-1.5 rounded-none"
              type="password"
              value={accessToken}
              onChange={(e) => setAccessToken(e.target.value)}
              autoComplete="new-password"
            />
          </div>
          <div>
            <Label htmlFor={`${code}-webhook`}>{webhookLabel}</Label>
            <Input
              id={`${code}-webhook`}
              className="mt-1.5 rounded-none"
              type="password"
              value={webhookSecret}
              onChange={(e) => setWebhookSecret(e.target.value)}
              autoComplete="new-password"
            />
          </div>
        </div>

        <Button
          className="w-full rounded-none sm:w-auto"
          disabled={updateProvider.isPending}
          onClick={async () => {
            try {
              await updateProvider.mutateAsync({
                provider: code,
                data: {
                  sandbox: sandboxValue,
                  publicKey: publicKey || null,
                  accessToken: accessToken || null,
                  webhookSecret: webhookSecret || null,
                },
              });
              setAccessToken("");
              setWebhookSecret("");
              provider.refetch();
              toast({ title: "Configuración guardada" });
            } catch {
              toast({ title: `No se pudo guardar ${title}`, variant: "destructive" });
            }
          }}
        >
          {updateProvider.isPending ? "Guardando…" : "Guardar credenciales"}
        </Button>
      </div>
    </article>
  );
}

export default function AdminPaymentMethods() {
  const { toast } = useToast();
  const methods = useListAdminPaymentMethods();
  const updateMethod = useUpdateAdminPaymentMethod();

  const patchMethod = async (
    code: string,
    data: { enabled?: boolean; allowPickup?: boolean; allowDelivery?: boolean },
  ) => {
    try {
      await updateMethod.mutateAsync({ code, data });
      await methods.refetch();
    } catch (error) {
      const coded = error as { error?: string };
      toast({
        title: code === "CASH_ON_PICKUP" ? "Delivery no permitido para efectivo al recoger" : "No se pudo actualizar",
        description: coded.error,
        variant: "destructive",
      });
    }
  };

  return (
    <AdminLayout>
      <AdminPageShell>
        <AdminPageHeader
          title="Formas de pago"
          description="Decide qué métodos ve el cliente en checkout y guarda las credenciales de Mercado Pago y PayPal."
        />

        <div className="border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 sm:px-5">
          <p className="font-medium">Ambiente de pruebas</p>
          <p className="mt-1 leading-relaxed text-amber-950/80">
            Sandbox está forzado mientras <span className="font-mono text-xs">PAYMENT_ENVIRONMENT</span> no sea{" "}
            <span className="font-mono text-xs">live</span>. No se aceptan cobros reales.
          </p>
        </div>

        {methods.isLoading ? <AdminLoading label="Cargando formas de pago…" /> : null}
        {methods.isError ? (
          <AdminError title="No se pudieron cargar las formas de pago" onRetry={() => methods.refetch()} />
        ) : null}
        {!methods.isLoading && !methods.isError && (!methods.data || methods.data.length === 0) ? (
          <AdminEmptyState
            icon={CreditCard}
            title="Sin formas de pago"
            description="Aún no hay métodos configurados."
          />
        ) : null}

        {!methods.isLoading && !methods.isError && methods.data && methods.data.length > 0 ? (
          <section className="space-y-4">
            <div>
              <h2 className="font-serif text-lg tracking-tight text-foreground sm:text-xl">Métodos en checkout</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Activa cada método y elige si aplica a recolección, entrega o ambas.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
              {methods.data.map((method) => (
                <MethodCard
                  key={method.code}
                  method={method}
                  busy={updateMethod.isPending}
                  onToggle={(patch) => patchMethod(method.code, patch)}
                />
              ))}
            </div>
          </section>
        ) : null}

        <section className="space-y-4">
          <div>
            <h2 className="font-serif text-lg tracking-tight text-foreground sm:text-xl">Credenciales de proveedores</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Pega las llaves del panel de cada proveedor. Los secretos no se vuelven a mostrar después de guardar.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            {PROVIDERS.map((provider) => (
              <ProviderCredentialsCard key={provider.code} {...provider} />
            ))}
          </div>
        </section>
      </AdminPageShell>
    </AdminLayout>
  );
}
