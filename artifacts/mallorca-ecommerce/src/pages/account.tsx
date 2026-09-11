import { StoreLayout } from "@/components/layout/store-layout";
import { useGetMe, useListMyOrders, useUpdateMe } from "@workspace/api-client-react";
import { useClerk } from "@clerk/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LogOut, Package, User, Clock, CheckCircle2 } from "lucide-react";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";

export default function AccountPage() {
  const { data: user, isLoading: isLoadingUser } = useGetMe();
  const { data: orders, isLoading: isLoadingOrders } = useListMyOrders();
  const updateMe = useUpdateMe();
  const { signOut } = useClerk();
  const { toast } = useToast();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");

  useEffect(() => {
    if (user) {
      setFirstName(user.firstName || "");
      setLastName(user.lastName || "");
      setPhone(user.phone || "");
    }
  }, [user]);

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await updateMe.mutateAsync({
        data: { firstName, lastName, phone }
      });
      toast({ title: "Perfil actualizado", description: "Tus datos se han guardado exitosamente." });
    } catch (err: any) {
      toast({ title: "Error", description: "No se pudo actualizar tu perfil.", variant: "destructive" });
    }
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(price);
  };

  if (isLoadingUser) {
    return (
      <StoreLayout>
        <div className="container mx-auto px-4 py-16 animate-pulse">
          <div className="h-10 bg-muted w-1/4 mb-12" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
            <div className="md:col-span-1 h-64 bg-muted" />
            <div className="md:col-span-2 h-96 bg-muted" />
          </div>
        </div>
      </StoreLayout>
    );
  }

  if (!user) return null;

  return (
    <StoreLayout>
      <div className="container mx-auto px-4 py-12 md:py-16">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-12 gap-4">
          <div>
            <h1 className="font-serif text-4xl md:text-5xl mb-2">Mi Cuenta</h1>
            <p className="text-muted-foreground">Hola, {user.firstName || user.email}</p>
          </div>
          <Button variant="outline" onClick={() => signOut({ redirectUrl: "/" })} className="rounded-none border-border hover:bg-muted text-foreground h-10 px-6 gap-2">
            <LogOut className="w-4 h-4" />
            Cerrar Sesión
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
          {/* Profile Form */}
          <div className="lg:col-span-1">
            <div className="bg-secondary/20 border border-border p-6 md:p-8">
              <h2 className="font-serif text-2xl mb-6 flex items-center gap-2 border-b border-border pb-4">
                <User className="w-5 h-5 text-primary" />
                Datos Personales
              </h2>
              <form onSubmit={handleUpdateProfile} className="space-y-6">
                <div>
                  <Label htmlFor="email">Correo electrónico (solo lectura)</Label>
                  <Input id="email" value={user.email} disabled className="mt-1 bg-muted text-muted-foreground" />
                </div>
                <div>
                  <Label htmlFor="firstName">Nombre</Label>
                  <Input id="firstName" value={firstName} onChange={e => setFirstName(e.target.value)} className="mt-1" />
                </div>
                <div>
                  <Label htmlFor="lastName">Apellidos</Label>
                  <Input id="lastName" value={lastName} onChange={e => setLastName(e.target.value)} className="mt-1" />
                </div>
                <div>
                  <Label htmlFor="phone">Teléfono</Label>
                  <Input id="phone" value={phone} onChange={e => setPhone(e.target.value)} className="mt-1" />
                </div>
                <Button type="submit" disabled={updateMe.isPending} className="w-full h-12 rounded-none bg-primary text-primary-foreground hover:bg-primary/90 mt-4">
                  {updateMe.isPending ? "Guardando..." : "Guardar Cambios"}
                </Button>
              </form>
            </div>
          </div>

          {/* Orders */}
          <div className="lg:col-span-2">
            <div className="bg-background border border-border p-6 md:p-8">
              <h2 className="font-serif text-2xl mb-6 flex items-center gap-2 border-b border-border pb-4">
                <Package className="w-5 h-5 text-primary" />
                Historial de Pedidos
              </h2>

              {isLoadingOrders ? (
                <div className="space-y-4">
                  {[1, 2, 3].map(i => <div key={i} className="h-24 bg-muted animate-pulse" />)}
                </div>
              ) : !orders || orders.length === 0 ? (
                <div className="text-center py-12 border border-dashed border-border bg-secondary/10">
                  <Package className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-20" />
                  <h3 className="font-serif text-xl mb-2">Aún no tienes pedidos</h3>
                  <p className="text-muted-foreground text-sm mb-6">Tus compras recientes aparecerán aquí.</p>
                  <Button asChild variant="outline" className="rounded-none">
                    <Link href="/tienda">Ir a comprar</Link>
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  {orders.map(order => {
                    const isCompleted = order.status === 'completed';
                    const date = new Date(order.createdAt).toLocaleDateString('es-MX', {
                      year: 'numeric', month: 'long', day: 'numeric'
                    });
                    
                    return (
                      <div key={order.id} className="border border-border p-4 md:p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 hover:border-primary/50 transition-colors">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-bold">#{order.orderNumber}</span>
                            <span className="text-muted-foreground text-sm flex items-center gap-1">
                              <Clock className="w-3 h-3" /> {date}
                            </span>
                          </div>
                          <p className="text-sm text-muted-foreground capitalize">{order.status.replace('_', ' ')} • {(order as any).fulfillmentMethod || 'Estándar'}</p>
                          <p className="font-medium text-lg mt-2">{formatPrice(order.total)}</p>
                        </div>
                        
                        <div className="flex items-center gap-4 w-full md:w-auto mt-2 md:mt-0">
                          {isCompleted && <CheckCircle2 className="w-5 h-5 text-primary hidden md:block" />}
                          <Button asChild variant="outline" className="rounded-none border-border w-full md:w-auto">
                            <Link href={`/pedido/${order.id}/none`}>Ver Detalles</Link>
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </StoreLayout>
  );
}
