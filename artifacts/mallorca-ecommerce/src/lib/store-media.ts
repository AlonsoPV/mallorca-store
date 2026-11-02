import historyPhoto from "@assets/mallorcaFOTO.jpg.webp";
import branchLomas from "@assets/Lomas_sucursal.webp";
import branchReforma from "@assets/Reforma_sucursal.webp";
import branchReformaAlt from "@assets/CDMX_MallorcaReforma-_MG_8424-scaled.jpg.webp";
import mallorcaLogo from "@assets/mallorca_logo.webp";
import productPanettone from "@assets/Panettone_tradicional.webp";
import productPanettoneChoco from "@assets/Panettone_chocolate.webp";
import panettoneChocoScaled from "@assets/Pantettone/Panettone-Choco-scaled.webp";
import seasonalFallback from "@/assets/photos/chile-en-nogada-2.webp";
import storeBanner from "@/assets/photos/pasteleria-mallorca-3.webp";
import branchInterior1 from "@/assets/photos/pasteleria-mallorca-1.webp";
import branchInterior2 from "@/assets/photos/pasteleria-mallorca-2.webp";
import productPasteleria from "@/assets/photos/pasteleria-mallorca-4.webp";
import stock01 from "@/assets/stock/temporada-01.webp";
import stock02 from "@/assets/stock/temporada-02.webp";
import stock03 from "@/assets/stock/temporada-03.webp";
import stock04 from "@/assets/stock/temporada-04.webp";
import stock05 from "@/assets/stock/temporada-05.webp";
import stock06 from "@/assets/stock/temporada-06.webp";
import stock07 from "@/assets/stock/temporada-07.webp";
import stock08 from "@/assets/stock/temporada-08.webp";
import stock09 from "@/assets/stock/temporada-09.webp";
import stock10 from "@/assets/stock/temporada-10.webp";
import stock11 from "@/assets/stock/temporada-11.webp";
import stock12 from "@/assets/stock/temporada-12.webp";
import stock13 from "@/assets/stock/temporada-13.webp";
import stock34 from "@/assets/stock/temporada-34.webp";
import stock45 from "@/assets/stock/temporada-45.webp";

export const storeLogo = mallorcaLogo;
export const storeHistoryPhoto = historyPhoto;
export const storeSeasonalFallback = seasonalFallback;
export const storeBannerImage = storeBanner;
/** Hero de fondo para la página de sucursales */
export const storeBranchesHero = branchInterior1;

const STOCK: Record<number, string> = {
  1: stock01,
  2: stock02,
  3: stock03,
  4: stock04,
  5: stock05,
  6: stock06,
  7: stock07,
  8: stock08,
  9: stock09,
  10: stock10,
  11: stock11,
  12: stock12,
  13: stock13,
  34: stock34,
  45: stock45,
};

function stockPhoto(index: number) {
  return STOCK[index] ?? seasonalFallback;
}

/** Fotos horizontales de FotosStock: banner inicial. */
const HERO_STOCK = [5, 34, 45] as const;

export const storeHeroSlides = HERO_STOCK.map((index) => ({
  src: stockPhoto(index),
  alt: "Mesa de temporada Pastelería Mallorca",
}));

export const storeHeroLcpSrc = storeHeroSlides[0]?.src ?? "";

/** Retratos de FotosStock, sin las horizontales del banner. El carrusel no necesita las 40. */
const GALLERY_STOCK = [1, 2, 3, 4, 6, 7, 8, 9, 10, 11, 12, 13] as const;

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

/** Colaboración Ton Cortés — panettone chocolate (home editorial). */
export const storePanettoneCollabPhoto = panettoneChocoScaled;

const panettoneBase = `${import.meta.env.BASE_URL}images/panettone`;

/** Landing /panettone — video y galería Ton Cortés. */
export const storePanettoneVideo = `${import.meta.env.BASE_URL}videos/panettone.mp4`;

export const storePanettoneGallery = [
  {
    src: `${panettoneBase}/ton-cortes-01.webp`,
    alt: "Ton Cortés frente a Pastelería Mallorca",
  },
  {
    src: `${panettoneBase}/ton-cortes-02.webp`,
    alt: "Ton Cortés oliendo una rebanada de panettone",
  },
  {
    src: `${panettoneBase}/ton-cortes-03.webp`,
    alt: "Ton Cortés con la caja del panettone Mallorca México",
  },
  {
    src: `${panettoneBase}/ton-cortes-04.webp`,
    alt: "Ton Cortés junto a cajas Mallorca México 2024",
  },
  {
    src: `${panettoneBase}/ton-cortes-05.webp`,
    alt: "Miga del panettone de Ton Cortés",
  },
  {
    src: `${panettoneBase}/ton-cortes-06.webp`,
    alt: "Retrato de Ton Cortés con filipina Mallorca México",
  },
  {
    src: `${panettoneBase}/ton-cortes-07.webp`,
    alt: "Ton Cortés, campeón mundial del panettone",
  },
] as const;

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
