import { StoreLayout } from "@/components/layout/store-layout";
import { useListBranches } from "@workspace/api-client-react";
import { Link } from "wouter";
import { MapPin, Clock, Phone, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Branches() {
  const { data: branches, isLoading } = useListBranches();

  return (
    <StoreLayout>
      <div className="bg-foreground text-background py-16 px-4 md:px-6 mb-12">
        <div className="container mx-auto text-center max-w-2xl">
          <h1 className="font-serif text-4xl md:text-5xl mb-6">Nuestras Sucursales</h1>
          <p className="font-sans text-background/80 opacity-90">
            Encuentra la sucursal de Mallorca más cercana a ti. Disfruta de nuestra panadería recién horneada, restaurante y tienda gourmet en la Ciudad de México.
          </p>
        </div>
      </div>

      <div className="container mx-auto px-4 md:px-6 pb-24">
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {[1, 2, 3].map(i => (
              <div key={i} className="border border-border p-6 space-y-4">
                <div className="h-8 bg-muted w-2/3 animate-pulse" />
                <div className="h-4 bg-muted w-full animate-pulse" />
                <div className="h-4 bg-muted w-1/2 animate-pulse" />
                <div className="h-32 bg-muted w-full mt-4 animate-pulse" />
              </div>
            ))}
          </div>
        ) : branches && branches.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {branches.map(branch => (
              <div key={branch.id} className="group border border-border bg-card flex flex-col hover:border-primary/50 transition-colors">
                {branch.imageUrl ? (
                  <div className="aspect-[16/9] w-full overflow-hidden bg-secondary">
                    <img 
                      src={branch.imageUrl} 
                      alt={`Sucursal ${branch.name}`} 
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                    />
                  </div>
                ) : (
                  <div className="aspect-[16/9] w-full bg-secondary flex items-center justify-center">
                    <MapPin className="h-8 w-8 text-muted-foreground/30" />
                  </div>
                )}
                
                <div className="p-8 flex flex-col flex-1">
                  <div className="flex justify-between items-start mb-4">
                    <h2 className="font-serif text-2xl text-foreground group-hover:text-primary transition-colors">
                      {branch.name}
                    </h2>
                    {!branch.active && (
                      <span className="text-[10px] uppercase tracking-wider bg-muted text-muted-foreground px-2 py-1">
                        Cerrada temporalmente
                      </span>
                    )}
                  </div>
                  
                  <div className="space-y-4 text-sm text-muted-foreground mb-8 flex-1">
                    <p className="flex items-start gap-3">
                      <MapPin className="h-4 w-4 shrink-0 mt-0.5" />
                      <span>{branch.address}, {branch.neighborhood}<br/>{branch.city}, {branch.state} {branch.postalCode}</span>
                    </p>
                    
                    <p className="flex items-center gap-3">
                      <Phone className="h-4 w-4 shrink-0" />
                      <span>{branch.phone}</span>
                    </p>
                    
                    <div className="flex items-start gap-3 pt-4 border-t border-border">
                      <Clock className="h-4 w-4 shrink-0 mt-0.5" />
                      <div className="space-y-1 w-full">
                        {branch.hours?.slice(0, 3).map((h, i) => (
                          <div key={i} className="flex justify-between text-xs">
                            <span className="font-medium">{h.label}</span>
                            <span>{h.closed ? 'Cerrado' : `${h.open} - ${h.close}`}</span>
                          </div>
                        ))}
                        {branch.hours && branch.hours.length > 3 && (
                          <div className="text-xs italic pt-1">Ver horario completo en detalles</div>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  <Button asChild variant="outline" className="w-full rounded-none border-border hover:bg-primary hover:text-primary-foreground hover:border-primary group-hover:border-primary">
                    <Link href={`/sucursales/${branch.slug}`} className="flex items-center justify-between">
                      Ver detalles de sucursal
                      <ChevronRight className="h-4 w-4" />
                    </Link>
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-24 bg-muted/30 border border-dashed border-border">
            <p className="text-muted-foreground">No hay sucursales disponibles en este momento.</p>
          </div>
        )}
      </div>
    </StoreLayout>
  );
}