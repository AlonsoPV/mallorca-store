# BACKEND VALIDATION REPORT

## Phase 1 — Arquitectura + DB + Auth + Roles

**Fecha:** 2026-09-12  
**Ambiente:** desarrollo  
**Estado:** PARTIAL

### Qué se validó

- Arquitectura del backend y mapa de módulos.
- Conectividad y estructura de PostgreSQL.
- Tablas, enums, claves primarias, claves foráneas e índices únicos.
- Middleware de Clerk y provisión local de usuarios.
- Protección de rutas administrativas sin autenticación.
- Validación de entrada en algunos endpoints públicos y administrativos.
- Existencia de roles y mecanismo de asignación por sucursal.
- Integridad referencial básica y filas huérfanas.
- Typecheck completo del workspace.

### Mapa actual del backend

- **Auth:** Clerk en `artifacts/api-server/src/app.ts` y `middlewares/auth.ts`.
- **Usuarios y roles:** `users`, `user_role`, `branch_user_assignments`.
- **Productos:** `products`, `product_variants`, `categories`.
- **Operación por sucursal:** `branches`, `branch_products`.
- **Carrito:** `carts`, `cart_items`.
- **Pedidos:** `orders`, `order_items`.
- **Inventario:** `inventory_reservations`, `inventory_ledger`, `inventory_alerts`.
- **Notificaciones:** `internal_notifications`.
- **API:** Express 5, Zod, Drizzle ORM y PostgreSQL.
- **Pagos:** el esquema conserva campos de Stripe, pero el proveedor todavía no está configurado en el flujo actual.
- **Jobs:** la liberación de reservas expiradas se ejecuta durante solicitudes de commerce; no se identificó un worker o cron separado.

### Pruebas ejecutadas

| Prueba | Resultado |
|---|---|
| Conectividad de base de datos | PASS — base de desarrollo disponible |
| `GET /api/healthz` sin autenticación | PASS — `200 {"status":"ok"}` |
| Rutas `/api/admin/*` sin autenticación | PASS — respondieron `401 Unauthorized` |
| `GET /api/orders/nonexistent` sin autenticación | PASS — respondió `401 Unauthorized` |
| Fecha inválida en `/api/products` | PASS — respondió `400` con error Zod |
| Parámetro inválido en `/api/fulfillment/slots` | PASS — respondió `400` con error Zod |
| `pnpm run typecheck` | PASS — libs, API, storefront, sandbox y scripts |
| Build/restart del API después de las correcciones | PASS — workflow escuchando en el puerto 8080 |
| Re-test de `/api/healthz` después de las correcciones | PASS — `200 {"status":"ok"}` |
| Re-test de rutas administrativas sin autenticación | PASS — continúan respondiendo `401 Unauthorized` |
| Re-test de catálogo público | PASS — responde los productos destacados por sucursal |
| Tablas y enums esperados | PASS — presentes en PostgreSQL |
| Filas huérfanas revisadas | PASS — no se encontraron en las relaciones revisadas |
| Pruebas unitarias de inventario | PARTIAL — existe `inventory.test.ts`, pero no hay runner TypeScript instalado/configurado para ejecutarlo |

### Resultados de base de datos

- Tablas principales presentes: `users`, `branches`, `products`, `product_variants`, `branch_products`, `carts`, `cart_items`, `orders`, `order_items`, `inventory_reservations`, `inventory_ledger`, `inventory_alerts`, `internal_notifications` y asignaciones.
- Enums presentes: estados de usuario, producto, carrito, pedido, pago, reserva, movimientos y alertas.
- No se encontraron filas huérfanas en carritos, productos por sucursal, pedidos, partidas, reservas ni asignaciones.
- La base de desarrollo contiene 2 sucursales activas, 5 productos, 10 configuraciones producto-sucursal y 2 pedidos de prueba cancelados.
- No hay usuarios ni asignaciones de sucursal en la base de desarrollo; por eso la validación autenticada por rol no puede considerarse completa.

### Errores y riesgos encontrados

#### HIGH — Aislamiento por sucursal incompleto en productos administrativos

`GET /admin/products` usa el catálogo global y devuelve disponibilidad de todas las sucursales. Además, `PATCH /admin/products/:id` actualiza primero los campos globales del producto y sólo después valida las configuraciones por sucursal. Un `branch_manager` autenticado podría tener acceso a información global o modificar campos globales si alcanza esas rutas.

Evidencia:

- El router administrativo admite `staff`, `branch_manager`, `operations_manager`, roles legacy y `admin`.
- `GET /admin/products` no recibe ni aplica una sucursal accesible.
- `PATCH /admin/products/:id` ejecuta el `UPDATE products` antes de llamar a `canAccessBranch`.

Estado: **corregido en código; pendiente de prueba con un usuario `branch_manager` asignado a una sola sucursal**.

#### HIGH — Resumen administrativo sin filtro de alcance

`GET /admin/summary` calcula productos, sucursales y stock globales sin usar `getAccessibleBranchIds`. Esto contradice el aislamiento requerido para un responsable limitado a una sucursal.

Estado: **corregido en código; pendiente de prueba con roles reales**.

#### HIGH — CORS refleja cualquier origen con credenciales

La aplicación usa `cors({ credentials: true, origin: true })`. La configuración no limita explícitamente los orígenes permitidos. Debe revisarse antes de considerar cerrada la validación CSRF/cross-origin, especialmente porque existen rutas mutables.

Estado: **pendiente de corrección sin romper el proxy de Clerk ni el preview local**.

#### MEDIUM — `branch_code` es opcional y está vacío en las sucursales actuales

El campo tiene índice único, pero permite `NULL` y ambas sucursales actuales carecen de código. El importador de inventario depende de `branch_code` para resolver la sucursal, por lo que la configuración actual no es consistente con el contrato de importación.

Estado: **requiere decisión de datos y migración/seed controlada**.

#### MEDIUM — Restricciones de integridad numérica incompletas en DB

La base no muestra `CHECK` constraints para impedir directamente valores negativos en `inventory`, `quantity`, `price` y totales. El código aplica varias validaciones, pero la integridad depende de que todas las escrituras pasen por esas rutas.

Estado: **pendiente de migración versionada después de confirmar compatibilidad con datos existentes**.

#### MEDIUM — `branch_products.responsible_user_id` no tiene foreign key

El campo se usa para resolver responsables de alertas, pero el esquema no declara una referencia a `users`. Puede quedar apuntando a un usuario inexistente si se escribe por otra vía.

Estado: **pendiente de migración versionada**.

### Correcciones realizadas

- `GET /admin/summary` ahora restringe sucursales, productos y stock al alcance devuelto por `getAccessibleBranchIds`.
- `GET /admin/products` ahora limita las configuraciones de disponibilidad a las sucursales accesibles.
- Crear productos requiere un rol con acceso global.
- Editar campos globales de producto requiere un rol con acceso global; los roles locales sólo pueden enviar configuraciones de sucursal dentro de su alcance.
- Se reinició el workflow del API después de los cambios y el build arrancó correctamente.
- No se modificaron datos de la base durante la corrección.

No se corrigieron todavía CORS, `branch_code`, constraints numéricos ni la foreign key de `responsible_user_id`; requieren una decisión/migración y pruebas específicas para no romper el preview, el proxy de Clerk o datos existentes.

### Estado final de la Fase 1

**PARTIAL — mejoras aplicadas, pero no lista para marcar el backend como estable.**

Los controles de no autenticación, validación de entrada, estructura base y referencias principales funcionan. Dos rutas administrativas que no aplicaban aislamiento global fueron corregidas y el API volvió a arrancar sin errores. La autorización por rol y sucursal todavía no puede declararse completa porque no hay usuarios/asignaciones de prueba, y quedan pendientes CORS e integridad de datos.

### Siguiente validación recomendada

1. Corregir y probar el aislamiento administrativo con usuarios controlados:
   - `admin`
   - `operations_manager`
   - `branch_manager` asignado sólo a Reforma
   - `staff` asignado sólo a Reforma
   - `customer`
2. Repetir Fase 1 con requests autenticados directos y comprobar `401/403`.
3. Sólo después avanzar a **Fase 2 — Sucursales + Productos + Inventario**.
