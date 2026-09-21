import { useEffect } from "react";
import { SignIn } from "@clerk/react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { useAppAuth, useAppSignInLocalDev } from "@/lib/app-auth";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
const clerkConfigured = Boolean(import.meta.env.VITE_CLERK_PUBLISHABLE_KEY);

function getRedirectPath() {
  const requestedPath = new URLSearchParams(window.location.search).get("redirect_url");

  if (requestedPath?.startsWith("/") && !requestedPath.startsWith("//")) {
    return requestedPath;
  }

  return basePath ? `${basePath}/` : "/";
}

function toAppPath(path: string) {
  return path.startsWith(basePath) ? path.slice(basePath.length) || "/" : path;
}

export default function SignInPage() {
  const redirectPath = getRedirectPath();
  const { isSignedIn } = useAppAuth();
  const signInLocalDev = useAppSignInLocalDev();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (isSignedIn) setLocation(toAppPath(redirectPath));
  }, [isSignedIn, redirectPath, setLocation]);

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-6 bg-background px-4 py-10">
      <div className="w-full max-w-[440px] text-center">
        <p className="font-serif text-2xl font-bold tracking-tight text-foreground">MALLORCA</p>
        <p className="mt-2 text-sm text-muted-foreground">
          Inicia sesión para continuar
        </p>
      </div>
      {clerkConfigured ? (
        <>
          <SignIn
            routing="path"
            path={`${basePath}/sign-in`}
            fallbackRedirectUrl={redirectPath}
            withSignUp={false}
            transferable={false}
            appearance={{
              elements: {
                footerAction__signIn: { display: "none" },
              },
            }}
          />
          <p className="max-w-[440px] text-center text-xs leading-5 text-muted-foreground">
            Si no recuerdas tu contraseña, escribe primero tu correo y selecciona
            <span className="font-medium text-foreground"> “¿Olvidaste tu contraseña?” </span>
            dentro del formulario.
          </p>
        </>
      ) : (
        <div className="w-full max-w-[440px] space-y-4 border border-border bg-card p-6 text-sm text-muted-foreground">
          <p>
            Modo local: entra como usuario dummy de administración (simula Clerk).
          </p>
          <Button
            className="w-full rounded-none"
            onClick={() => {
              signInLocalDev();
              setLocation(toAppPath(redirectPath));
            }}
          >
            Continuar como Admin Local
          </Button>
          <Link href="/" className="inline-block text-primary underline underline-offset-2">
            Volver al inicio
          </Link>
        </div>
      )}
    </div>
  );
}
