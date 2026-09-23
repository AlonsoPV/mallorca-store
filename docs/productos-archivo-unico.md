# Productos e inventario: archivo único

Desde Productos, **Exportar** descarga un Excel reimportable y **Importar** abre el panel dentro del catálogo. Se acepta CSV o XLSX con la primera hoja como tabla de datos.

- Una fila representa un SKU y una sucursal. Un SKU puede repetirse en sucursales distintas; no se crean productos duplicados.
- El archivo reúne información general, precios, categorías, etiquetas, disponibilidad, existencias, mínimos, umbrales críticos, alertas automáticas, preparación, promociones y ventas cruzadas.
- Exportar respeta los productos filtrados o seleccionados e incluye sus sucursales.
- Las columnas se reconocen automáticamente. Una columna marcada «No importar» se omite explícitamente. Las celdas vacías conservan el valor; para cantidades y booleanos se aceptan cero y false.
- Los cambios en columnas o campos invalidan la previsualización. La confirmación se habilita después de validar sin errores.
- Cada intento utiliza una clave de idempotencia independiente de la longitud del archivo; un reintento conserva su clave.
- La plantilla de ejemplo requiere revisar la categoría y el código de sucursal según el catálogo de destino.

## Validación

Ejecutar desde la raíz:

```powershell
node --experimental-strip-types --test artifacts/api-server/product-transfer.test.mjs artifacts/api-server/src/lib/inventory.test.ts artifacts/api-server/src/lib/purchase-integrity.test.ts
node node_modules/typescript/bin/tsc -p artifacts/mallorca-ecommerce/tsconfig.json --noEmit
node node_modules/typescript/bin/tsc -p artifacts/api-server/tsconfig.json --noEmit
```

La prueba HTTP inicia una API de prueba aislada en un puerto libre asignado automáticamente, exporta seis filas de tres productos, genera y vuelve a leer XLSX, cambia precio y existencias, valida e importa, y vuelve a exportar para reconciliar los resultados. También prueba stock inválido y exportación filtrada. El proceso se cierra al terminar. No utiliza la base de datos de producción.

Las pruebas del parser cubren textos con comas, comillas y saltos de línea, SKU con ceros iniciales, múltiples sucursales, duplicados, negativos, fracciones, mínimos críticos y exclusión de columnas.

La API local existente requiere reinicio para cargar los cambios en sus controladores; su almacenamiento es temporal en memoria. Las modificaciones del servidor real requieren su despliegue habitual. La persistencia real en PostgreSQL no forma parte de la prueba aislada.
