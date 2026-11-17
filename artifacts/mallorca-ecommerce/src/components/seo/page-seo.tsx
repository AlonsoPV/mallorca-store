import { useEffect } from "react";
import {
  DEFAULT_DESCRIPTION,
  DEFAULT_OG_IMAGE_PATH,
  absoluteUrl,
  canonicalPath,
  pageTitle,
  siteOrigin,
} from "@/lib/seo";

type PageSeoProps = {
  title: string;
  description?: string | null;
  path?: string;
  image?: string | null;
  noindex?: boolean;
  /** When false, uses title as-is (already includes brand). Default true. */
  brand?: boolean;
  type?: "website" | "product" | "article";
  jsonLd?: Record<string, unknown> | Record<string, unknown>[] | null;
};

function upsertMeta(attr: "name" | "property", key: string, content: string) {
  const selector = `meta[${attr}="${key}"]`;
  let el = document.head.querySelector(selector) as HTMLMetaElement | null;
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.content = content;
}

function upsertLink(rel: string, href: string) {
  let el = document.head.querySelector(`link[rel="${rel}"]`) as HTMLLinkElement | null;
  if (!el) {
    el = document.createElement("link");
    el.rel = rel;
    document.head.appendChild(el);
  }
  el.href = href;
}

const JSON_LD_ID = "mallorca-page-jsonld";

export function PageSeo({
  title,
  description,
  path,
  image,
  noindex = false,
  brand = true,
  type = "website",
  jsonLd,
}: PageSeoProps) {
  const jsonLdKey = jsonLd ? JSON.stringify(jsonLd) : "";

  useEffect(() => {
    const resolvedTitle = pageTitle(title, { brand });
    const resolvedDescription = (description || DEFAULT_DESCRIPTION).trim().slice(0, 320);
    const pathname = canonicalPath(path ?? window.location.pathname);
    const canonical = `${siteOrigin()}${pathname === "/" ? "/" : pathname}`;
    const imageUrl = absoluteUrl(image || DEFAULT_OG_IMAGE_PATH);
    const robots = noindex ? "noindex, nofollow" : "index, follow";

    document.title = resolvedTitle;
    upsertMeta("name", "description", resolvedDescription);
    upsertMeta("name", "robots", robots);
    upsertMeta("property", "og:title", resolvedTitle);
    upsertMeta("property", "og:description", resolvedDescription);
    upsertMeta("property", "og:type", type === "product" ? "product" : "website");
    upsertMeta("property", "og:url", canonical);
    upsertMeta("property", "og:image", imageUrl);
    upsertMeta("property", "og:locale", "es_MX");
    upsertMeta("property", "og:site_name", "Pastelería Mallorca México");
    upsertMeta("name", "twitter:card", "summary_large_image");
    upsertMeta("name", "twitter:title", resolvedTitle);
    upsertMeta("name", "twitter:description", resolvedDescription);
    upsertMeta("name", "twitter:image", imageUrl);
    upsertLink("canonical", canonical);

    const existing = document.getElementById(JSON_LD_ID);
    if (jsonLdKey) {
      const script =
        existing instanceof HTMLScriptElement
          ? existing
          : document.createElement("script");
      script.id = JSON_LD_ID;
      script.type = "application/ld+json";
      script.text = jsonLdKey;
      if (!existing) document.head.appendChild(script);
    } else if (existing) {
      existing.remove();
    }
  }, [title, description, path, image, noindex, brand, type, jsonLdKey]);

  return null;
}
