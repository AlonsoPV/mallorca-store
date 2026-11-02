import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react';
import {
  Route,
  Switch,
  useLocation,
  useSearch,
  Router as WouterRouter,
  Redirect
} from 'wouter';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';

import Home from '@/pages/home';
import { AdminGuard } from '@/components/layout/admin-guard';
import { CartProvider } from '@/lib/cart-context';
import {
  AuthShow,
  GuestAuthProvider,
  LocalAuthProvider,
} from '@/lib/app-auth';

const Store = lazy(() => import('@/pages/store'));
const ProductDetail = lazy(() => import('@/pages/product-detail'));
const Branches = lazy(() => import('@/pages/branches'));
const BranchDetail = lazy(() => import('@/pages/branch-detail'));
const SignInPage = lazy(() => import('@/pages/sign-in'));
const SignUpPage = lazy(() => import('@/pages/sign-up'));
const ForgotPasswordPage = lazy(() => import('@/pages/forgot-password').then((m) => ({ default: m.ForgotPasswordPage })));
const ResetPasswordPage = lazy(() => import('@/pages/forgot-password').then((m) => ({ default: m.ResetPasswordPage })));
const Cart = lazy(() => import('@/pages/cart'));
const Checkout = lazy(() => import('@/pages/checkout'));
const OrderDetails = lazy(() => import('@/pages/order-details'));
const Account = lazy(() => import('@/pages/account'));
const PrivacyPage = lazy(() => import('@/pages/legal').then((m) => ({ default: m.PrivacyPage })));
const TermsPage = lazy(() => import('@/pages/legal').then((m) => ({ default: m.TermsPage })));
const PanettonePage = lazy(() => import('@/pages/panettone'));
const NotFound = lazy(() => import('@/pages/not-found'));

const AdminDashboard = lazy(() => import('@/pages/admin/dashboard'));
const AdminProductsList = lazy(() => import('@/pages/admin/products-list'));
const AdminProductForm = lazy(() => import('@/pages/admin/product-form'));
const AdminOrdersList = lazy(() => import('@/pages/admin/orders-list'));
const AdminOrderDetail = lazy(() => import('@/pages/admin/order-detail'));
const AdminOrderNew = lazy(() => import('@/pages/admin/order-new'));
const AdminAgenda = lazy(() => import('@/pages/admin/agenda'));
const AdminImport = lazy(() => import('@/pages/admin/import'));
const AdminBranches = lazy(() => import('@/pages/admin/branches'));
const AdminBranchForm = lazy(() => import('@/pages/admin/branch-form'));
const AdminAlerts = lazy(() => import('@/pages/admin/alerts'));
const AdminBranchDetail = lazy(() => import('@/pages/admin/branch-detail'));
const AdminReports = lazy(() => import('@/pages/admin/reports'));
const AdminUsers = lazy(() => import('@/pages/admin/users'));
const AdminPaymentMethods = lazy(() => import('@/pages/admin/payment-methods'));
const AdminMailboxes = lazy(() => import('@/pages/admin/mailboxes'));
const AdminMenus = lazy(() => import('@/pages/admin/menus'));
const ClerkShell = lazy(() => import('@/clerk-shell'));

function AdminRoute({ children }: { children: ReactNode }) {
  return (
    <AdminGuard>
      <Suspense
        fallback={
          <div className="flex min-h-[40vh] items-center justify-center text-sm text-muted-foreground">
            Cargando panel…
          </div>
        }
      >
        {children}
      </Suspense>
    </AdminGuard>
  );
}

function Page({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<div className="min-h-[50vh] bg-background" />}>
      {children}
    </Suspense>
  );
}

const queryClient = new QueryClient();

const hostname = window.location.hostname.toLowerCase();
const isLoopbackHost = hostname === "localhost" || hostname === "127.0.0.1";
const envClerkPubKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as
  | string
  | undefined;
const shouldLoadClerk = isLoopbackHost ? Boolean(envClerkPubKey) : true;
const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function needsClerkSoon(path: string) {
  return (
    path.startsWith("/sign-in") ||
    path.startsWith("/sign-up") ||
    path.startsWith("/cuenta") ||
    path.startsWith("/admin") ||
    path.startsWith("/recuperar")
  );
}

function AccountRedirect() {
  return (
    <>
      <AuthShow when="signed-in">
        <Page><Account /></Page>
      </AuthShow>
      <AuthShow when="signed-out">
        <Redirect to="/sign-in" />
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

function productWorkspaceHref(search: string) {
  const params = new URLSearchParams(search);
  params.delete("tab");
  const query = params.get("search");
  if (query && !params.has("q")) params.set("q", query);
  params.delete("search");
  const views: Record<string, string> = { LOW_STOCK: "low", CRITICAL_STOCK: "critical", OUT_OF_STOCK: "out", NORMAL: "normal" };
  const state = params.get("state");
  if (state && views[state]) params.set("view", views[state]);
  params.delete("state");
  return `/admin/productos${params.size ? `?${params}` : ""}`;
}

function AdminProductWorkspace() {
  const search = useSearch();
  const params = new URLSearchParams(search);
  if (params.has("tab") || params.has("state") || params.has("search")) {
    return <Redirect to={productWorkspaceHref(search)} replace />;
  }
  return <AdminProductsList />;
}

function LegacyInventoryRedirect() {
  return <Redirect to={productWorkspaceHref(useSearch())} replace />;
}

function AppRoutes() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/tienda">{() => <Page><Store /></Page>}</Route>
      <Route path="/producto/:slug">{() => <Page><ProductDetail /></Page>}</Route>
      <Route path="/sucursales">{() => <Page><Branches /></Page>}</Route>
      <Route path="/sucursales/:slug">{() => <Page><BranchDetail /></Page>}</Route>
      <Route path="/panettone">{() => <Page><PanettonePage /></Page>}</Route>
      <Route path="/terminos-y-condiciones">{() => <Page><TermsPage /></Page>}</Route>
      <Route path="/aviso-de-privacidad">{() => <Page><PrivacyPage /></Page>}</Route>

      <Route path="/carrito">{() => <Page><Cart /></Page>}</Route>
      <Route path="/checkout">{() => <Page><Checkout /></Page>}</Route>
      <Route path="/pedido/:id/:token">{() => <Page><OrderDetails /></Page>}</Route>
      <Route path="/cuenta" component={AccountRedirect} />

      <Route path="/sign-in/*?">{() => <Page><SignInPage /></Page>}</Route>
      <Route path="/sign-up/*?">{() => <Page><SignUpPage /></Page>}</Route>
      <Route path="/recuperar-contrasena">{() => <Page><ForgotPasswordPage /></Page>}</Route>
      <Route path="/recuperar-contrasena/:token">{() => <Page><ResetPasswordPage /></Page>}</Route>

      <Route path="/admin">
        <AdminRoute><AdminDashboard /></AdminRoute>
      </Route>
      <Route path="/admin/productos">
        <AdminRoute><AdminProductWorkspace /></AdminRoute>
      </Route>
      <Route path="/admin/productos/nuevo">
        <AdminRoute><AdminProductForm /></AdminRoute>
      </Route>
      <Route path="/admin/productos/:id">
        <AdminRoute><AdminProductForm /></AdminRoute>
      </Route>
      <Route path="/admin/pedidos/nuevo">
        <AdminRoute><AdminOrderNew /></AdminRoute>
      </Route>
      <Route path="/admin/pedidos/:id">
        <AdminRoute><AdminOrderDetail /></AdminRoute>
      </Route>
      <Route path="/admin/pedidos">
        <AdminRoute><AdminOrdersList /></AdminRoute>
      </Route>
      <Route path="/admin/agenda">
        <AdminRoute><AdminAgenda /></AdminRoute>
      </Route>
      <Route path="/admin/inventario">
        <AdminRoute><LegacyInventoryRedirect /></AdminRoute>
      </Route>
      <Route path="/admin/importar">
        <AdminRoute><AdminImport /></AdminRoute>
      </Route>
      <Route path="/admin/sucursales">
        <AdminRoute><AdminBranches /></AdminRoute>
      </Route>
      <Route path="/admin/sucursales/nueva">
        <AdminRoute><AdminBranchForm /></AdminRoute>
      </Route>
      <Route path="/admin/sucursales/:id/editar">
        <AdminRoute><AdminBranchForm /></AdminRoute>
      </Route>
      <Route path="/admin/sucursales/:id">
        <AdminRoute><AdminBranchDetail /></AdminRoute>
      </Route>
      <Route path="/admin/reportes">
        <AdminRoute><AdminReports /></AdminRoute>
      </Route>
      <Route path="/admin/roles">
        <Redirect to="/admin/usuarios?tab=roles" />
      </Route>
      <Route path="/admin/usuarios">
        <AdminRoute><AdminUsers /></AdminRoute>
      </Route>
      <Route path="/admin/responsables">
        <AdminRoute>
          <Redirect to="/admin/usuarios?tab=asignaciones" />
        </AdminRoute>
      </Route>
      <Route path="/admin/formas-de-pago">
        <AdminRoute><AdminPaymentMethods /></AdminRoute>
      </Route>
      <Route path="/admin/correos">
        <AdminRoute><AdminMailboxes /></AdminRoute>
      </Route>
      <Route path="/admin/menus">
        <AdminRoute><AdminMenus /></AdminRoute>
      </Route>
      <Route path="/admin/alertas">
        <AdminRoute><AdminAlerts /></AdminRoute>
      </Route>

      <Route>{() => <Page><NotFound /></Page>}</Route>
    </Switch>
  );
}

function AppContent() {
  return (
    <CartProvider>
      <RoutedErrorBoundary>
        <AppRoutes />
      </RoutedErrorBoundary>
    </CartProvider>
  );
}

function GuestShell() {
  if (isLoopbackHost && !envClerkPubKey) {
    return (
      <LocalAuthProvider>
        <AppContent />
      </LocalAuthProvider>
    );
  }
  return (
    <GuestAuthProvider>
      <AppContent />
    </GuestAuthProvider>
  );
}

function AuthShell() {
  const [location] = useLocation();
  const [clerkReady, setClerkReady] = useState(() => needsClerkSoon(location));

  useEffect(() => {
    if (!shouldLoadClerk || clerkReady) return;
    if (needsClerkSoon(location)) {
      setClerkReady(true);
      return;
    }
    const idle = window as Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    if (idle.requestIdleCallback) {
      const id = idle.requestIdleCallback(() => setClerkReady(true), { timeout: 2000 });
      return () => idle.cancelIdleCallback?.(id);
    }
    const timer = window.setTimeout(() => setClerkReady(true), 1);
    return () => window.clearTimeout(timer);
  }, [clerkReady, location]);

  if (!shouldLoadClerk || !clerkReady) {
    return <GuestShell />;
  }

  return (
    <Suspense fallback={<GuestShell />}>
      <ClerkShell>
        <AppContent />
      </ClerkShell>
    </Suspense>
  );
}

function App() {
  return (
    <TooltipProvider>
      <QueryClientProvider client={queryClient}>
        <WouterRouter base={basePath}>
          <AuthShell />
        </WouterRouter>
        <Toaster />
      </QueryClientProvider>
    </TooltipProvider>
  );
}

export default App;
