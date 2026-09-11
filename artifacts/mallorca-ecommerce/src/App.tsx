import { useEffect, useRef, type ReactNode } from 'react';
import { ClerkProvider, Show, useClerk } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
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
import AdminInventory from '@/pages/admin/inventory';
import AdminImport from '@/pages/admin/import';
import AdminBranches from '@/pages/admin/branches';
import AdminAlerts from '@/pages/admin/alerts';
import { AdminGuard } from '@/components/layout/admin-guard';

import { CartProvider } from '@/lib/cart-context';

const queryClient = new QueryClient();

// Setup Clerk
const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || "/"
    : path;
}

if (!clerkPubKey) {
  throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY in .env file');
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
    dividerLine: "bg-border h-[1px]",
    alert: "bg-destructive/10 border border-destructive/20 rounded-none",
    otpCodeFieldInput: "border border-input bg-background rounded-none focus:ring-1 focus:ring-ring text-foreground",
    formFieldRow: "mb-4",
    main: "w-full space-y-6",
  },
};

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const queryClient = useQueryClient();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
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

function HomeRedirect() {
  return (
    <>
      <Show when="signed-in">
        <Redirect to="/cuenta" />
      </Show>
      <Show when="signed-out">
        <Home />
      </Show>
    </>
  );
}

function AccountRedirect() {
  return (
    <>
      <Show when="signed-in">
        <Account />
      </Show>
      <Show when="signed-out">
        <Redirect to="/" />
      </Show>
    </>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();

  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      localization={{
        signIn: {
          start: {
            title: "Bienvenido",
            subtitle: "Inicia sesión para acceder a tu cuenta",
          },
        },
        signUp: {
          start: {
            title: "Crea tu cuenta",
            subtitle: "Empieza hoy mismo",
          },
        },
      }}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <ClerkQueryClientCacheInvalidator />
        <CartProvider>
          <RoutedErrorBoundary>
            <Switch>
              <Route path="/" component={HomeRedirect} />
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

              {/* Admin Routes */}
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
              <Route path="/admin/pedidos">
                <AdminGuard><AdminOrdersList /></AdminGuard>
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
              <Route path="/admin/alertas">
                <AdminGuard><AdminAlerts /></AdminGuard>
              </Route>
              
              <Route component={NotFound} />
            </Switch>
          </RoutedErrorBoundary>
        </CartProvider>
      </QueryClientProvider>
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
