# PayPal y Mercado Pago — configuración

La tienda ya crea el pedido en el servidor, reserva inventario y **solo marca pagado** cuando un webhook verificado coincide con el importe en MXN. No uses la URL de retorno (`?pago=ok`) como prueba de cobro.

Los métodos **no aparecen en checkout** hasta que haya credenciales (admin o Secrets) **y** el método esté activo en Admin → Formas de pago. El default es Sandbox. Live no se enciende solo: si `PAYMENT_ENVIRONMENT` no es `live`, el servidor fuerza Sandbox, bloquea hosts de PayPal Live y rechaza tokens `APP_USR-` de Mercado Pago.

## Qué pedir al cliente

No pidas usuario y contraseña de la cuenta. Pide llaves de API (o una videollamada para pegarlas juntos).

### Mercado Pago

1. Access Token de prueba (`TEST-…`) y de producción (`APP_USR-…`).
2. Public Key de prueba y de producción.
3. Webhook secret (firma de notificaciones).
4. Confirmación de que la cuenta puede cobrar en **MXN**.

Dónde: [developers.mercadopago.com](https://www.mercadopago.com.mx/developers) → Tu integración → Credenciales.

### PayPal

1. Client ID y Secret de **Sandbox**.
2. Client ID y Secret de **Live**.
3. Webhook ID (se crea al registrar la URL, ver abajo).
4. Cuenta Business verificada.

Dónde: [developer.paypal.com](https://developer.paypal.com) → Apps & Credentials → Create App (Merchant).

## Secrets en Replit

En Replit → Tools → Secrets (nunca en el código ni en git):

| Secret | Uso |
| --- | --- |
| `PAYPAL_CLIENT_ID` | Client ID |
| `PAYPAL_CLIENT_SECRET` | Secret |
| `PAYPAL_WEBHOOK_ID` | ID del webhook |
| `PAYPAL_ENVIRONMENT` | `sandbox` o `live` |
| `MERCADOPAGO_ACCESS_TOKEN` | Access token |
| `MERCADOPAGO_PUBLIC_KEY` | Public key |
| `MERCADOPAGO_WEBHOOK_SECRET` | Firma HMAC |
| `PAYMENT_ENVIRONMENT` | `sandbox` (default) o `live` |
| `APP_BASE_URL` | Origen HTTPS público de la app |
| `PUBLIC_APP_URL` | URL de la API (webhooks); puede ser la misma que `APP_BASE_URL` |
| `STOREFRONT_PUBLIC_URL` | URL de la tienda (retorno del comprador) |

También se pueden pegar en **Admin → Formas de pago**. Si el admin está vacío, el servidor usa los Secrets. Si el admin ya tiene llaves, esas ganan. `PAYMENT_ENVIRONMENT` distinto de `live` mantiene sandbox cuando las llaves vienen de env.

Plantilla vacía: `artifacts/api-server/.env.example`.

## URLs a registrar

Sustituye `<host>` por el dominio HTTPS de Replit / producción.

**PayPal** (Apps & Credentials → la app → Webhooks):

- URL: `https://<host>/api/webhooks/payments/paypal`
- Eventos: `CHECKOUT.ORDER.APPROVED`, `CHECKOUT.ORDER.COMPLETED`, `PAYMENT.CAPTURE.COMPLETED`, `PAYMENT.CAPTURE.DENIED`, `PAYMENT.CAPTURE.PENDING`, `PAYMENT.CAPTURE.REFUNDED`
- Copia el Webhook ID al secret `PAYPAL_WEBHOOK_ID`

**Mercado Pago** (Tus integraciones → Webhooks):

- URL: `https://<host>/api/webhooks/payments/mercado-pago`
- Tema: `payment`
- Copia el secreto de firma a `MERCADOPAGO_WEBHOOK_SECRET`

Retorno del comprador (lo arma el backend, no hay que pegarlo en el panel salvo que lo pidan):

- Éxito: `https://<tienda>/pedido/<id>/<token>?pago=ok`
- Pendiente: `…?pago=pendiente`
- Cancelado: `…?pago=cancelado`

Esa pantalla **no trata `?pago=ok` como cobro**. Al volver, el backend consulta PayPal, captura si la orden está `APPROVED` y recién entonces marca el pedido pagado. El webhook sigue siendo la conciliación asíncrona (si el comprador cierra el navegador).

## Base de datos (idempotencia de pagos)

La confirmación al volver de PayPal y los webhooks registran cada evento en la tabla `payment_events`. Si esa tabla no existe en Postgres, el insert falla y el resto de la transacción termina en **25P02** (transacción abortada); el cobro en PayPal puede haber ocurrido igual — no reintentes el pago hasta corregir la base.

**Producción (Replit):** ejecuta el SQL de `lib/db/migrations/010_payment_events.sql` en la consola SQL de la base administrada (o con `psql` y `DATABASE_URL`). Publicar la app no sustituye este paso si el esquema no se ha aplicado antes.

**Desarrollo:** `pnpm --filter @workspace/db run push` (el filtro `db` también resuelve a `@workspace/db`) o el mismo archivo SQL.

## Pruebas Sandbox

1. Deja `PAYMENT_ENVIRONMENT=sandbox` y el switch Sandbox activo en admin.
2. Activa Mercado Pago y/o PayPal en Formas de pago.
3. Comprueba que **no** aparecen en checkout si las dejas desactivadas.
4. Con Sandbox, haz un pedido de recogida o entrega con un importe realista en MXN.
5. Paga con el comprador de prueba (PayPal sandbox personal / tarjetas de prueba de MP).
6. Confirma: pedido `paid`, inventario descontado, webhook en el historial del pedido, IDs de checkout/transacción en el detalle admin.
7. Cancela un pago y verifica que el pedido queda fallido y el carrito se puede reintentar desde el recibo.
8. Reenvía el mismo webhook: debe ignorarse (`duplicate_event`), sin doble cobro ni doble descuento.

## Cómo validar un pago completo

1. Total del pedido = importe capturado en MXN.
2. `payment_status = paid` **después** del webhook, no al volver del proveedor.
3. `provider_payment_id` visible en admin.
4. Reserva de inventario confirmada (`inventory_committed_at`).
5. Un segundo clic en “Pagar” reutiliza la misma sesión si sigue en proceso, o 409 si ya está pagado.

## Activar producción

1. Terminar Sandbox con cobros de prueba.
2. Pegar llaves **Live** / `APP_USR` (Secrets o admin).
3. Registrar las mismas URLs de webhook en el panel **Live**.
4. Poner `PAYMENT_ENVIRONMENT=live` **y** desactivar Sandbox en admin.
5. Activar el método en Formas de pago.
6. Un cobro real mínimo (1 MXN o el mínimo del proveedor) y comprobar webhook + inventario.
7. Recién entonces comunicar al cliente que el checkout está vivo.

Si algo falla, vuelve a sandbox: no dejes Live a medias con métodos activos.
