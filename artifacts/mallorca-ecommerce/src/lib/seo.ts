/** Sitewide SEO defaults for Pastelería Mallorca México (es-MX). */

export const SITE_NAME = "Pastelería Mallorca México";
export const SITE_NAME_SHORT = "Pastelería Mallorca";
export const DEFAULT_DESCRIPTION =
  "Pastelería artesanal en Lomas y Reforma. Encarga pasteles, bollería y panettone online con retiro en sucursal o entrega en CDMX.";
export const DEFAULT_OG_IMAGE_PATH = "/images/pasteleria-mallorca-3.webp";
export const DEFAULT_SITE_ORIGIN = "https://pasteleria-mallorca.mx";

export function siteOrigin(): string {
  const fromEnv = String(import.meta.env.VITE_PUBLIC_SITE_URL || "").trim().replace(/\/$/, "");
  if (fromEnv && /^https?:\/\//i.test(fromEnv)) return fromEnv;
  if (typeof window !== "undefined" && window.location?.origin) {
    const host = window.location.hostname.toLowerCase();
    if (host !== "localhost" && host !== "127.0.0.1") {
      return window.location.origin.replace(/\/$/, "");
    }
  }
  return DEFAULT_SITE_ORIGIN;
}

export function absoluteUrl(pathOrUrl: string | null | undefined): string {
  const raw = String(pathOrUrl || "").trim();
  if (!raw) return `${siteOrigin()}${DEFAULT_OG_IMAGE_PATH}`;
  if (/^https?:\/\//i.test(raw)) return raw;
  const path = raw.startsWith("/") ? raw : `/${raw}`;
  return `${siteOrigin()}${path}`;
}

export function canonicalPath(path: string): string {
  const clean = path.split("?")[0]?.split("#")[0] || "/";
  if (clean.length > 1 && clean.endsWith("/")) return clean.slice(0, -1);
  return clean || "/";
}

export function pageTitle(title: string, { brand = true }: { brand?: boolean } = {}): string {
  const trimmed = title.trim();
  if (!brand) return trimmed;
  if (trimmed.toLowerCase().includes("mallorca")) return trimmed;
  return `${trimmed} | ${SITE_NAME_SHORT}`;
}

export const SEO_PAGES = {
  home: {
    title: "Pastelería Mallorca México | Pasteles y bollería en CDMX",
    description: DEFAULT_DESCRIPTION,
    path: "/",
  },
  store: {
    title: "Tienda online | Pastelería Mallorca México",
    description:
      "Compra pasteles y bollería Mallorca. Filtra por categoría, agenda tu retiro o entrega y paga en línea.",
    path: "/tienda",
  },
  branches: {
    title: "Sucursales en CDMX | Pastelería Mallorca",
    description:
      "Visita Pastelería Mallorca en Lomas de Chapultepec y Reforma. Horarios, mapa y pedidos online.",
    path: "/sucursales",
  },
  panettone: {
    title: "Panettone Ton Cortés | Pastelería Mallorca México",
    description:
      "Panettone de colaboración con Ton Cortés. Descubre la temporada y pide online en Pastelería Mallorca México.",
    path: "/panettone",
    image: "/images/panettone/ton-cortes-01.webp",
  },
} as const;
