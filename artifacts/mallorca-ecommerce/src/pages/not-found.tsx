import { Link } from "wouter";
import { StoreLayout } from "@/components/layout/store-layout";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <StoreLayout>
      <div className="container mx-auto flex min-h-[70dvh] flex-col items-center justify-center px-4 py-16 text-center">
        <span className="mallorca-kicker text-primary">Mallorca</span>
        <h1 className="mallorca-display mt-3 max-w-xl text-[clamp(2.25rem,6vw,4rem)] leading-[0.92]">
          Esta página se nos escondió.
        </h1>
        <p className="mt-5 max-w-md text-sm leading-relaxed text-muted-foreground sm:text-base">
          Puede que el enlace haya cambiado o que la receta ya no esté en el horno. Te llevamos de vuelta a la tienda.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Button asChild className="h-11 rounded-none bg-primary px-6 text-primary-foreground hover:bg-primary/90">
            <Link href="/tienda">Ir a la tienda</Link>
          </Button>
          <Button asChild variant="outline" className="h-11 rounded-none px-6">
            <Link href="/">Volver al inicio</Link>
          </Button>
        </div>
      </div>
    </StoreLayout>
  );
}
