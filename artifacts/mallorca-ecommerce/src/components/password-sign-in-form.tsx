import { useEffect, useState, type FormEvent } from "react";
import { Eye, EyeOff } from "lucide-react";
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

type PasswordSignInFormProps = {
  onAuthenticate: (identifier: string, password: string) => Promise<string | null>;
};

function storage(): Storage | null {
  if (typeof window === "undefined") return null;
  return window.sessionStorage;
}

export function PasswordSignInForm({ onAuthenticate }: PasswordSignInFormProps) {
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

  const disabled = submitting || locked;

  return (
    <form
      onSubmit={handleSubmit}
      className="w-full max-w-[440px] space-y-4 border border-border bg-card p-5 shadow-xl sm:p-7"
      noValidate
    >
      <div className="space-y-1">
        <h1 className="font-serif text-2xl font-bold text-foreground">Iniciar sesión</h1>
        <p className="text-sm text-muted-foreground">
          Solo usuario y contraseña. No se pueden crear cuentas desde aquí.
        </p>
      </div>

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
        <Label htmlFor="sign-in-password" className="text-sm font-semibold">
          Contraseña
        </Label>
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
