Quiero optimizar integralmente el módulo de PRODUCTOS del Admin de Pastelería Mallorca.

El objetivo es emular los patrones funcionales que han demostrado ser útiles en WooCommerce para:

- alta individual
- edición
- edición rápida
- edición masiva
- importación
- actualización por SKU
- exportación
- inventario

pero con una experiencia visual y operativa mucho más simple, moderna y adaptada a un ecommerce multi-sucursal.

IMPORTANTE:

NO quiero copiar la interfaz visual de WooCommerce.

Quiero tomar su lógica y familiaridad operativa y eliminar su carga técnica innecesaria.

==================================================
1. AUDITA PRIMERO
==================================================

Antes de cambiar código, revisa la implementación actual de:

- listado productos
- product form
- importación
- inventory
- branches
- promotions
- API
- DB
- tipos
- validaciones

Identifica qué ya existe y puede reutilizarse.

NO dupliques funcionalidades.

==================================================
2. EXPERIENCIA OBJETIVO
==================================================

Productos debe tener:

[ + Añadir producto ] [ Importar ] [ Exportar ]

y vistas:

Todos
Activos
Borradores
Stock bajo
Agotados

Listado:

Producto
SKU
Categoría
Precio
Reforma
Lomas
Promoción
Estado

==================================================
3. ALTA INDIVIDUAL
==================================================

Permitir alta rápida:

Nombre
Categoría
Precio
Sucursal
Stock
Imagen
Publicar

Objetivo:
< 2 minutos.

Mover contenido secundario a:

Promociones
Disponibilidad
Información
Avanzado

mediante progressive disclosure.

==================================================
4. EDICIÓN RÁPIDA
==================================================

Agregar acción desde listado:

Editar
Edición rápida
Duplicar
Archivar

Edición rápida debe soportar:

nombre
SKU
precio
categoría
estado
stock sucursal

sin abrir ficha completa.

==================================================
5. ACCIONES MASIVAS
==================================================

Seleccionar múltiples productos.

Permitir:

Cambiar estado
Cambiar categoría
Asignar sucursal
Quitar sucursal
Modificar precio
Crear promoción
Eliminar promoción
Destacar
Archivar

==================================================
6. IMPORTACIÓN
==================================================

Recrear el buen patrón WooCommerce:

Archivo
→ Mapping
→ Validación
→ Preview
→ Confirmación
→ Resultado

Aceptar:

CSV
XLSX

Mapear automáticamente columnas conocidas.

Permitir descargar plantilla.

==================================================
7. ACTUALIZAR EXISTENTES
==================================================

Checkbox:

"Actualizar productos existentes"

Usar SKU como clave primaria de importación.

Si existe:
UPDATE

Si no:
CREATE

Nunca generar duplicados silenciosamente.

==================================================
8. ACTUALIZACIÓN SELECTIVA
==================================================

Permitir elegir qué campos actualizar:

Nombre
Descripción
Precio
Categoría
Imágenes
Inventario
Sucursales
Promociones

Esto debe evitar sobreescrituras accidentales.

==================================================
9. IMPORTACIÓN INVENTARIO
==================================================

Crear flujo simplificado.

Formato:

sku
branch_code
stock

Ejemplo:

PAN001,REF,12
PAN001,LOM,7

Agregar optional:

min_stock

Debe reutilizar endpoint existente de inventory import si ya existe.

==================================================
10. EXPORTACIÓN
==================================================

Crear módulo robusto.

Permitir exportar:

Todos
Filtrados
Seleccionados

Formatos:

CSV
XLSX

Permitir escoger columnas.

==================================================
11. EXPORTACIÓN REIMPORTABLE
==================================================

Agregar opción:

"Formato compatible con importación"

Debe generar un archivo que pueda:

exportarse
editarse
reimportarse

sin perder referencias de producto y sucursal.

==================================================
12. PLANTILLAS
==================================================

Crear templates:

Productos completos
Alta rápida
Inventario
Precios
Promociones

==================================================
13. PROMOCIONES
==================================================

Soportar:

percentage
fixed_amount
fixed_price

Campos:

value
starts_at
ends_at
branch

Validar:

0–100% para porcentaje

fecha fin >= inicio

==================================================
14. IMPORT PREVIEW
==================================================

Antes de ejecutar mostrar:

50 filas

40 crear
8 actualizar
2 errores

Y tabla:

fila
SKU
producto
acción
resultado

==================================================
15. ERRORES
==================================================

Mensajes claros.

Ejemplo:

Fila 23
SKU: PAN002
Stock Reforma:
"-5"

Error:
"El inventario no puede ser negativo."

NO usar errores genéricos.

==================================================
16. RESULTADO
==================================================

Después:

Importación completada

45 creados
8 actualizados
2 errores

[ Descargar errores ]

==================================================
17. HISTORIAL
==================================================

Guardar import jobs:

user
filename
date
created_count
updated_count
error_count
status

Crear página o drawer para consultar historial.

==================================================
18. ROBUSTEZ
==================================================

Para imports grandes:

usar procesamiento por batches/jobs.

No mantener request HTTP abierto indefinidamente.

Agregar:

progress
retry
logging
idempotency

No volver a crear filas si un job se procesa dos veces.

==================================================
19. INTEGRIDAD
==================================================

Usar transacciones donde sea apropiado.

No dejar producto parcialmente actualizado de manera silenciosa.

Registrar cambios de:

price
stock
promotion
branch assignment

==================================================
20. EXPORT PERFORMANCE
==================================================

No cargar miles de productos completos en frontend para después convertirlos a CSV.

Generar export server-side.

Para grandes volúmenes:

job asíncrono.

==================================================
21. MULTI-SUCURSAL
==================================================

No crear un producto por sucursal.

Mantener:

Product
↕
BranchProduct
↕
Branch

Stock siempre por branch.

El import/export debe respetar esta arquitectura.

==================================================
22. CRITERIOS DE ACEPTACIÓN
==================================================

Producto individual:
< 2 min.

Importar 50 productos:
flujo comprensible sin capacitación.

Actualizar inventario:
SKU + branch + stock.

Exportar productos filtrados:
máximo 3 pasos.

Errores:
identificables por fila.

Ninguna importación debe crear duplicados silenciosamente.

Ninguna actualización debe sobrescribir campos que el usuario no seleccionó.

==================================================
23. PRIMER ENTREGABLE
==================================================

Antes de implementar, entrégame:

1. Estado actual.
2. Funcionalidades reutilizables.
3. Gaps.
4. Nuevo flujo UX.
5. Arquitectura técnica propuesta.
6. Cambios DB/API necesarios.
7. Componentes a modificar.
8. Plan de implementación.
9. Riesgos.
10. Criterios de QA.

No implementes hasta haber presentado este plan.