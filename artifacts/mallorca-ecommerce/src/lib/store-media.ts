import heroSlidePasteleria4 from "@assets/Pasteleria-Mallorca-4.webp";
import heroSlideChile12 from "@assets/chile-en-nogada-mallorca-12.webp";
import heroSlidePasteleria from "@assets/pasteleria-mallorca.webp";
import heroSlidePasteleria3 from "@assets/Pasteleria-Mallorca-3.webp";
import heroSlideChile5 from "@assets/chile-en-nogada-mallorca-5 (1).webp";
import historyPhoto from "@assets/mallorcaFOTO.jpg.webp";
import seasonalFallback from "@assets/chile-en-nogada-mallorca-2.webp";
import storeBanner from "@assets/Pasteleria-Mallorca-3.webp";
import branchLomas from "@assets/Lomas_sucursal.webp";
import branchReforma from "@assets/Reforma_sucursal.webp";
import branchReformaAlt from "@assets/CDMX_MallorcaReforma-_MG_8424-scaled.jpg.webp";
import branchInterior1 from "@assets/Pasteleria-Mallorca-1.webp";
import branchInterior2 from "@assets/Pasteleria-Mallorca-2.webp";
import mosaicSopes from "@assets/sopes-2 (1).webp";
import mosaicChilaquiles from "@assets/chilaquiles-12 (1).webp";
import mosaicChile from "@assets/chile-en-nogada-mallorca-5 (1).webp";
import mallorcaLogo from "@assets/mallorca_logo.webp";
import productPanettone from "@assets/Panettone_tradicional.webp";
import productPanettoneChoco from "@assets/Panettone_chocolate.webp";
import productPasteleria from "@assets/Pasteleria-Mallorca-4.webp";

export const storeLogo = mallorcaLogo;
export const storeHistoryPhoto = historyPhoto;
export const storeSeasonalFallback = seasonalFallback;
export const storeBannerImage = storeBanner;
/** Hero de fondo para la página de sucursales */
export const storeBranchesHero = branchInterior1;

export const storeHeroSlides = [
  { src: heroSlidePasteleria4, alt: "Pastelería Mallorca" },
  { src: heroSlideChile12, alt: "Chile en nogada Mallorca" },
  { src: heroSlidePasteleria, alt: "Pastelería Mallorca" },
  { src: heroSlidePasteleria3, alt: "Interior Pastelería Mallorca" },
  { src: heroSlideChile5, alt: "Chile en nogada de temporada" },
] as const;

export const storeBranchImages: Record<string, string> = {
  lomas: branchLomas,
  reforma: branchReforma,
};

export const storeBranchGalleries: Record<string, string[]> = {
  lomas: [branchLomas, branchInterior1, productPasteleria],
  reforma: [branchReforma, branchReformaAlt, branchInterior2],
};

export const storeMosaicImages = [
  { src: mosaicSopes, alt: "Sopes Mallorca", title: "Sopes", kicker: "Salado" },
  { src: mosaicChilaquiles, alt: "Chilaquiles Mallorca", title: "Chilaquiles", kicker: "De la casa" },
  { src: mosaicChile, alt: "Chile en nogada Mallorca", title: "Chile en nogada", kicker: "Temporada" },
] as const;

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
