import { useState, type FormEvent } from "react";
import { Link, useLocation, useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { storeLogo } from "@/lib/store-media";

async function postJson<T>(url: string, body: unknown): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await response.json().catch(() => ({}))) as T & { error?: string; message?: string };
    if (!response.ok) {
      return { ok: false, error: data.error || "No se pudo completar la solicitud." };
    }
    return { ok: true, data };
  } catch {
    return { ok: false, error: "No se pudo conectar con el servidor." };
  }
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-6 bg-background px-4 py-10">
      <div className="w-full max-w-[440px] text-center">
        <Link href="/" className="inline-flex justify-center" aria-label="Pastelería Mallorca">
          <img
            src={storeLogo}
            alt="Mallorca"
            className="mx-auto h-14 w-auto object-contain brightness-0 sm:h-16"
          />
        </Link>
      </div>
      {children}
    </div>
  );
}

export function ForgotPasswordPage() {
  const [identifier, setIdentifier] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [doneMessage, setDoneMessage] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!identifier.trim()) {
      setError("Escribe tu usuario o correo.");
      return;
    }
    setSubmitting(true);
    const result = await postJson<{ message?: string }>("/api/auth/password-reset/request", {
      identifier: identifier.trim(),
    });
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setDoneMessage(
      result.data.message ||
        "Si el usuario existe, enviamos un correo con el enlace para restablecer la contraseña.",
    );
  }

  return (
    <Shell>
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-[440px] space-y-4 border border-border bg-card p-5 shadow-xl sm:p-7"
        noValidate
      >
        <div className="space-y-1">
          <h1 className="font-serif text-2xl font-bold text-foreground">Recuperar contraseña</h1>
          <p className="text-sm text-muted-foreground">
            Te enviamos un enlace a tu correo de Hostinger / cuenta registrada.
          </p>
        </div>

        {doneMessage ? (
          <p className="border border-border bg-muted/40 px-3 py-2 text-sm text-foreground" role="status">
            {doneMessage}
          </p>
        ) : (
          <>
            <div className="space-y-2">
              <Label htmlFor="forgot-identifier" className="text-sm font-semibold">
                Usuario o correo
              </Label>
              <Input
                id="forgot-identifier"
                value={identifier}
                onChange={(event) => setIdentifier(event.target.value)}
                autoComplete="username"
                autoCapitalize="none"
                disabled={submitting}
                placeholder="usuario o correo"
                className="h-11 rounded-none"
              />
            </div>
            {error ? (
              <p className="border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
                {error}
              </p>
            ) : null}
            <Button type="submit" className="h-11 w-full rounded-none" disabled={submitting}>
              {submitting ? "Enviando…" : "Enviar enlace"}
            </Button>
          </>
        )}

        <p className="text-center text-sm text-muted-foreground">
          <Link href="/sign-in" className="underline underline-offset-2 hover:text-foreground">
            Volver al inicio de sesión
          </Link>
        </p>
      </form>
    </Shell>
  );
}

export function ResetPasswordPage() {
  const params = useParams<{ token?: string }>();
  const [, setLocation] = useLocation();
  const token = params.token || "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (password.trim().length < 8) {
      setError("La contraseña debe tener al menos 8 caracteres.");
      return;
    }
    if (password !== confirm) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    setSubmitting(true);
    const result = await postJson("/api/auth/password-reset/confirm", {
      token,
      password,
    });
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setDone(true);
  }

  return (
    <Shell>
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-[440px] space-y-4 border border-border bg-card p-5 shadow-xl sm:p-7"
        noValidate
      >
        <div className="space-y-1">
          <h1 className="font-serif text-2xl font-bold text-foreground">Nueva contraseña</h1>
          <p className="text-sm text-muted-foreground">Elige una contraseña nueva para tu acceso.</p>
        </div>

        {done ? (
          <>
            <p className="border border-border bg-muted/40 px-3 py-2 text-sm text-foreground" role="status">
              Contraseña actualizada. Ya puedes iniciar sesión.
            </p>
            <Button type="button" className="h-11 w-full rounded-none" onClick={() => setLocation("/sign-in")}>
              Ir a iniciar sesión
            </Button>
          </>
        ) : (
          <>
            <div className="space-y-2">
              <Label htmlFor="reset-password" className="text-sm font-semibold">
                Nueva contraseña
              </Label>
              <Input
                id="reset-password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="new-password"
                disabled={submitting}
                className="h-11 rounded-none"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="reset-confirm" className="text-sm font-semibold">
                Confirmar contraseña
              </Label>
              <Input
                id="reset-confirm"
                type="password"
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
                autoComplete="new-password"
                disabled={submitting}
                className="h-11 rounded-none"
              />
            </div>
            {error ? (
              <p className="border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
                {error}
              </p>
            ) : null}
            <Button type="submit" className="h-11 w-full rounded-none" disabled={submitting || !token}>
              {submitting ? "Guardando…" : "Guardar contraseña"}
            </Button>
          </>
        )}
      </form>
    </Shell>
  );
}
