import { useEffect, useRef, type ReactNode } from "react";
import { ClerkProvider } from "@clerk/react";
import { publishableKeyFromHost } from "@clerk/react/internal";
import { esES } from "@clerk/localizations";
import { shadcn } from "@clerk/themes";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { ClerkAuthBridge, useAppClerkListener } from "@/lib/app-auth";

const hostname = window.location.hostname.toLowerCase();
const isLoopbackHost = hostname === "localhost" || hostname === "127.0.0.1";
const envClerkPubKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined;
const clerkPubKey = isLoopbackHost
  ? envClerkPubKey
  : publishableKeyFromHost(hostname, envClerkPubKey);
const clerkProxyUrl = isLoopbackHost
  ? undefined
  : (import.meta.env.VITE_CLERK_PROXY_URL as string | undefined);
const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || "/"
    : path;
}

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: "clerk",
  options: {
    logoPlacement: "inside" as const,
    logoLinkUrl: basePath || "/",
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: "hsl(350 40% 30%)",
    colorForeground: "hsl(20 20% 10%)",
    colorMutedForeground: "hsl(20 15% 40%)",
    colorDanger: "hsl(0 70% 40%)",
    colorBackground: "hsl(0 0% 100%)",
    colorInput: "hsl(0 0% 100%)",
    colorInputForeground: "hsl(20 20% 10%)",
    colorNeutral: "hsl(35 20% 85%)",
    fontFamily: "'Plus Jakarta Sans', sans-serif",
    borderRadius: "0px",
  },
  elements: {
    rootBox: "w-full flex justify-center",
    cardBox: "bg-background rounded-none border border-border w-[440px] max-w-full overflow-hidden shadow-xl",
    card: "!shadow-none !border-0 !bg-transparent !rounded-none",
    footer: "!shadow-none !border-0 !bg-transparent !rounded-none",
    headerTitle: "font-serif text-2xl font-bold text-foreground",
    headerSubtitle: "text-muted-foreground text-sm",
    socialButtons: { display: "none" },
    socialButtonsBlockButton: { display: "none" },
    dividerRow: { display: "none" },
    alternativeMethods: { display: "none" },
    footerAction__signUp: { display: "none" },
    socialButtonsBlockButtonText: "text-foreground font-medium",
    formFieldLabel: "text-foreground font-semibold text-sm",
    footerActionLink: "text-primary hover:text-primary/90 font-medium",
    footerActionText: "text-muted-foreground",
    dividerText: "text-muted-foreground bg-background px-2",
    identityPreviewEditButton: "text-primary hover:text-primary/90",
    formFieldSuccessText: "text-green-600",
    alertText: "text-destructive",
    logoBox: "h-12 flex justify-center",
    logoImage: "h-full w-auto object-contain",
    formButtonPrimary: "bg-primary text-primary-foreground hover:bg-primary/90 rounded-none font-medium h-10",
    formFieldInput: "border border-input bg-background rounded-none focus:ring-1 focus:ring-ring text-foreground px-3 py-2",
    footerAction: "justify-center mt-4",
    footerAction__signIn: { display: "none" },
    dividerLine: "bg-border h-[1px]",
    alert: "bg-destructive/10 border border-destructive/20 rounded-none",
    otpCodeFieldInput: "border border-input bg-background rounded-none focus:ring-1 focus:ring-ring text-foreground",
    formFieldRow: "mb-4",
    main: "w-full space-y-6",
  },
};

function ClerkQueryClientCacheInvalidator() {
  const addListener = useAppClerkListener();
  const queryClient = useQueryClient();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    if (!addListener) return;
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (
        prevUserIdRef.current !== undefined &&
        prevUserIdRef.current !== userId
      ) {
        queryClient.clear();
      }
      prevUserIdRef.current = userId;
    });
    return unsubscribe;
  }, [addListener, queryClient]);

  return null;
}

export default function ClerkShell({ children }: { children: ReactNode }) {
  const [, setLocation] = useLocation();

  if (!clerkPubKey) {
    if (import.meta.env.PROD) {
      return (
        <div className="min-h-screen bg-background p-8 text-center text-foreground">
          El inicio de sesión no está disponible. Contacta al administrador.
        </div>
      );
    }
    return <>{children}</>;
  }

  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-in`}
      localization={esES}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <ClerkAuthBridge>
        <ClerkQueryClientCacheInvalidator />
        {children}
      </ClerkAuthBridge>
    </ClerkProvider>
  );
}
