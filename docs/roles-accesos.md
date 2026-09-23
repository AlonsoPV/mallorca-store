# Roles y accesos

Pantalla: `/admin/roles`, dentro de Más / Configuración. Solo `admin` puede consultar la matriz completa y modificarla. No se alteran asignaciones de usuarios ni los límites existentes por sucursal y operación.

La configuración controla módulos (habilitado/deshabilitado), no permisos CRUD independientes. Pedidos y agenda comparten permiso; catálogo, inventario e importaciones comparten permiso. Admin mantiene todos los accesos. La configuración inicial mantiene el acceso previo de los roles internos.

## Persistencia y despliegue

Antes de desplegar el backend con PostgreSQL, ejecutar `lib/db/src/scripts/role-access.sql` en la base correspondiente. La migración crea la configuración y auditoría; no cambia registros existentes. No se ejecuta automáticamente desde peticiones HTTP. Si falta la tabla, la API devuelve error y los roles no administrativos no reciben acceso por defecto.

El servidor mock local persiste configuración y auditoría en `.local/role-access.json` (ignorado por Git). Se puede cambiar la ubicación con `LOCAL_ROLE_POLICY_FILE`. El mock conserva su autenticación local preexistente y no debe usarse en producción.

## API

- `GET /api/admin/access/me`: módulos del usuario autenticado.
- `GET /api/admin/access/roles`: matriz, versión y fecha; solo Admin.
- `PUT /api/admin/access/roles`: `{ policy, version }`; valida matriz completa, bloquea cambios de Admin y rechaza versiones obsoletas con 409. Cada cambio registra autor y valores anteriores/nuevos.

La API verifica la configuración en cada petición administrativa. La interfaz la refresca cada 30 segundos y al recuperar el foco. Menú y rutas usan la misma configuración; deshabilitar un módulo no se limita a ocultarlo.

Los listados de sucursales son consultas compartidas para selectores. Pedidos puede consultar productos y métodos de pago para capturar órdenes, aunque no tenga acceso a su configuración. Alertas de inventario son accesibles desde Alertas o Productos. Las mutaciones mantienen sus verificaciones específicas. Los endpoints administrativos desconocidos se deniegan por defecto.

## Verificación

`node --test artifacts/api-server/role-access.test.mjs`

Cubre validación, protección de Admin, rol desconocido, rutas, persistencia, auditoría, denegación a Staff y conflictos de versión usando un archivo temporal aislado.
