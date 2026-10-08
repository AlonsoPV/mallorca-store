import historyPhoto from "@assets/mallorcaFOTO.jpg.webp";
import branchLomas from "@assets/Lomas_sucursal.webp";
import branchReforma from "@assets/Reforma_sucursal.webp";
import branchReformaAlt from "@assets/CDMX_MallorcaReforma-_MG_8424-scaled.jpg.webp";
import mallorcaLogo from "@assets/mallorca_logo.webp";
import productPanettone from "@assets/Panettone_tradicional.webp";
import productPanettoneChoco from "@assets/Panettone_chocolate.webp";

function publicImage(file: string) {
  return `${import.meta.env.BASE_URL}images/${file}`;
}

const seasonalFallback = publicImage("chile-en-nogada-2.webp");
const storeBanner = publicImage("pasteleria-mallorca-3.webp");
const branchInterior1 = publicImage("pasteleria-mallorca-1.webp");
const branchInterior2 = publicImage("pasteleria-mallorca-2.webp");
const productPasteleria = publicImage("pasteleria-mallorca-4.webp");

export const storeLogo = mallorcaLogo;
export const storeHistoryPhoto = historyPhoto;
export const storeSeasonalFallback = seasonalFallback;
export const storeBannerImage = storeBanner;
/** Hero de fondo para la página de sucursales */
export const storeBranchesHero = branchInterior1;

function stockPhoto(index: number) {
  return `${import.meta.env.BASE_URL}images/stock/temporada-${String(index).padStart(2, "0")}.webp`;
}

/** Fotos horizontales de FotosStock: banner inicial. */
const HERO_STOCK = [5, 34, 45] as const;

export const storeHeroSlides = HERO_STOCK.map((index) => ({
  src: stockPhoto(index),
  alt: "Mesa de temporada Pastelería Mallorca",
}));

/** Retratos de FotosStock, sin las horizontales del banner. */
const GALLERY_STOCK = [
  1, 2, 3, 4, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28,
  29, 30, 31, 32, 33, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44,
] as const;

const MOSAIC_KICKERS = ["Temporada", "Dulce", "De la casa", "Salado"] as const;

export const storeMosaicImages = GALLERY_STOCK.map((index, position) => ({
  src: stockPhoto(index),
  alt: "Pan de temporada Pastelería Mallorca",
  title: "De temporada",
  kicker: MOSAIC_KICKERS[position % MOSAIC_KICKERS.length],
}));

export const storeBranchImages: Record<string, string> = {
  lomas: branchLomas,
  reforma: branchReforma,
};

export const storeBranchGalleries: Record<string, string[]> = {
  lomas: [branchLomas, branchInterior1, productPasteleria, stockPhoto(1), stockPhoto(2), stockPhoto(3), stockPhoto(4), stockPhoto(6)],
  reforma: [branchReforma, branchReformaAlt, branchInterior2, stockPhoto(7), stockPhoto(8), stockPhoto(9), stockPhoto(10), stockPhoto(11)],
};

export const storeProductFallbacks = {
  chocolate: productPanettoneChoco,
  panettone: productPanettone,
  bolleria: productPasteleria,
} as const;

export function branchLocalImage(slug: string) {
  return storeBranchImages[slug] || storeSeasonalFallback;
}

/** Prefer curated local photos for known branches; otherwise use the API image. */
export function branchImageFor(slug: string, configured?: string | null) {
  return storeBranchImages[slug] || configured || storeSeasonalFallback;
}

export function branchGalleryFallback(slug: string, index = 0) {
  const curated = storeBranchGalleries[slug];
  return curated?.[index] || curated?.[0] || branchLocalImage(slug);
}

/** Prefer curated local gallery for known branches; otherwise use the API gallery. */
export function branchGalleryFor(slug: string, configured: string[] = []) {
  return storeBranchGalleries[slug] ?? configured;
}
