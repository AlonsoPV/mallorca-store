import { useState } from "react";
import { CreditCard } from "lucide-react";
import {
  useGetAdminPaymentProvider,
  useListAdminPaymentMethods,
  useUpdateAdminPaymentMethod,
  useUpdateAdminPaymentProvider,
} from "@workspace/api-client-react";
import {
  AdminEmptyState,
  AdminError,
  AdminLoading,
  AdminPageHeader,
  AdminPageShell,
} from "@/components/admin";
import { AdminLayout } from "@/components/layout/admin-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";

const PROVIDERS = [
  {
    code: "MERCADO_PAGO",
    title: "Mercado Pago",
    publicKeyLabel: "Public key",
    secretLabel: "Access token",
    webhookLabel: "Webhook secret",
  },
  {
    code: "PAYPAL",
    title: "PayPal",
    publicKeyLabel: "Client ID",
    secretLabel: "Secret",
    webhookLabel: "Webhook ID",
  },
] as const;

function ProviderCredentialsCard({
  code,
  title,
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

  return (
    <Card className="rounded-none">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          {settings?.configured
            ? "Credenciales guardadas. Activa el método para mostrarlo en la tienda."
            : "No configurado. No se mostrará en checkout."}
        </p>
        {settings?.publicKeyMasked ? (
          <p className="text-xs text-muted-foreground">{publicKeyLabel}: {settings.publicKeyMasked}</p>
        ) : null}
        <div className="flex items-center justify-between gap-4">
          <Label htmlFor={`${code}-sandbox`}>Sandbox</Label>
          <Switch id={`${code}-sandbox`} checked={sandboxValue} onCheckedChange={setSandbox} />
        </div>
        <div>
          <Label>{publicKeyLabel}</Label>
          <Input className="mt-1 rounded-none" value={publicKey} onChange={(e) => setPublicKey(e.target.value)} />
        </div>
        <div>
          <Label>{secretLabel}</Label>
          <Input className="mt-1 rounded-none" type="password" value={accessToken} onChange={(e) => setAccessToken(e.target.value)} />
        </div>
        <div>
          <Label>{webhookLabel}</Label>
          <Input className="mt-1 rounded-none" type="password" value={webhookSecret} onChange={(e) => setWebhookSecret(e.target.value)} />
        </div>
        <Button
          className="rounded-none"
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
          Guardar credenciales
        </Button>
      </CardContent>
    </Card>
  );
}

export default function AdminPaymentMethods() {
  const { toast } = useToast();
  const methods = useListAdminPaymentMethods();
  const updateMethod = useUpdateAdminPaymentMethod();

  return (
    <AdminLayout>
      <AdminPageShell>
        <AdminPageHeader
          title="Formas de pago"
          description="Activa el cobro en sucursal y guarda las credenciales de Mercado Pago y PayPal."
        />

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

        <div className="space-y-6">
          {methods.data?.map((method) => (
            <Card key={method.code} className="rounded-none">
              <CardHeader>
                <CardTitle className="flex items-center justify-between gap-4">
                  <span>{method.name}</span>
                  <span className="text-xs font-normal uppercase tracking-wide text-muted-foreground">
                    {method.configurationStatus === "configured" ? "Configurado" : "No configurado"}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                <div className="flex items-center justify-between gap-4">
                  <Label>Activo</Label>
                  <Switch
                    checked={method.enabled}
                    onCheckedChange={async (enabled) => {
                      try {
                        await updateMethod.mutateAsync({ code: method.code, data: { enabled } });
                        methods.refetch();
                      } catch {
                        toast({ title: "No se pudo actualizar", variant: "destructive" });
                      }
                    }}
                  />
                </div>
                <div className="flex items-center justify-between gap-4">
                  <Label>Pickup</Label>
                  <Switch checked={method.allowPickup} disabled={method.code === "CASH_ON_PICKUP"} />
                </div>
                <div className="flex items-center justify-between gap-4">
                  <Label>Delivery</Label>
                  <Switch
                    checked={method.allowDelivery}
                    disabled={method.code === "CASH_ON_PICKUP"}
                    onCheckedChange={async (allowDelivery) => {
                      try {
                        await updateMethod.mutateAsync({ code: method.code, data: { allowDelivery } });
                        methods.refetch();
                      } catch (error) {
                        const coded = error as { error?: string };
                        toast({
                          title: "Delivery no permitido para efectivo al recoger",
                          description: coded.error,
                          variant: "destructive",
                        });
                      }
                    }}
                  />
                </div>
                {method.customerDescription ? (
                  <p className="text-muted-foreground">{method.customerDescription}</p>
                ) : null}
              </CardContent>
            </Card>
          ))}

          {PROVIDERS.map((provider) => (
            <ProviderCredentialsCard key={provider.code} {...provider} />
          ))}
        </div>
      </AdminPageShell>
    </AdminLayout>
  );
}
