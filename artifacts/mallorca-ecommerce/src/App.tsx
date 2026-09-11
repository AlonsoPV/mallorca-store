import { type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import Home from '@/pages/home';
import Store from '@/pages/store';
import ProductDetail from '@/pages/product-detail';
import Branches from '@/pages/branches';
import BranchDetail from '@/pages/branch-detail';
import AdminDashboard from '@/pages/admin/dashboard';
import AdminProductsList from '@/pages/admin/products-list';
import AdminProductForm from '@/pages/admin/product-form';
import {
  Route,
  Switch,
  useLocation,
  Router as WouterRouter,
} from 'wouter';

const queryClient = new QueryClient();

function Router() {
  return (
    <RoutedErrorBoundary>
      <Switch>
        {/* Storefront Routes */}
        <Route path="/" component={Home} />
        <Route path="/tienda" component={Store} />
        <Route path="/producto/:slug" component={ProductDetail} />
        <Route path="/sucursales" component={Branches} />
        <Route path="/sucursales/:slug" component={BranchDetail} />
        
        {/* Admin Routes */}
        <Route path="/admin" component={AdminDashboard} />
        <Route path="/admin/productos" component={AdminProductsList} />
        <Route path="/admin/productos/nuevo" component={AdminProductForm} />
        <Route path="/admin/productos/:id" component={AdminProductForm} />
        
        <Route component={NotFound} />
      </Switch>
    </RoutedErrorBoundary>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
