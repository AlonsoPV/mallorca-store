# Mallorca Ecommerce

Nueva tienda online administrable de Pastelería Mallorca México, con catálogo y disponibilidad por sucursal.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/mallorca-ecommerce` — storefront y panel administrativo
- `artifacts/api-server/src/routes` — API de sucursales, catálogo y administración
- `lib/api-spec/openapi.yaml` — contrato fuente de verdad
- `lib/db/src/schema/ecommerce.ts` — modelo relacional de catálogo
- `artifacts/mallorca-ecommerce/src/index.css` — tema visual

## Architecture decisions

- La primera entrega cubre el núcleo de catálogo y administración; carrito, pagos y fulfillment se mantienen como fases posteriores.
- Se usa PostgreSQL administrado por Replit en lugar de Supabase para mantener la integración nativa del entorno.
- Un producto es global y su inventario/disponibilidad se relaciona por sucursal mediante `branch_products`; no se duplican productos.
- Las imágenes iniciales son generadas para el proyecto y no copiadas del sitio de referencia.

## Product

Los clientes pueden explorar productos, filtrar el catálogo, revisar variantes y disponibilidad por sucursal, y consultar las sedes Lomas y Reforma. El panel permite revisar métricas, buscar productos y crear o editar el catálogo.

## User preferences

- La marca debe sentirse europea premium, cálida, artesanal y editorial, sin copiar visualmente el sitio actual.
- Evitar patrones SaaS, marketplace/Amazon, gradientes, exceso de sombras, bordes redondeados exagerados e información simultánea.
- Priorizar facilidad de compra, facilidad de administración, operación correcta por sucursal, mobile, performance y después efectos visuales.

## Gotchas

- Tras cambiar `lib/api-spec/openapi.yaml`, ejecutar siempre el codegen antes de usar nuevos tipos o hooks.
- Las rutas del frontend usan el prefijo configurado por el artifact; no agregar proxies locales de Vite.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
