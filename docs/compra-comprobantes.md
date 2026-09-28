# Confirmación de compra, PDF y correos

## Flujo

Al confirmar una compra en la tienda, el pedido y dos trabajos de correo se guardan en la misma transacción. El cliente llega a `/pedido/:id/:token`, donde consulta el folio, estado del pedido y pago, saldo, artículos, descuentos, dirección y horario de Ciudad de México. Puede descargar el PDF aun si falla el proveedor de correo.

La interfaz diferencia pago pendiente, en verificación, parcial, pagado, fallido, cancelación y reembolso. Un problema de analítica o almacenamiento del navegador no impide mostrar un pedido ya creado. Los enlaces de invitado siguen funcionando si el cliente inicia sesión después.

## Destinatarios

- Cliente: correo indicado en el pedido.
- Sucursal: responsable principal activo asignado; si no existe, gerente de sucursal activo. No se envía a empleados sin responsabilidad asignada ni a sucursales distintas. Si falta un responsable con correo válido, el trabajo queda pendiente y vuelve a buscarlo cada 10 minutos.

Son comunicaciones transaccionales de compra, independientes de las preferencias de alertas de inventario. Se envían mensajes separados para no exponer el correo del responsable al cliente. Ambos incluyen el comprobante PDF; el responsable recibe el enlace administrativo, que exige autenticación. El cliente recibe su enlace privado de consulta.

## Configuración necesaria antes del despliegue

1. Aplicar `lib/db/src/scripts/order-emails.sql` en PostgreSQL antes de iniciar esta versión de la API. La cola es parte de la transacción de compra; sin esta migración, no se deben activar estos cambios en producción.
2. Crear **tres cuentas** en Hostinger (hPanel → Emails → Email Accounts). Luego, en **Admin → Correos**, pega cada buzón:

- `pedidos@` envía el comprobante al cliente (con contraseña SMTP).
- `sucursal@` avisa al responsable de la sucursal (con contraseña SMTP, distinto al de pedidos).
- `contacto@` es la dirección de respuesta del cliente (no hace falta su contraseña SMTP).

La app guarda las contraseñas cifradas y las usa al enviar. Si aún no hay buzones en la app, el servidor puede usar estas variables (nunca `VITE_`):

```
SMTP_HOST=smtp.hostinger.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_PEDIDOS_USER=pedidos@tu-dominio
SMTP_PEDIDOS_PASS=<contraseña>
SMTP_SUCURSAL_USER=sucursal@tu-dominio
SMTP_SUCURSAL_PASS=<contraseña>
ORDER_EMAIL_FROM=Mallorca <pedidos@tu-dominio>
ORDER_EMAIL_FROM_BRANCH=Mallorca Sucursal <sucursal@tu-dominio>
ORDER_EMAIL_REPLY_TO=Mallorca <contacto@tu-dominio>
PUBLIC_APP_URL=https://tu-tienda
```

Cada buzón de envío autentica con su propio usuario y contraseña. El remitente debe coincidir con ese buzón. Puerto 465 con SSL; si Hostinger pide STARTTLS, usa puerto 587 y SSL desactivado. En producción aplica también `lib/db/migrations/007_mailboxes.sql`.

Sin los dos buzones de envío, el sistema no considera el correo configurado.

3. Asignar responsables activos con correo a las sucursales.
4. Reiniciar el backend. El trabajador procesa la cola al arrancar, después de crear un pedido y cada 30 segundos.

La contraseña del buzón no está incluida en el repositorio. El mock local nunca envía correos reales. Sin SMTP (ni Resend de respaldo), la interfaz informa que el correo no está disponible; no muestra un envío exitoso ficticio.

## Entrega y reintentos

La cola evita duplicados por pedido y destinatario lógico (cliente/sucursal). Cada mensaje conserva el contenido entre reintentos. Hay seis intentos con espera creciente y bloqueo de trabajos concurrentes. Los envíos inciertos mayores a 23 horas se dejan para revisión manual. `sent` significa que Hostinger aceptó el mensaje por SMTP, no que el destinatario lo haya abierto o que se haya confirmado su entrega en bandeja.

Las filas `failed` requieren revisión operativa de `last_error`. No se reenvían automáticamente después de agotarse los intentos. Las notas internas y de producción se excluyen del comprobante. El PDF por correo conserva el estado al registrar la compra; la descarga desde la pantalla refleja el estado vigente del pedido.

## API privada

- `GET /api/orders/:id/receipt.pdf`: propietario autenticado.
- `GET /api/guest/orders/:id/:token/receipt.pdf`: enlace privado válido.
- Las mismas rutas terminadas en `/confirmation` devuelven datos de sucursal y el estado de ambos envíos, sin revelar el correo del responsable.
- Respuestas privadas con `Cache-Control: private, no-store`.

## Pruebas locales

`node --test artifacts/api-server/order-receipt.test.mjs`

El mock nunca envía correos reales. Guarda HTML, PDF y metadatos de ambos destinatarios en `.local/order-email-previews/<pedido>/` (ignorado por Git). La confirmación muestra que se trata de una prueba. Los cambios del backend requieren reinicio; puede usarse un puerto aislado para conservar la sesión principal.

Validaciones: estados de pago, selección del responsable, exclusión de datos internos, escape de HTML, PDF sencillo/multipágina, idempotencia y errores de proveedor. La integración con PostgreSQL y el envío real requieren la configuración anterior.
