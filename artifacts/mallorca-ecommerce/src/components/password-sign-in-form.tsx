import { useEffect, useState, type FormEvent, type SVGProps } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Link } from "wouter";
import { SignInCaptcha } from "@/components/sign-in-captcha";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  captchaMatches,
  generateCaptchaChallenge,
  isSignInLocked,
  readSignInGate,
  registerSignInFailure,
  registerSignInSuccess,
  remainingLockMs,
  writeSignInGate,
} from "@/lib/sign-in-security";

function GoogleMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.03 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.07 1 3.11 3.99 1.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 7.16-4.53z"
      />
    </svg>
  );
}

type PasswordSignInFormProps = {
  onAuthenticate: (identifier: string, password: string) => Promise<string | null>;
  subtitle?: string;
  onGoogleSignIn?: () => void | Promise<void>;
  googleLoading?: boolean;
  googleError?: string | null;
};

function storage(): Storage | null {
  if (typeof window === "undefined") return null;
  return window.sessionStorage;
}

export function PasswordSignInForm({
  onAuthenticate,
  subtitle = "Solo usuario y contraseña. No se pueden crear cuentas desde aquí.",
  onGoogleSignIn,
  googleLoading = false,
  googleError = null,
}: PasswordSignInFormProps) {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [honeypot, setHoneypot] = useState("");
  const [challenge, setChallenge] = useState(generateCaptchaChallenge);
  const [captcha, setCaptcha] = useState("");
  const [captchaInvalid, setCaptchaInvalid] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [gate, setGate] = useState(() => readSignInGate(storage()));
  const [now, setNow] = useState(() => Date.now());

  const locked = isSignInLocked(gate, now);
  const lockSeconds = Math.ceil(remainingLockMs(gate, now) / 1000);

  useEffect(() => {
    if (!locked) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [locked]);

  function refreshCaptcha() {
    setChallenge(generateCaptchaChallenge());
    setCaptcha("");
    setCaptchaInvalid(false);
  }

  function persistGate(next: typeof gate) {
    setGate(next);
    writeSignInGate(storage(), next);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const currentNow = Date.now();
    setNow(currentNow);
    setError(null);

    if (isSignInLocked(gate, currentNow)) {
      setError(`Demasiados intentos. Espera ${Math.ceil(remainingLockMs(gate, currentNow) / 1000)} s.`);
      return;
    }

    if (honeypot.trim()) {
      persistGate(registerSignInFailure(gate, currentNow));
      refreshCaptcha();
      setError("No se pudo verificar el acceso.");
      return;
    }

    if (!identifier.trim() || !password) {
      setError("Escribe usuario y contraseña.");
      return;
    }

    if (!captchaMatches(captcha, challenge)) {
      setCaptchaInvalid(true);
      persistGate(registerSignInFailure(gate, currentNow));
      refreshCaptcha();
      setError("El código de seguridad no coincide.");
      return;
    }

    setSubmitting(true);
    try {
      const authError = await onAuthenticate(identifier.trim(), password);
      if (authError) {
        persistGate(registerSignInFailure(gate, Date.now()));
        refreshCaptcha();
        setError(authError);
        return;
      }
      persistGate(registerSignInSuccess());
    } catch {
      persistGate(registerSignInFailure(gate, Date.now()));
      refreshCaptcha();
      setError("No se pudo completar el inicio de sesión.");
    } finally {
      setSubmitting(false);
    }
  }

  const disabled = submitting || locked || googleLoading;

  return (
    <form
      onSubmit={handleSubmit}
      className="w-full max-w-[440px] space-y-4 border border-border bg-card p-5 shadow-xl sm:p-7"
      noValidate
    >
      <div className="space-y-1">
        <h1 className="font-serif text-2xl font-bold text-foreground">Iniciar sesión</h1>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      </div>

      {onGoogleSignIn ? (
        <div className="space-y-3">
          <Button
            type="button"
            variant="outline"
            className="h-11 w-full rounded-none gap-2"
            disabled={disabled}
            onClick={() => void onGoogleSignIn()}
          >
            <GoogleMark className="size-4 shrink-0" />
            {googleLoading ? "Redirigiendo a Google…" : "Continuar con Google"}
          </Button>
          {googleError ? (
            <p
              className="border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              role="alert"
            >
              {googleError}
            </p>
          ) : null}
          <div className="flex items-center gap-3 text-xs uppercase tracking-wide text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            o con contraseña
            <span className="h-px flex-1 bg-border" />
          </div>
        </div>
      ) : null}

      <input
        type="text"
        name="company"
        tabIndex={-1}
        autoComplete="off"
        value={honeypot}
        onChange={(event) => setHoneypot(event.target.value)}
        className="hidden"
        aria-hidden="true"
      />

      <div className="space-y-2">
        <Label htmlFor="sign-in-identifier" className="text-sm font-semibold">
          Usuario
        </Label>
        <Input
          id="sign-in-identifier"
          name="username"
          value={identifier}
          onChange={(event) => setIdentifier(event.target.value)}
          autoComplete="username"
          autoCapitalize="none"
          disabled={disabled}
          placeholder="Usuario o correo"
          className="h-11 rounded-none"
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor="sign-in-password" className="text-sm font-semibold">
            Contraseña
          </Label>
          <Link
            href="/recuperar-contrasena"
            className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
          >
            ¿Olvidaste tu contraseña?
          </Link>
        </div>
        <div className="flex h-11 items-center border border-input bg-background">
          <Input
            id="sign-in-password"
            name="password"
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            disabled={disabled}
            placeholder="Contraseña"
            className="h-full rounded-none border-0 shadow-none focus-visible:ring-0"
          />
          <button
            type="button"
            className="inline-flex h-full w-11 shrink-0 items-center justify-center text-muted-foreground disabled:opacity-50"
            onClick={() => setShowPassword((open) => !open)}
            disabled={disabled}
            aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
          >
            {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
      </div>

      <SignInCaptcha
        challenge={challenge}
        value={captcha}
        onChange={(value) => {
          setCaptcha(value);
          setCaptchaInvalid(false);
        }}
        onRefresh={refreshCaptcha}
        disabled={disabled}
        invalid={captchaInvalid}
      />

      {error ? (
        <p className="border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      {locked ? (
        <p className="text-sm text-muted-foreground">
          Acceso bloqueado temporalmente. Intenta en {lockSeconds} s.
        </p>
      ) : null}

      <Button type="submit" className="h-11 w-full rounded-none" disabled={disabled}>
        {submitting ? "Verificando…" : "Entrar"}
      </Button>
    </form>
  );
}
