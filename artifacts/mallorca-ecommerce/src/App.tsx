import { useEffect, useRef, type ReactNode } from 'react';
import { ClerkProvider } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { esES } from '@clerk/localizations';
import { shadcn } from '@clerk/themes';
import {
  Route,
  Switch,
  useLocation,
  Router as WouterRouter,
  Redirect
} from 'wouter';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';

import NotFound from '@/pages/not-found';
import Home from '@/pages/home';
import Store from '@/pages/store';
import ProductDetail from '@/pages/product-detail';
import Branches from '@/pages/branches';
import BranchDetail from '@/pages/branch-detail';
import SignInPage from '@/pages/sign-in';
import SignUpPage from '@/pages/sign-up';
import Cart from '@/pages/cart';
import Checkout from '@/pages/checkout';
import OrderDetails from '@/pages/order-details';
import Account from '@/pages/account';

import AdminDashboard from '@/pages/admin/dashboard';
import AdminProductsList from '@/pages/admin/products-list';
import AdminProductForm from '@/pages/admin/product-form';
import AdminOrdersList from '@/pages/admin/orders-list';
import AdminOrderDetail from '@/pages/admin/order-detail';
import AdminOrderNew from '@/pages/admin/order-new';
import AdminAgenda from '@/pages/admin/agenda';
import AdminInventory from '@/pages/admin/inventory';
import AdminImport from '@/pages/admin/import';
import AdminBranches from '@/pages/admin/branches';
import AdminBranchForm from '@/pages/admin/branch-form';
import AdminAlerts from '@/pages/admin/alerts';
import AdminBranchDetail from '@/pages/admin/branch-detail';
import AdminReports from '@/pages/admin/reports';
import AdminUsers from '@/pages/admin/users';
import AdminPaymentMethods from '@/pages/admin/payment-methods';
import { AdminGuard } from '@/components/layout/admin-guard';

import { CartProvider } from '@/lib/cart-context';
import {
  AuthShow,
  ClerkAuthBridge,
  LocalAuthProvider,
  useAppClerkListener,
} from '@/lib/app-auth';

const queryClient = new QueryClient();

const hostname = window.location.hostname.toLowerCase();
const isLoopbackHost = hostname === "localhost" || hostname === "127.0.0.1";
const envClerkPubKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as
  | string
  | undefined;

// On loopback, never call publishableKeyFromHost — it invents clerk.localhost
// and Clerk JS fails to load from https://clerk.localhost/...
const clerkPubKey = isLoopbackHost
  ? envClerkPubKey
  : publishableKeyFromHost(hostname, envClerkPubKey);

// Clerk's FAPI proxy only works behind the production API; skip it locally.
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
    socialButtonsBlockButton: "border border-border rounded-none bg-background hover:bg-muted text-foreground transition-colors",
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

function AccountRedirect() {
  return (
    <>
      <AuthShow when="signed-in">
        <Account />
      </AuthShow>
      <AuthShow when="signed-out">
        <Redirect to="/" />
      </AuthShow>
    </>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [location]);

  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function AppRoutes() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/tienda" component={Store} />
      <Route path="/producto/:slug" component={ProductDetail} />
      <Route path="/sucursales" component={Branches} />
      <Route path="/sucursales/:slug" component={BranchDetail} />

      <Route path="/carrito" component={Cart} />
      <Route path="/checkout" component={Checkout} />
      <Route path="/pedido/:id/:token" component={OrderDetails} />
      <Route path="/cuenta" component={AccountRedirect} />

      <Route path="/sign-in/*?" component={SignInPage} />
      <Route path="/sign-up/*?" component={SignUpPage} />

      <Route path="/admin">
        <AdminGuard><AdminDashboard /></AdminGuard>
      </Route>
      <Route path="/admin/productos">
        <AdminGuard><AdminProductsList /></AdminGuard>
      </Route>
      <Route path="/admin/productos/nuevo">
        <AdminGuard><AdminProductForm /></AdminGuard>
      </Route>
      <Route path="/admin/productos/:id">
        <AdminGuard><AdminProductForm /></AdminGuard>
      </Route>
      <Route path="/admin/pedidos/nuevo">
        <AdminGuard><AdminOrderNew /></AdminGuard>
      </Route>
      <Route path="/admin/pedidos/:id">
        <AdminGuard><AdminOrderDetail /></AdminGuard>
      </Route>
      <Route path="/admin/pedidos">
        <AdminGuard><AdminOrdersList /></AdminGuard>
      </Route>
      <Route path="/admin/agenda">
        <AdminGuard><AdminAgenda /></AdminGuard>
      </Route>
      <Route path="/admin/inventario">
        <AdminGuard><AdminInventory /></AdminGuard>
      </Route>
      <Route path="/admin/importar">
        <AdminGuard><AdminImport /></AdminGuard>
      </Route>
      <Route path="/admin/sucursales">
        <AdminGuard><AdminBranches /></AdminGuard>
      </Route>
      <Route path="/admin/sucursales/nueva">
        <AdminGuard><AdminBranchForm /></AdminGuard>
      </Route>
      <Route path="/admin/sucursales/:id/editar">
        <AdminGuard><AdminBranchForm /></AdminGuard>
      </Route>
      <Route path="/admin/sucursales/:id">
        <AdminGuard><AdminBranchDetail /></AdminGuard>
      </Route>
      <Route path="/admin/reportes">
        <AdminGuard><AdminReports /></AdminGuard>
      </Route>
      <Route path="/admin/usuarios">
        <AdminGuard><AdminUsers /></AdminGuard>
      </Route>
      <Route path="/admin/responsables">
        <AdminGuard>
          <Redirect to="/admin/usuarios?tab=asignaciones" />
        </AdminGuard>
      </Route>
      <Route path="/admin/formas-de-pago">
        <AdminGuard><AdminPaymentMethods /></AdminGuard>
      </Route>
      <Route path="/admin/alertas">
        <AdminGuard><AdminAlerts /></AdminGuard>
      </Route>

      <Route component={NotFound} />
    </Switch>
  );
}

function AppShell({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <ClerkQueryClientCacheInvalidator />
      <CartProvider>
        <RoutedErrorBoundary>{children}</RoutedErrorBoundary>
      </CartProvider>
    </QueryClientProvider>
  );
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();

  if (!clerkPubKey) {
    return (
      <LocalAuthProvider>
        <AppShell>
          <AppRoutes />
        </AppShell>
      </LocalAuthProvider>
    );
  }

  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      localization={esES}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <ClerkAuthBridge>
        <AppShell>
          <AppRoutes />
        </AppShell>
      </ClerkAuthBridge>
    </ClerkProvider>
  );
}

function App() {
  return (
    <TooltipProvider>
      <WouterRouter base={basePath}>
        <ClerkProviderWithRoutes />
      </WouterRouter>
      <Toaster />
    </TooltipProvider>
  );
}

export default App;
