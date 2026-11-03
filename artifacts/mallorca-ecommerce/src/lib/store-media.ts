import historyPhoto from "@assets/mallorcaFOTO.jpg.webp";
import branchLomas from "@assets/Lomas_sucursal.webp";
import branchReforma from "@assets/Reforma_sucursal.webp";
import branchReformaAlt from "@assets/CDMX_MallorcaReforma-_MG_8424-scaled.jpg.webp";
import mallorcaLogo from "@assets/mallorca_logo.webp";
import productPanettone from "@assets/Panettone_tradicional.webp";
import productPanettoneChoco from "@assets/Panettone_chocolate.webp";
import panettoneChocoScaled from "@assets/Pantettone/Panettone-Choco-scaled.webp";
import storeBanner from "@/assets/photos/pasteleria-mallorca-3.webp";
import branchInterior1 from "@/assets/photos/pasteleria-mallorca-1.webp";
import branchInterior2 from "@/assets/photos/pasteleria-mallorca-2.webp";
import productPasteleria from "@/assets/photos/pasteleria-mallorca-4.webp";
import navidad01 from "@/assets/stock/navidad-01.webp";
import navidad02 from "@/assets/stock/navidad-02.webp";
import navidad03 from "@/assets/stock/navidad-03.webp";
import navidad04 from "@/assets/stock/navidad-04.webp";
import navidad05 from "@/assets/stock/navidad-05.webp";
import navidad06 from "@/assets/stock/navidad-06.webp";
import navidad07 from "@/assets/stock/navidad-07.webp";
import navidad08 from "@/assets/stock/navidad-08.webp";
import navidad09 from "@/assets/stock/navidad-09.webp";
import navidad10 from "@/assets/stock/navidad-10.webp";
import navidad11 from "@/assets/stock/navidad-11.webp";
import navidad12 from "@/assets/stock/navidad-12.webp";
import navidad13 from "@/assets/stock/navidad-13.webp";
import navidad14 from "@/assets/stock/navidad-14.webp";
import navidad15 from "@/assets/stock/navidad-15.webp";
import navidad16 from "@/assets/stock/navidad-16.webp";
import navidad17 from "@/assets/stock/navidad-17.webp";
import navidad18 from "@/assets/stock/navidad-18.webp";
import navidad19 from "@/assets/stock/navidad-19.webp";
import navidad20 from "@/assets/stock/navidad-20.webp";
import navidad21 from "@/assets/stock/navidad-21.webp";
import navidad22 from "@/assets/stock/navidad-22.webp";
import navidad23 from "@/assets/stock/navidad-23.webp";
import navidad24 from "@/assets/stock/navidad-24.webp";
import navidad25 from "@/assets/stock/navidad-25.webp";
import navidad26 from "@/assets/stock/navidad-26.webp";
import navidad27 from "@/assets/stock/navidad-27.webp";
import navidad28 from "@/assets/stock/navidad-28.webp";
import navidad29 from "@/assets/stock/navidad-29.webp";
import navidad30 from "@/assets/stock/navidad-30.webp";

export const storeLogo = mallorcaLogo;
export const storeHistoryPhoto = historyPhoto;
/** Fallback de temporada / Navidad Mallorca. */
export const storeSeasonalFallback = navidad28;
export const storeBannerImage = storeBanner;
/** Hero de fondo para la página de sucursales */
export const storeBranchesHero = branchInterior1;

const NAVIDAD: Record<number, string> = {
  1: navidad01,
  2: navidad02,
  3: navidad03,
  4: navidad04,
  5: navidad05,
  6: navidad06,
  7: navidad07,
  8: navidad08,
  9: navidad09,
  10: navidad10,
  11: navidad11,
  12: navidad12,
  13: navidad13,
  14: navidad14,
  15: navidad15,
  16: navidad16,
  17: navidad17,
  18: navidad18,
  19: navidad19,
  20: navidad20,
  21: navidad21,
  22: navidad22,
  23: navidad23,
  24: navidad24,
  25: navidad25,
  26: navidad26,
  27: navidad27,
  28: navidad28,
  29: navidad29,
  30: navidad30,
};

function stockPhoto(index: number) {
  return NAVIDAD[index] ?? storeSeasonalFallback;
}

/**
 * Banner inicial: solo paisajes ≥1200px de ancho (evita pixelado en viewport completo).
 * Dimensiones reales de los assets NAVIDAD.
 */
const HERO_STOCK = [
  { index: 9, width: 1200, height: 873 },
  { index: 15, width: 1200, height: 907 },
  { index: 26, width: 1200, height: 702 },
] as const;

export const storeHeroSlides = HERO_STOCK.map((slide) => ({
  src: stockPhoto(slide.index),
  alt: "Navidad en Pastelería Mallorca",
  width: slide.width,
  height: slide.height,
}));

export const storeHeroLcpSrc = storeHeroSlides[0]?.src ?? "";

/** Galería / mosaico de temporada Navidad. */
const GALLERY_STOCK = [1, 2, 4, 11, 16, 17, 18, 21, 22, 28, 29, 30] as const;

const MOSAIC_KICKERS = ["Navidad", "Dulce", "De la casa", "Mesa"] as const;

export const storeMosaicImages = GALLERY_STOCK.map((index, position) => ({
  src: stockPhoto(index),
  alt: "Navidad Pastelería Mallorca",
  title: "Navidad",
  kicker: MOSAIC_KICKERS[position % MOSAIC_KICKERS.length],
}));

export const storeBranchImages: Record<string, string> = {
  lomas: branchLomas,
  reforma: branchReforma,
};

export const storeBranchGalleries: Record<string, string[]> = {
  lomas: [branchLomas, branchInterior1, productPasteleria, stockPhoto(3), stockPhoto(5), stockPhoto(7), stockPhoto(12), stockPhoto(14)],
  reforma: [branchReforma, branchReformaAlt, branchInterior2, stockPhoto(8), stockPhoto(13), stockPhoto(19), stockPhoto(23), stockPhoto(27)],
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
