import type { ProductCard as ProductCardType } from "@workspace/api-client-react";
import { Link } from "wouter";
import { cn } from "@/lib/utils";

interface ProductCardProps {
  product: ProductCardType;
  className?: string;
  showBranchAvailability?: boolean;
}

export function ProductCard({ product, className, showBranchAvailability = false }: ProductCardProps) {
  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN'
    }).format(price);
  };

  const isAvailable = product.availability && product.availability.length > 0 
    ? product.availability.some(a => a.available && a.inventory > 0)
    : true; // Default true if no availability data provided

  return (
    <Link href={`/producto/${product.slug}`}>
      <article className={cn("group flex flex-col cursor-pointer", className)}>
        <div className="relative aspect-[4/5] mb-4 overflow-hidden bg-muted">
          {product.imageUrl ? (
            <img 
              src={product.imageUrl} 
              alt={product.name} 
              className="object-cover w-full h-full transition-transform duration-700 group-hover:scale-105"
              loading="lazy"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-secondary/50 text-muted-foreground">
              <span className="font-serif italic text-sm">Sin imagen</span>
            </div>
          )}
          
          <div className="absolute top-3 left-3 flex flex-col gap-2">
            {product.featured && (
              <span className="bg-foreground text-background text-[10px] uppercase tracking-widest px-2 py-1">
                Destacado
              </span>
            )}
            {product.seasonal && (
              <span className="bg-primary text-primary-foreground text-[10px] uppercase tracking-widest px-2 py-1">
                Temporada
              </span>
            )}
            {!isAvailable && (
              <span className="bg-background/90 text-foreground text-[10px] uppercase tracking-widest px-2 py-1 backdrop-blur-sm">
                Agotado
              </span>
            )}
          </div>
        </div>
        
        <div className="flex flex-col flex-1">
          <div className="flex justify-between items-start gap-2 mb-1">
            <h3 className="font-serif text-lg leading-tight text-foreground group-hover:text-primary transition-colors line-clamp-2">
              {product.name}
            </h3>
          </div>
          
          <p className="text-sm text-muted-foreground line-clamp-1 mb-3">
            {product.shortDescription}
          </p>
          
          <div className="mt-auto flex items-center gap-2">
            {product.salePrice ? (
              <>
                <span className="font-medium text-primary">{formatPrice(product.salePrice)}</span>
                <span className="text-sm text-muted-foreground line-through">{formatPrice(product.price)}</span>
              </>
            ) : (
              <span className="font-medium text-foreground">{formatPrice(product.price)}</span>
            )}
          </div>
        </div>
      </article>
    </Link>
  );
}