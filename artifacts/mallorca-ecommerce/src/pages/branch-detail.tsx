import { StoreLayout } from "@/components/layout/store-layout";
import { useGetBranch } from "@workspace/api-client-react";
import { useParams, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { ArrowLeft, MapPin, Clock, Phone, Map, ExternalLink } from "lucide-react";
import { ProductCard } from "@/components/product-card";

export default function BranchDetail() {
  const { slug } = useParams<{ slug: string }>();
  const { data: branch, isLoading, isError } = useGetBranch(slug || "");

  if (isLoading) {
    return (
      <StoreLayout>
        <div className="container mx-auto px-4 py-12 md:py-24 animate-pulse">
          <div className="h-64 bg-muted w-full mb-12" />
          <div className="flex flex-col md:flex-row gap-12">
            <div className="w-full md:w-1/3 space-y-6">
              <div className="h-10 bg-muted w-3/4" />
              <div className="h-40 bg-muted w-full" />
            </div>
            <div className="w-full md:w-2/3">
              <div className="grid grid-cols-2 gap-6">
                {[1, 2, 3, 4].map(i => <div key={i} className="aspect-[4/5] bg-muted" />)}
              </div>
            </div>
          </div>
        </div>
      </StoreLayout>
    );
  }

  if (isError || !branch) {
    return (
      <StoreLayout>
        <div className="container mx-auto px-4 py-32 text-center">
          <h2 className="font-serif text-3xl mb-4">Sucursal no encontrada</h2>
          <p className="text-muted-foreground mb-8">La sucursal que buscas no existe.</p>
          <Button asChild className="rounded-none">
            <Link href="/sucursales">Ver todas las sucursales</Link>
          </Button>
        </div>
      </StoreLayout>
    );
  }

  return (
    <StoreLayout>
      {/* Branch Hero */}
      <div className="relative h-[40dvh] min-h-[300px] w-full bg-foreground flex items-end">
        {branch.imageUrl && (
          <img 
            src={branch.imageUrl} 
            alt={branch.name}
            className="absolute inset-0 w-full h-full object-cover opacity-60 mix-blend-overlay"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-transparent" />
        
        <div className="container mx-auto px-4 relative z-10 pb-8">
          <Link href="/sucursales" className="inline-flex items-center text-sm font-medium text-foreground/70 hover:text-foreground mb-4 transition-colors">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Volver a sucursales
          </Link>
          <h1 className="font-serif text-4xl md:text-5xl lg:text-6xl text-foreground">
            {branch.name}
          </h1>
        </div>
      </div>

      <div className="container mx-auto px-4 py-12">
        <div className="flex flex-col lg:flex-row gap-16">
          
          {/* Info Sidebar */}
          <aside className="w-full lg:w-1/3 shrink-0 flex flex-col gap-10">
            {branch.description && (
              <div>
                <p className="font-sans text-foreground/80 leading-relaxed text-lg font-light">
                  {branch.description}
                </p>
              </div>
            )}

            <div className="space-y-8 bg-secondary/30 p-8 border border-border">
              <div>
                <h3 className="font-sans text-xs uppercase tracking-widest font-semibold mb-4 text-foreground/70">Ubicación</h3>
                <p className="flex items-start gap-3 text-sm text-foreground/90">
                  <MapPin className="h-5 w-5 shrink-0 mt-0.5 text-primary" />
                  <span>
                    {branch.address}<br/>
                    {branch.neighborhood}<br/>
                    {branch.borough && <>{branch.borough}<br/></>}
                    {branch.city}, {branch.state} {branch.postalCode}
                  </span>
                </p>
                <div className="mt-4 pl-8">
                  <a 
                    href={branch.mapsUrl} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-sm font-medium text-primary hover:underline inline-flex items-center"
                  >
                    Ver en Google Maps
                    <ExternalLink className="h-3 w-3 ml-1" />
                  </a>
                </div>
              </div>

              <div>
                <h3 className="font-sans text-xs uppercase tracking-widest font-semibold mb-4 text-foreground/70">Contacto</h3>
                <p className="flex items-center gap-3 text-sm text-foreground/90 mb-2">
                  <Phone className="h-4 w-4 shrink-0 text-primary" />
                  <a href={`tel:${branch.phone}`} className="hover:text-primary">{branch.phone}</a>
                </p>
                {branch.whatsapp && (
                  <p className="flex items-center gap-3 text-sm text-foreground/90">
                    <span className="w-4 flex justify-center text-primary font-bold text-lg leading-none shrink-0">W</span>
                    <a href={`https://wa.me/${branch.whatsapp.replace(/\D/g,'')}`} target="_blank" rel="noopener noreferrer" className="hover:text-primary">
                      {branch.whatsapp}
                    </a>
                  </p>
                )}
              </div>

              <div>
                <h3 className="font-sans text-xs uppercase tracking-widest font-semibold mb-4 text-foreground/70">Horario</h3>
                <div className="space-y-2 text-sm text-foreground/90">
                  {branch.hours?.map((h, i) => (
                    <div key={i} className="flex justify-between border-b border-border/50 pb-1 last:border-0">
                      <span className="font-medium">{h.label}</span>
                      <span>{h.closed ? 'Cerrado' : `${h.open} - ${h.close}`}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-4 border-t border-border">
                <div className="flex gap-4">
                  <div className="flex-1 text-center p-3 bg-background border border-border">
                    <span className="block text-xs uppercase tracking-wider text-muted-foreground mb-1">Pick up</span>
                    <span className="font-semibold text-sm">{branch.pickupAvailable ? 'Sí' : 'No'}</span>
                  </div>
                  <div className="flex-1 text-center p-3 bg-background border border-border">
                    <span className="block text-xs uppercase tracking-wider text-muted-foreground mb-1">Delivery</span>
                    <span className="font-semibold text-sm">{branch.deliveryAvailable ? 'Sí' : 'No'}</span>
                  </div>
                </div>
              </div>

              {branch.openTableUrl && (
                <Button asChild className="w-full rounded-none h-12 bg-foreground text-background hover:bg-foreground/90">
                  <a href={branch.openTableUrl} target="_blank" rel="noopener noreferrer">
                    Reservar Mesa
                  </a>
                </Button>
              )}
            </div>
          </aside>

          {/* Branch Products */}
          <div className="flex-1">
            <div className="flex items-end justify-between mb-8 pb-4 border-b border-border">
              <h2 className="font-serif text-3xl">Disponible en esta sucursal</h2>
              <span className="text-sm text-muted-foreground hidden sm:block">
                {branch.products?.length || 0} productos
              </span>
            </div>

            {branch.products && branch.products.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {branch.products.map(product => (
                  <ProductCard 
                    key={product.id} 
                    product={product} 
                    showBranchAvailability={true}
                  />
                ))}
              </div>
            ) : (
              <div className="py-20 text-center bg-secondary/20 border border-border">
                <p className="text-muted-foreground">No hay productos listados para esta sucursal.</p>
              </div>
            )}
          </div>
          
        </div>
      </div>
    </StoreLayout>
  );
}