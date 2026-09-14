import { SignUp } from "@clerk/react";
import { Link } from "wouter";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
const clerkConfigured = Boolean(import.meta.env.VITE_CLERK_PUBLISHABLE_KEY);

function getRedirectPath() {
  const requestedPath = new URLSearchParams(window.location.search).get("redirect_url");

  if (requestedPath?.startsWith("/") && !requestedPath.startsWith("//")) {
    return requestedPath;
  }

  return `${basePath}/cuenta` || "/cuenta";
}

export default function SignUpPage() {
  const redirectPath = getRedirectPath();

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-6 bg-background px-4 py-10">
      <div className="w-full max-w-[440px] text-center">
        <p className="font-serif text-2xl font-bold tracking-tight text-foreground">MALLORCA</p>
        <p className="mt-2 text-sm text-muted-foreground">
          Crea tu cuenta para continuar
        </p>
      </div>
      {clerkConfigured ? (
        <SignUp
          routing="path"
          path={`${basePath}/sign-up`}
          signInUrl={`${basePath}/sign-in?redirect_url=${encodeURIComponent(redirectPath)}`}
          fallbackRedirectUrl={redirectPath}
          signInFallbackRedirectUrl={redirectPath}
        />
      ) : (
        <div className="w-full max-w-[440px] space-y-4 border border-border bg-card p-6 text-sm text-muted-foreground">
          <p>
            El registro no está disponible en local sin{" "}
            <code className="text-foreground">VITE_CLERK_PUBLISHABLE_KEY</code>.
          </p>
          <Link href="/" className="inline-block text-primary underline underline-offset-2">
            Volver al inicio
          </Link>
        </div>
      )}
    </div>
  );
}
