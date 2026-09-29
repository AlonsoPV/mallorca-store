# Optimización de Mallorca: verificación y límites

## Cambios aplicados

- Catálogo: la elegibilidad de sucursal se filtra en SQL; el detalle carga su ficha por ID exacto y la disponibilidad se agrupa una sola vez. El precio, la promoción y el stock siguen calculándose en el servidor.
- Presupuestos y pedidos: las líneas de catálogo consultan productos, variantes, promociones y reservas por lote. Para N líneas válidas, las consultas principales de precios pasan de aproximadamente `3N + V` a `3 + V` (V es el número de líneas con variante antes y vale 0 o 1 consulta después). No incluye cupón, sucursal, carrito, entrega ni confirmación final. La creación de pedidos mantiene la limpieza de reservas vencidas y sus controles transaccionales.
- Cliente: los eventos del catálogo actualizan consultas relacionadas; los cambios de inventario también refrescan listas donde podría entrar un producto antes agotado. Las listas visibles tienen una comprobación cada 60 segundos por cambios de precio basados en el tiempo; el detalle conserva su comprobación cada 30 segundos. Las pestañas ocultas cierran los eventos y recuperan datos al volver. Los permisos administrativos conservan su comprobación cada 30 segundos.
- Identidad y correo: las peticiones autenticadas de usuarios existentes leen el rol vigente en PostgreSQL sin escribir de nuevo el usuario si sus datos no cambiaron. Los cambios de perfil se sincronizan cuando se detectan; si faltan campos en la sesión, la consulta a Clerk se limita temporalmente por usuario. El sondeo de correos baja de cada 30 segundos a cada 120 segundos; un pedido nuevo sigue activando su envío inmediatamente.
- Imágenes: solo las rutas referenciadas por el catálogo activo son públicas. El acceso a fotos de fichas inactivas está limitado al personal; los demás objetos necesitan su ACL. La comprobación de referencias es específica para la ruta solicitada, sin cargar todo el catálogo. Se admite revalidación HTTP con ETag, sin conservar públicamente imágenes ya retiradas. La subida compartida reduce JPEG muy grandes cuando el navegador puede hacerlo sin aumentar el archivo; otros formatos no se alteran.

## Referencia puntual de desarrollo

Se midió una respuesta de cada ruta mediante el proxy de desarrollo antes y después. Son **muestras aisladas**, no mediciones de uso de producción ni de facturación:

| Ruta | Antes (código / bytes / tiempo) | Después (código / bytes / tiempo) |
| --- | --- | --- |
| `/api/products` | 200 / 5614 / 0.215 s | 200 / 5614 / 0.194 s |
| `/api/branches` | 200 / 3804 / 0.005 s | 200 / 3804 / 0.040 s |
| `/api/products/croissant-mantequilla` | 200 / 1508 / 0.013 s | 200 / 1508 / 0.077 s |

Los tamaños coincidentes ayudan a comprobar que no se recortó la respuesta. Las diferencias de tiempo no permiten concluir que haya una mejora de latencia: el arranque, la caché y la red influyen. El ahorro neto de consultas y cómputo de toda la aplicación **no está cuantificado**: el nuevo control de imágenes añade una consulta de PostgreSQL por acceso y la comprobación de listas visibles añade normalmente una o dos peticiones por minuto; la revalidación de imágenes evita descargar el cuerpo cuando no cambió. No se añadieron índices sin revisar planes de consulta, ni se publicaron cambios de producción.

## Comprobaciones y alcance

- Compilación de API y comprobación de tipos de API y web correctas. La suite unitaria existente de API pasó: 102/102; también pasaron las pruebas focalizadas de precio por lote, catálogo, identidad, eventos, permisos y acceso a imágenes.
- La prueba integrada amplia de promociones **no llegó a ejecutar aserciones**: su empaquetado temporal pierde un recurso ICC de PDFKit (`Invalid URL: ./data/sRGB_IEC61966_2_1.icc`). No se presenta como prueba aprobada.
- En el navegador de desarrollo se verificó tienda → sucursal → detalle → carrito → vista previa de compra: Panettone Tradicional mantuvo el precio rebajado de $120.00, sucursal Lomas y cantidad 1. No se confirmó un pedido ni se inició un pago. Las fotos y el sitio cargaron sin errores observados.
- No se modificó la integración de Mercado Pago o PayPal ni el bloqueo transaccional de creación de sesión. No se ha demostrado que existan cobros duplicados, pero tampoco se simularon reintentos de proveedor, webhooks simultáneos o pagos reales. La seguridad de esos casos requiere pruebas aisladas antes de optimizar su bloqueo.
- El formulario de productos usa una subida independiente, por lo que la reducción de JPEG de la utilidad compartida no alcanza todavía esas imágenes. Las comparaciones de costos reales de Autoscale, SQL y App Storage requieren métricas del despliegue y tráfico representativo.