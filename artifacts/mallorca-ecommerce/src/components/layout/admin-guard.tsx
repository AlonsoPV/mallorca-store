import { ReactNode } from "react";
import { useAuth } from "@clerk/react";
import { useGetMe, getGetMeQueryKey } from "@workspace/api-client-react";
import { Redirect, Link } from "wouter";
import { StoreLayout } from "./store-layout";
import { Loader2, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

export function AdminGuard({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth();
  const [location] = useLocation();
  
  const { data: user, isLoading: isUserLoading, isError } = useGetMe({
    query: {
      enabled: isLoaded && !!isSignedIn,
      queryKey: getGetMeQueryKey()
    }
  });

  if (!isLoaded) {
    return (
      <StoreLayout>
        <div className="flex h-[50vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </StoreLayout>
    );
  }

  if (!isSignedIn) {
    return <Redirect to={`/sign-in?redirect_url=${encodeURIComponent(location)}`} />;
  }

  if (isUserLoading) {
    return (
      <StoreLayout>
        <div className="flex h-[50vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </StoreLayout>
    );
  }

  if (isError || !user || !["staff", "branch_manager", "operations_manager", "operations", "manager", "admin"].includes(user.role)) {
    return (
      <StoreLayout>
        <div className="flex flex-col items-center justify-center h-[60vh] text-center px-4">
          <ShieldAlert className="h-16 w-16 text-destructive mb-4" />
          <h2 className="text-2xl font-serif mb-2 text-foreground">Acceso Denegado</h2>
          <p className="text-muted-foreground mb-8 max-w-md">
            No tienes los permisos necesarios para acceder a esta área. Si crees que es un error, contacta al administrador del sistema.
          </p>
          <Button asChild className="rounded-none">
            <Link href="/">Volver al inicio</Link>
          </Button>
        </div>
      </StoreLayout>
    );
  }

  return <>{children}</>;
}
