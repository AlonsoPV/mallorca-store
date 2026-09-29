import { useEffect, useState } from "react";
import { AuthenticateWithRedirectCallback } from "@clerk/react";
import { useSignIn } from "@clerk/react/legacy";
import { Link, useLocation } from "wouter";
import { PasswordSignInForm } from "@/components/password-sign-in-form";
import { useAppAuth, useAppSignInLocalDev } from "@/lib/app-auth";
import {
  clerkSignInErrorMessage,
  credentialsMatch,
} from "@/lib/sign-in-security";
import { LOCAL_DEV_USER } from "@/lib/local-dev-user";
import { storeLogo } from "@/lib/store-media";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
const clerkConfigured = Boolean(import.meta.env.VITE_CLERK_PUBLISHABLE_KEY);

function getHomePath() {
  return basePath ? `${basePath}/` : "/";
}

function getRedirectPath() {
  const requestedPath = new URLSearchParams(window.location.search).get("redirect_url");
  const homePath = getHomePath();

  if (!requestedPath?.startsWith("/") || requestedPath.startsWith("//")) {
    return homePath;
  }

  const pathOnly = requestedPath.split("?")[0]?.split("#")[0] || "/";
  if (pathOnly === "/cuenta" || pathOnly === `${basePath}/cuenta`) {
    return homePath;
  }

  return requestedPath;
}

function toAppPath(path: string) {
  return path.startsWith(basePath) ? path.slice(basePath.length) || "/" : path;
}

function localDevCredentials() {
  const username = (import.meta.env.VITE_LOCAL_DEV_USERNAME as string | undefined)?.trim() || "admin";
  const password =
    (import.meta.env.VITE_LOCAL_DEV_PASSWORD as string | undefined)?.trim() || "mallorca-local";
  return {
    identifiers: [username, LOCAL_DEV_USER.primaryEmailAddress.emailAddress],
    password,
  };
}

function isSsoCallbackPath(path: string) {
  const clean = path.split("?")[0]?.replace(/\/+$/, "") || "";
  return clean.endsWith("/sign-in/sso-callback") || clean === "/sso-callback";
}

function ClerkPasswordGate({
  onSuccess,
  redirectPath,
}: {
  onSuccess: () => void;
  redirectPath: string;
}) {
  const { isLoaded, signIn, setActive } = useSignIn();
  const [googleError, setGoogleError] = useState<string | null>(null);
  const [googleLoading, setGoogleLoading] = useState(false);

  if (!isLoaded || !signIn || !setActive) {
    return (
      <div className="h-80 w-full max-w-[440px] animate-pulse border border-border bg-muted/40" />
    );
  }

  const clerkSignIn = signIn;

  async function signInWithGoogle() {
    setGoogleError(null);
    setGoogleLoading(true);
    try {
      await clerkSignIn.authenticateWithRedirect({
        strategy: "oauth_google",
        redirectUrl: `${basePath}/sign-in/sso-callback`,
        redirectUrlComplete: redirectPath,
      });
    } catch (error) {
      setGoogleLoading(false);
      setGoogleError(clerkSignInErrorMessage(error));
    }
  }

  return (
    <PasswordSignInForm
      subtitle="Correo electrónico y contraseña, o continúa con Google."
      emailOnly
      googleError={googleError}
      googleLoading={googleLoading}
      onGoogleSignIn={signInWithGoogle}
      onAuthenticate={async (identifier, password) => {
        try {
          const result = await clerkSignIn.create({ identifier, password });
          if (result.status === "complete" && result.createdSessionId) {
            await setActive({ session: result.createdSessionId });
            onSuccess();
            return null;
          }
          return "Completa el inicio de sesión o usa Google.";
        } catch (error) {
          return clerkSignInErrorMessage(error);
        }
      }}
    />
  );
}

function LocalPasswordGate({
  onSuccess,
}: {
  onSuccess: (token?: string) => void;
}) {
  const allowed = localDevCredentials();
  return (
    <PasswordSignInForm
      subtitle="En local usa usuario y contraseña. Google requiere Clerk en el servidor."
      onAuthenticate={async (identifier, password) => {
        try {
          const response = await fetch("/api/auth/local-login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ identifier, password }),
          });
          if (response.ok) {
            const data = (await response.json()) as { token?: string };
            onSuccess(data.token);
            return null;
          }
        } catch {
          // Fall through to env credentials when the mock API is down.
        }
        if (!credentialsMatch(identifier, password, allowed)) {
          return "Usuario o contraseña incorrectos.";
        }
        onSuccess();
        return null;
      }}
    />
  );
}

export default function SignInPage() {
  const redirectPath = getRedirectPath();
  const { isSignedIn } = useAppAuth();
  const signInLocalDev = useAppSignInLocalDev();
  const [location, setLocation] = useLocation();

  useEffect(() => {
    if (isSignedIn && !isSsoCallbackPath(location)) {
      setLocation(toAppPath(redirectPath));
    }
  }, [isSignedIn, redirectPath, setLocation, location]);

  function goToRedirect() {
    setLocation(toAppPath(redirectPath));
  }

  if (clerkConfigured && isSsoCallbackPath(location)) {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 bg-background px-4">
        <p className="text-sm text-muted-foreground">Completando acceso con Google…</p>
        <AuthenticateWithRedirectCallback />
        <div id="clerk-captcha" />
      </div>
    );
  }

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
      {clerkConfigured ? (
        <ClerkPasswordGate onSuccess={goToRedirect} redirectPath={redirectPath} />
      ) : (
        <LocalPasswordGate
          onSuccess={(token) => {
            signInLocalDev(token);
            goToRedirect();
          }}
        />
      )}
    </div>
  );
}
