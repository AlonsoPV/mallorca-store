import { StoreLayout } from "@/components/layout/store-layout";
import { useGetProduct, useAddCartItem, useCreateCartSession, getGetCartQueryKey } from "@workspace/api-client-react";
import { useParams, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Plus, Minus, Info, AlertCircle, ShoppingBag } from "lucide-react";
import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import { useCart } from "@/lib/cart-context";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export default function ProductDetail() {
  const { slug } = useParams<{ slug: string }>();
  const { data: product, isLoading, isError } = useGetProduct(slug || "");
  const [quantity, setQuantity] = useState(1);
  const [selectedVariant, setSelectedVariant] = useState<number | null>(null);
  
  const { cartId, branchId, setCartSession, clearCartSession } = useCart();
  const [selectedBranch, setSelectedBranch] = useState<number | null>(branchId);
  const [branchChangeConfirmOpen, setBranchChangeConfirmOpen] = useState(false);
  const [pendingBranchSelect, setPendingBranchSelect] = useState<number | null>(null);
  
  const addCartItem = useAddCartItem();
  const createSession = useCreateCartSession();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // If a branch is selected, make sure we only show price/availability for that branch.
  const currentBranchAvailability = useMemo(() => {
    if (!product || !selectedBranch) return null;
    return product.availability.find(a => a.branchId === selectedBranch);
  }, [product, selectedBranch]);

  if (isLoading) {
    return (
      <StoreLayout>
        <div className="container mx-auto px-4 py-12 md:py-24 animate-pulse">
          <div className="flex flex-col md:flex-row gap-12 lg:gap-24">
            <div className="w-full md:w-1/2 aspect-[4/5] bg-muted" />
            <div className="w-full md:w-1/2 space-y-6">
              <div className="h-10 bg-muted w-3/4" />
              <div className="h-6 bg-muted w-1/4" />
              <div className="h-24 bg-muted w-full mt-8" />
              <div className="h-12 bg-muted w-full mt-8" />
            </div>
          </div>
        </div>
      </StoreLayout>
    );
  }

  if (isError || !product) {
    return (
      <StoreLayout>
        <div className="container mx-auto px-4 py-32 text-center">
          <h2 className="font-serif text-3xl mb-4">Producto no encontrado</h2>
          <p className="text-muted-foreground mb-8">El producto que buscas no existe o ha sido retirado.</p>
          <Button asChild className="rounded-none">
            <Link href="/tienda">Volver a la tienda</Link>
          </Button>
        </div>
      </StoreLayout>
    );
  }

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN'
    }).format(price);
  };

  const currentPrice = selectedVariant 
    ? (product.variants.find(v => v.id === selectedVariant)?.salePrice || product.variants.find(v => v.id === selectedVariant)?.price || product.price)
    : (currentBranchAvailability?.salePrice || currentBranchAvailability?.price || product.salePrice || product.price);

  const handleBranchSelect = (val: string) => {
    const newBranchId = parseInt(val, 10);
    if (cartId && branchId && newBranchId !== branchId) {
      setPendingBranchSelect(newBranchId);
      setBranchChangeConfirmOpen(true);
    } else {
      setSelectedBranch(newBranchId);
    }
  };

  const confirmBranchChange = () => {
    clearCartSession();
    setSelectedBranch(pendingBranchSelect);
    setBranchChangeConfirmOpen(false);
    setPendingBranchSelect(null);
  };

  const handleAddToCart = async () => {
    if (!selectedBranch) {
      toast({
        title: "Selecciona una sucursal",
        description: "Necesitamos saber en qué sucursal recogerás o desde dónde enviaremos tu pedido.",
        variant: "destructive"
      });
      return;
    }

    try {
      let activeCartId = cartId;
      
      if (!activeCartId || branchId !== selectedBranch) {
        const session = await createSession.mutateAsync({
          data: { branchId: selectedBranch, cartId: activeCartId }
        });
        activeCartId = session.id;
        setCartSession(session.id, selectedBranch);
      }

      await addCartItem.mutateAsync({
        id: activeCartId,
        data: {
          productId: product.id,
          variantId: selectedVariant,
          quantity
        }
      });

      queryClient.invalidateQueries({ queryKey: getGetCartQueryKey(activeCartId) });

      toast({
        title: "Agregado al carrito",
        description: `${quantity}x ${product.name} agregado exitosamente.`,
      });
      
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message || "No se pudo agregar el producto al carrito.",
        variant: "destructive"
      });
    }
  };

  return (
    <StoreLayout>
      <div className="container mx-auto px-4 py-8 md:py-16">
        <Link href="/tienda" className="inline-flex items-center text-sm font-medium text-muted-foreground hover:text-foreground mb-8 transition-colors">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Volver al catálogo
        </Link>

        <div className="flex flex-col md:flex-row gap-12 lg:gap-20">
          {/* Images */}
          <div className="w-full md:w-1/2">
            <div className="aspect-[4/5] bg-secondary relative overflow-hidden mb-4">
              {product.imageUrl ? (
                <img 
                  src={product.imageUrl} 
                  alt={product.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                  <span className="font-serif italic text-lg">Sin imagen</span>
                </div>
              )}
            </div>
            
            {product.gallery && product.gallery.length > 0 && (
              <div className="grid grid-cols-4 gap-4">
                {product.gallery.map((img, i) => (
                  <div key={i} className="aspect-square bg-secondary cursor-pointer hover:opacity-80 transition-opacity">
                    <img src={img} alt={`${product.name} ${i}`} className="w-full h-full object-cover" />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Details */}
          <div className="w-full md:w-1/2 flex flex-col">
            <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground font-semibold">
              <Link href={`/tienda?categorySlug=${product.categorySlug}`} className="hover:text-primary transition-colors">
                {product.categoryName}
              </Link>
            </div>
            
            <h1 className="font-serif text-4xl md:text-5xl lg:text-6xl text-foreground leading-[1.1] mb-4">
              {product.name}
            </h1>
            
            <div className="text-2xl font-serif mb-8 text-foreground flex items-center gap-3">
              {formatPrice(currentPrice)}
              {((currentBranchAvailability?.salePrice || product.salePrice) && !selectedVariant) && (
                <span className="text-base text-muted-foreground line-through font-sans">
                  {formatPrice(currentBranchAvailability?.price || product.price)}
                </span>
              )}
            </div>

            <div className="prose prose-sm md:prose-base prose-p:text-muted-foreground max-w-none mb-10 text-foreground/80 font-sans leading-relaxed">
              <p>{product.description}</p>
            </div>

            {/* Branch Selection */}
            <div className="mb-8 p-4 bg-muted/30 border border-border">
              <h3 className="font-sans text-sm font-semibold uppercase tracking-wider mb-4 flex items-center gap-2">
                <ShoppingBag className="w-4 h-4" />
                Selecciona una Sucursal
              </h3>
              <Select value={selectedBranch?.toString() || ""} onValueChange={handleBranchSelect}>
                <SelectTrigger className="w-full rounded-none h-12 bg-background border-border">
                  <SelectValue placeholder="Elige dónde comprar..." />
                </SelectTrigger>
                <SelectContent className="rounded-none">
                  {product.availability.filter(a => a.available).map((branch) => (
                    <SelectItem key={branch.branchId} value={branch.branchId.toString()} className="cursor-pointer">
                      {branch.branchName}
                    </SelectItem>
                  ))}
                  {product.availability.filter(a => !a.available).length === product.availability.length && (
                    <div className="px-2 py-3 text-sm text-muted-foreground italic">
                      Agotado en todas las sucursales
                    </div>
                  )}
                </SelectContent>
              </Select>
            </div>

            {/* Variants */}
            {product.variants && product.variants.length > 0 && (
              <div className="mb-8 border-t border-border pt-8">
                <h3 className="font-sans text-sm font-semibold uppercase tracking-wider mb-4">Opciones</h3>
                <div className="flex flex-wrap gap-3">
                  {product.variants.map(variant => (
                    <button
                      key={variant.id}
                      onClick={() => setSelectedVariant(variant.id)}
                      className={cn(
                        "px-4 py-2 text-sm border rounded-none transition-all",
                        selectedVariant === variant.id 
                          ? "border-primary bg-primary text-primary-foreground" 
                          : "border-border hover:border-foreground"
                      )}
                    >
                      {variant.name}: {variant.value}
                    </button>
                  ))}
                  <button
                    onClick={() => setSelectedVariant(null)}
                    className={cn(
                      "px-4 py-2 text-sm border rounded-none transition-all",
                      selectedVariant === null 
                        ? "border-primary bg-primary text-primary-foreground" 
                        : "border-border hover:border-foreground"
                    )}
                  >
                    Estándar
                  </button>
                </div>
              </div>
            )}

            {/* Add to Cart Actions */}
            <div className="flex items-center gap-4 mb-10 pt-8 border-t border-border">
              <div className="flex items-center border border-border h-12">
                <button 
                  onClick={() => setQuantity(Math.max(1, quantity - 1))}
                  className="w-12 h-full flex items-center justify-center text-foreground hover:bg-muted transition-colors"
                >
                  <Minus className="w-4 h-4" />
                </button>
                <span className="w-12 text-center font-medium">{quantity}</span>
                <button 
                  onClick={() => setQuantity(quantity + 1)}
                  className="w-12 h-full flex items-center justify-center text-foreground hover:bg-muted transition-colors"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
              
              <Button 
                onClick={handleAddToCart}
                disabled={!selectedBranch || addCartItem.isPending || createSession.isPending}
                size="lg" 
                className="flex-1 rounded-none h-12 bg-primary text-primary-foreground hover:bg-primary/90 text-base"
              >
                {(addCartItem.isPending || createSession.isPending) ? "Agregando..." : "Agregar al carrito"}
              </Button>
            </div>

            {/* Metadata Accordions */}
            <div className="space-y-6 pt-8 border-t border-border text-sm">
              {product.ingredients && (
                <div>
                  <h4 className="font-bold mb-2 flex items-center gap-2">
                    <Info className="w-4 h-4 text-muted-foreground" />
                    Ingredientes
                  </h4>
                  <p className="text-muted-foreground leading-relaxed">{product.ingredients}</p>
                </div>
              )}
              
              {product.allergens && (
                <div>
                  <h4 className="font-bold mb-2 flex items-center gap-2 text-destructive/80">
                    <AlertCircle className="w-4 h-4" />
                    Alérgenos
                  </h4>
                  <p className="text-muted-foreground leading-relaxed">{product.allergens}</p>
                </div>
              )}
              
              {(product.weight || product.portions) && (
                <div className="grid grid-cols-2 gap-4">
                  {product.weight && (
                    <div>
                      <h4 className="font-bold mb-1">Peso</h4>
                      <p className="text-muted-foreground">{product.weight}</p>
                    </div>
                  )}
                  {product.portions && (
                    <div>
                      <h4 className="font-bold mb-1">Porciones</h4>
                      <p className="text-muted-foreground">{product.portions}</p>
                    </div>
                  )}
                </div>
              )}
              
              {product.minimumLeadTimeHours > 0 && (
                <div className="bg-secondary/50 p-4 border border-border">
                  <h4 className="font-bold mb-1">Tiempo de preparación</h4>
                  <p className="text-muted-foreground">
                    Este producto requiere un mínimo de {product.minimumLeadTimeHours} horas de anticipación para su preparación.
                  </p>
                </div>
              )}
            </div>

          </div>
        </div>

        {/* Dialog for Cart Branch Override */}
        <Dialog open={branchChangeConfirmOpen} onOpenChange={setBranchChangeConfirmOpen}>
          <DialogContent className="rounded-none border-border">
            <DialogHeader>
              <DialogTitle className="font-serif text-2xl">¿Cambiar sucursal?</DialogTitle>
              <DialogDescription className="text-base mt-2">
                Ya tienes productos en tu carrito de otra sucursal. Cambiar la sucursal vaciará tu carrito actual. ¿Estás seguro de que deseas continuar?
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="mt-6 flex gap-3">
              <Button variant="outline" className="rounded-none" onClick={() => setBranchChangeConfirmOpen(false)}>
                Cancelar
              </Button>
              <Button variant="destructive" className="rounded-none" onClick={confirmBranchChange}>
                Vaciar carrito y cambiar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </StoreLayout>
  );
}
