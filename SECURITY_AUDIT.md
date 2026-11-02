# SECURITY_AUDIT.md

Auditoría según `seguridad.md`. Alcance: código del monorepo. **No se inspeccionó ni modificó la base de producción.**

Fecha: 2026-11-02  
Stack verificado: Express 5 + Clerk + Drizzle/PostgreSQL (Neon en local; Replit managed en docs). **No hay Supabase.** El front no usa `DATABASE_URL`.

## Resumen ejecutivo

La autorización vive en la API (Clerk, roles, módulos, sucursales). El checkout **recalcula precios** en servidor. Webhooks de PayPal y Mercado Pago verifican firma.

Hallazgos graves en código: secretos reales en `.env.example` trackeado, CORS que reflejaba cualquier Origin con credenciales, cifrado de pagos que era Base64, y fugas de inventario/PII entre sucursales para staff. Esas correcciones ya están en este cambio.

**Acción humana obligatoria:** rotar la contraseña de Neon (y cualquier SMTP/pago que haya estado en git) porque el historial sigue conteniendo el archivo anterior.

## Inventario auditado

| Recurso | Resultado |
|---------|-----------|
| Auth | Clerk (`@clerk/express`) + Bearer `local-dev` solo si `NODE_ENV=development` y `LOCAL_DEV_AUTH` |
| Admin API | `requireRole(staff…admin)` + `enforceRoleAccess` + `getAccessibleBranchIds` |
| Storefront | Catálogo público; carrito por UUID; pedidos con usuario o token de invitado |
| Pagos | PayPal y Mercado Pago; Stripe solo en columnas de esquema |
| Storage | GCS/Replit sidecar; upload con rol staff; imágenes de catálogo con magic-bytes |
| DB | 45 tablas Drizzle en `lib/db`. Sin RLS, GRANT, SECURITY DEFINER ni vistas en el repo |
| Mock | `local-mock-server.mjs` — solo desarrollo |

## Matriz RLS / autorización

RLS **no aplica** al modelo actual: un único rol de aplicación habla con Postgres; los clientes usan HTTP.

| Capa | Control | Estado |
|------|---------|--------|
| Postgres RLS | Políticas `USING` / `WITH CHECK` | No definidas en migraciones. Live DB: **NO VERIFICADO** |
| API admin | Rol + módulo + sucursal | Implementado; ficha de producto, clientes, cupones y menús ahora respetan sucursal |
| API tienda | Precios de catálogo; token de invitado | Precios no se fían del cliente; token ahora con `timingSafeEqual` |
| Anónimos | Catálogo, carrito, menús PDF públicos | Por diseño. Carrito UUID = capability (residual) |

## Hallazgos y correcciones

| ID | Severidad | Hallazgo | Evidencia | Corrección | Validación |
|----|-----------|----------|-----------|------------|------------|
| S1 | Crítica | Credenciales reales en `.env.example` trackeado | `artifacts/api-server/.env.example` (git) | Placeholders; rotar secretos fuera del repo | Archivo ya no contiene hosts/passwords reales |
| S2 | Alta | CORS `origin: true` + `credentials` | `src/app.ts` | Allowlist `CORS_ORIGINS` + URLs públicas; localhost solo en development | `cors-origins.test.ts` |
| S3 | Alta | `encryptSecret` era Base64 (`v1:`) | `src/lib/payments/secrets.ts` | AES-256-GCM `v2:` con `PAYMENT_SECRETS_KEY`; decrypt `v1:` compatible | `payments/secrets.test.ts` |
| S4 | Alta | Staff veía inventario/PII de otras sucursales | `GET /admin/products/:id`, `GET /admin/customers/search` | Filtro `getAccessibleBranchIds`; 404 sin overlap | `branch-scope.test.ts` |
| S5 | Media | Sin headers de seguridad globales | `app.ts` | `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`; HSTS en prod HTTPS | Código en `security-headers.ts` |
| S6 | Media | Rate limit solo en resolve-username | `commerce.ts` | Límite en login local, password-reset y webhooks | `rate-limit.test.ts` |
| S7 | Media | Listado de cupones/menús sin el scope de las mutaciones | `admin.ts` | Cupones: acceso global; menús: sucursales asignadas | `branch-scope.test.ts` |
| S8 | Media | Token de invitado con `!==` | `commerce.ts` | `secretsMatch` / `timingSafeEqual` | `secure-compare.test.ts` |
| S9 | Media | LIKE `%${q}%` sin sanitizar | admin/catálogo | Se eliminan `%` `_` `\` | `like-pattern.test.ts` |
| S10 | Media | Mock en `0.0.0.0` y `Bearer local-dev` | `local-mock-server.mjs` | Bind `127.0.0.1`; aborta en production | Arranque mock |
| S11 | Media | `LOCAL_DEV_AUTH` en production | `index.ts` | Fail-fast | `local-dev-guard.test.ts` |

## Pruebas

| Suite | Resultado |
|-------|-----------|
| `pnpm --filter @workspace/api-server test:unit` | **Aprobada** — 153/153 |
| Integración (`test:integration`, Clerk/Neon) | **No ejecutada** (requiere entorno) |
| `npm audit` / supply chain | **No ejecutada** |
| RLS live / `\dp` producción | **No ejecutada** (fuera de alcance) |
| TLS/HSTS en el edge de hosting | **NO VERIFICADO** |

## Riesgos residuales

- Historial git de `.env.example` puede seguir teniendo credenciales hasta rotarlas.
- Carrito anónimo identificable por UUID (checkout de invitado).
- `INITIAL_ADMIN_EMAIL` sigue promocionando al primer match (configuración).
- Zod `error.message` en respuestas 400.
- TLS, backups y ACLs de GCS: **NO VERIFICADO** en el proveedor.
- Secretos `v1:` en DB siguen siendo Base64 hasta re-guardarlas con `PAYMENT_SECRETS_KEY`.

## Checklist previo al despliegue

1. Rotar password de Neon y cualquier secreto que haya estado en git.
2. Definir `CORS_ORIGINS` (y/o `PUBLIC_APP_URL` / `STOREFRONT_PUBLIC_URL`) con los orígenes reales.
3. Definir `PAYMENT_SECRETS_KEY` (32 bytes hex/base64 o passphrase) **antes** de guardar credenciales de pago o SMTP.
4. `LOCAL_DEV_AUTH` ausente o `false` si `NODE_ENV=production`.
5. No exponer `local-mock-server.mjs` en un host público.
6. Confirmar Clerk (sesión, MFA) en el dashboard — **NO VERIFICADO** aquí.

## Rollback

Revertir el commit/PR de estas correcciones y redesplegar. Los secretos `v2:` dejan de descifrarse sin `PAYMENT_SECRETS_KEY`; los `v1:` siguen leyéndose. No hay migración SQL que deshacer.

Tras un revert, CORS vuelve a reflejar cualquier Origin: no dejar ese estado en producción.
