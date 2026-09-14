Quiero que hagas una AUDITORÍA INTEGRAL DEL PANEL ADMIN de esta plataforma ecommerce multi-sucursal.

Tu objetivo NO es rediseñar visualmente por intuición ni empezar a cambiar código inmediatamente.

Primero debes entender cómo funciona actualmente el Admin desde el código, reconstruir sus flujos reales, evaluar su experiencia de uso, detectar problemas funcionales y operativos, y después proponer un plan de optimización priorizado.

Actúa como:

- Product Manager
- UX/UI Senior para herramientas operativas
- Consultor de procesos
- Arquitecto de software
- Especialista en ecommerce multi-sucursal
- QA funcional

==================================================
CONTEXTO DEL SISTEMA
==================================================

La plataforma es un ecommerce multi-sucursal para Pastelería Mallorca.

Actualmente debe contemplar principalmente:

- sucursales
- productos
- productos por sucursal
- inventario por sucursal
- contactos / encargados de sucursal
- alertas de stock
- pedidos
- calendario
- horarios
- disponibilidad
- promociones
- descuentos
- carga individual de productos
- carga masiva
- usuarios
- roles
- configuración

La lógica principal del frontend es:

Sucursal
→ Fecha
→ Hora
→ Catálogo disponible
→ Producto
→ Carrito
→ Pickup / Delivery
→ Checkout
→ Pago
→ Pedido

El Admin debe permitir operar y controlar todo esto de forma sencilla.

==================================================
PRINCIPIO DE LA AUDITORÍA
==================================================

No quiero evaluar únicamente si "funciona".

Quiero evaluar:

1. Si tiene lógica operativa.
2. Si es fácil de entender.
3. Si reduce pasos.
4. Si evita errores humanos.
5. Si la información importante está visible.
6. Si las acciones frecuentes son rápidas.
7. Si las acciones poco frecuentes no estorban.
8. Si existe duplicidad.
9. Si los nombres y conceptos son claros.
10. Si escala a más sucursales y productos.
11. Si el backend realmente soporta lo que muestra la interfaz.
12. Si existen flujos incompletos o inconsistentes.

==================================================
FASE 1 — MAPEAR EL ADMIN ACTUAL
==================================================

Primero inspecciona el código completo relacionado con Admin.

Identifica:

- rutas
- páginas
- layouts
- componentes
- tablas
- formularios
- modales
- drawers
- API calls
- server actions
- endpoints
- services
- hooks
- stores
- validaciones
- permisos
- base de datos relacionada

Genera un mapa funcional.

Ejemplo:

ADMIN

Dashboard
├── resumen
├── alertas
├── pedidos recientes
└── indicadores

Productos
├── listado
├── crear
├── editar
├── importar
└── inventario

Sucursales
├── listado
├── configuración
├── productos
├── inventario
├── pedidos
└── encargado

Pedidos
├── listado
├── detalle
├── estado
└── filtros

etc.

No asumas que la navegación actual es correcta.

Primero documenta lo que existe.

==================================================
FASE 2 — IDENTIFICAR EL FLUJO REAL DE USO
==================================================

Reconstruye los principales jobs-to-be-done del administrador.

Ejemplos:

JOB 1:
"Quiero crear un producto nuevo y ponerlo disponible en Reforma."

JOB 2:
"Quiero subir 40 productos de forma masiva."

JOB 3:
"Quiero actualizar stock de Reforma."

JOB 4:
"Quiero saber qué productos están por agotarse."

JOB 5:
"Quiero revisar los pedidos que tiene Lomas hoy."

JOB 6:
"Quiero cambiar el precio de un producto."

JOB 7:
"Quiero poner una promoción de 20% por una semana."

JOB 8:
"Quiero desactivar un producto sólo en Reforma."

JOB 9:
"Quiero ver la agenda de producción de mañana."

JOB 10:
"Quiero saber quién es el responsable de una sucursal."

Para cada JOB identificar:

- dónde empieza
- número de clics
- pantallas
- campos
- validaciones
- dependencias
- puntos de fricción
- resultado final

==================================================
FASE 3 — EVALUAR LA ARQUITECTURA DE INFORMACIÓN
==================================================

Analiza si la estructura actual del Admin tiene sentido.

Evalúa:

- nombres del menú
- agrupación de módulos
- niveles de navegación
- jerarquía
- accesibilidad de acciones frecuentes
- consistencia de terminología

Pregúntate:

¿Inventario debe estar dentro de Productos?

¿O merece módulo propio?

¿Sucursales debe contener productos y pedidos?

¿Pedidos debe tener vista global y por sucursal?

¿Promociones debe ser módulo independiente?

¿Disponibilidad debe estar dentro del producto o en configuración?

¿Calendario debe llamarse Agenda / Producción?

No mantengas la estructura actual únicamente porque ya existe.

==================================================
FASE 4 — EVALUACIÓN UX
==================================================

Evalúa cada pantalla con criterios de usabilidad.

Califica de 1 a 10:

- claridad
- velocidad
- carga cognitiva
- jerarquía visual
- navegación
- consistencia
- feedback
- prevención de errores
- eficiencia operativa
- escalabilidad

Para cada módulo genera:

SCORE
PROBLEMA
IMPACTO
RECOMENDACIÓN

Ejemplo:

Productos — 6/10

Problema:
demasiados campos en primera vista.

Impacto:
alto.

Recomendación:
Alta rápida + Configuración avanzada.

==================================================
FASE 5 — EVALUAR DASHBOARD
==================================================

Determina si el dashboard actual realmente ayuda a operar.

Debe contestar rápidamente:

- ¿Cuántos pedidos hay hoy?
- ¿Cuánto se vendió?
- ¿Qué sucursal tiene más actividad?
- ¿Qué productos están por agotarse?
- ¿Qué productos ya están agotados?
- ¿Hay pedidos atrasados?
- ¿Hay alertas?
- ¿Qué requiere atención?

Evitar métricas decorativas.

El dashboard debe priorizar:

ACCIÓN
no sólo información.

Ejemplo:

5 productos con stock crítico
[ Revisar inventario ]

8 pedidos pendientes
[ Ver pedidos ]

==================================================
FASE 6 — PRODUCTOS
==================================================

Auditar:

Admin
→ Productos

Evaluar:

- listado
- búsqueda
- filtros
- columnas
- edición rápida
- alta individual
- edición
- duplicar
- archivar
- asignación de sucursal

El listado ideal debería permitir entender rápidamente:

Producto
SKU
Categoría
Precio
Reforma
Lomas
Promoción
Estado

No saturarlo con información secundaria.

==================================================
FASE 7 — ALTA INDIVIDUAL
==================================================

Revisar flujo actual.

El objetivo es que un producto simple pueda crearse en menos de 2 minutos.

Flujo mínimo ideal:

Nombre
Categoría
Precio
Sucursal
Stock
Imagen
Publicar

Todo lo demás:

promociones
disponibilidad
lead time
ingredientes
alérgenos
variantes
configuración avanzada

debe aparecer sólo cuando sea necesario.

Determinar:

- campos innecesarios
- campos faltantes
- orden incorrecto
- dependencias confusas
- validaciones tardías
- elementos técnicos que no debería ver el usuario

==================================================
FASE 8 — CARGA MASIVA
==================================================

Evaluar flujo:

Subir archivo
→ Mapear
→ Validar
→ Preview
→ Confirmar
→ Resultado

Debe soportar:

CSV
XLSX

Evaluar:

- facilidad
- mensajes de error
- identificación por SKU
- actualización vs creación
- productos por sucursal
- inventario
- promociones

No permitir importaciones silenciosas.

==================================================
FASE 9 — INVENTARIO
==================================================

Este módulo debe estar optimizado para operación diaria.

Evaluar si existe vista:

Producto
SKU
Sucursal
Stock
Mínimo
Reservado
Disponible
Estado

Filtros:

Sucursal
Categoría
Stock bajo
Agotado

Debe permitir:

- editar stock rápido
- ajustar +
- ajustar -
- restock
- búsqueda
- historial

Evaluar también una vista matriz:

Producto          Reforma     Lomas

Panettone         8           4
Croissant         12          0
Tarta             3           6

Esta vista puede ser extremadamente útil.

==================================================
FASE 10 — SUCURSALES
==================================================

Auditar:

Admin
→ Sucursales

Cada sucursal debería tener:

GENERAL
CONTACTO
HORARIOS
PRODUCTOS
INVENTARIO
PEDIDOS
ALERTAS
CONFIGURACIÓN

Evaluar si esto existe o si actualmente está fragmentado.

Dentro de una sucursal el usuario debería poder entender toda su operación.

==================================================
FASE 11 — PEDIDOS
==================================================

Evaluar listado de pedidos.

Debe permitir:

Sucursal
Fecha
Hora
Tipo
Estado
Cliente
Total

Filtros importantes:

hoy
mañana
sucursal
pickup
delivery
pendiente
preparando
listo
entregado

Evaluar cantidad de clics para:

abrir pedido
actualizar estado
consultar productos
contactar cliente

==================================================
FASE 12 — AGENDA / PRODUCCIÓN
==================================================

Determinar si existe.

Si no existe, evaluar necesidad.

Vista ideal:

Sucursal:
Reforma

Fecha:
15 septiembre

12:00
Pedido #001
2 × Croissant
1 × Panettone

12:30
Pedido #002
1 × Pastel

Debe ayudar al equipo a preparar los pedidos cronológicamente.

==================================================
FASE 13 — PROMOCIONES
==================================================

Evaluar experiencia actual para crear descuentos.

Debe soportar:

- precio especial
- porcentaje
- monto fijo
- inicio
- término
- producto
- categoría
- sucursal

Ejemplo:

20%
Panettone
Reforma
15–20 septiembre

Debe ser fácil de entender.

Mostrar preview:

Precio:
$350

Descuento:
20%

Final:
$280

==================================================
FASE 14 — ALERTAS
==================================================

Evaluar:

- stock bajo
- agotado
- pedidos pendientes
- errores
- incidencias

No inundar al usuario.

Clasificar:

CRÍTICO
ATENCIÓN
INFORMATIVO

==================================================
FASE 15 — RESPONSABLES DE SUCURSAL
==================================================

Evaluar cómo está modelado.

No debería ser sólo texto.

Ideal:

branch_manager
→ user_id
→ branch_id

Debe permitir:

nombre
correo
WhatsApp
rol
notificaciones

Validar también fallback de contacto.

==================================================
FASE 16 — ROLES Y PERMISOS
==================================================

Mapear:

admin
operations_manager
branch_manager
staff

Identificar qué ve cada uno.

Ejemplo:

Admin:
todo

Branch manager:
sólo su sucursal

Staff:
operación limitada

Evaluar si UI y backend coinciden.

==================================================
FASE 17 — CONSISTENCIA VISUAL
==================================================

Auditar:

- spacing
- tamaños
- tablas
- botones
- formularios
- drawers
- modales
- tabs
- badges
- estados
- colores
- iconografía

No quiero un Admin lleno de cards.

Debe sentirse:

operativo
limpio
rápido
moderno
sobrio

Inspiración conceptual:

Shopify
Stripe
Linear
Notion

pero adaptado a operación de restaurante/pastelería.

==================================================
FASE 18 — CARGA COGNITIVA
==================================================

Busca casos donde el usuario tenga que pensar demasiado.

Ejemplo:

MAL:

Precio de lista
Precio regular
Precio venta
Override
Tipo
Valor
Descuento

si todo se muestra simultáneamente.

MEJOR:

Precio
$350

[ Crear promoción ]

y desplegar configuración sólo si se requiere.

Usar progressive disclosure.

==================================================
FASE 19 — EDICIÓN RÁPIDA
==================================================

Identificar acciones que no deberían requerir abrir una ficha completa.

Ejemplos:

Stock
Precio
Estado
Destacado
Sucursal
Promoción

Proponer inline editing donde tenga sentido.

==================================================
FASE 20 — FEEDBACK
==================================================

Validar que toda acción tenga respuesta clara.

Ejemplo:

Stock actualizado.

Producto publicado.

Importación completada.

Promoción programada.

No utilizar mensajes genéricos tipo:

"Success."

==================================================
FASE 21 — PREVENCIÓN DE ERRORES
==================================================

Buscar flujos peligrosos.

Ejemplos:

borrar producto
desactivar sucursal
cambiar stock
eliminar promoción
cancelar pedido

Deben tener:

confirmación
contexto
resultado

No abusar de confirmaciones para acciones reversibles.

==================================================
FASE 22 — EMPTY STATES
==================================================

Revisar estados vacíos.

Ejemplo:

No hay promociones activas.

[ Crear promoción ]

En lugar de:

"No data."

==================================================
FASE 23 — LOADING / ERROR STATES
==================================================

Auditar:

loading
skeleton
errores
reintentos
timeout

No permitir páginas vacías sin explicación.

==================================================
FASE 24 — MOBILE / TABLET
==================================================

El Admin probablemente se usará principalmente en desktop/tablet.

Priorizar:

Desktop
Tablet

Pero revisar mobile para:

- consultar pedido
- cambiar estado
- actualizar stock
- revisar alerta

No intentar meter tablas gigantes en 375px.

Usar cards / rows adaptativas sólo donde sea necesario.

==================================================
FASE 25 — DUPLICIDADES
==================================================

Buscar lógica repetida.

Ejemplo:

stock editable en:

Productos
Inventario
Sucursal

Esto puede ser correcto SI todos usan la misma fuente de datos.

Pero evaluar si genera confusión.

Debe haber una fuente de verdad.

==================================================
FASE 26 — BACKEND VS UI
==================================================

Para cada acción importante comprobar:

botón
→ handler
→ API
→ service
→ DB
→ respuesta
→ refresh UI

Detectar botones que:

- no hacen nada
- usan mock data
- sólo modifican frontend
- no persisten
- persisten parcialmente
- no validan correctamente

==================================================
FASE 27 — DATOS MOCK / PLACEHOLDERS
==================================================

Buscar:

mock
dummy
fake
placeholder
hardcoded

Identificar claramente qué partes del Admin no están conectadas realmente.

==================================================
FASE 28 — PERFORMANCE
==================================================

Revisar:

N+1
requests duplicados
refetch innecesario
tablas enormes
queries sin pagination
images pesadas
re-renders

No sobreoptimizar.

Priorizar problemas perceptibles.

==================================================
FASE 29 — PRIORIZACIÓN
==================================================

Todos los hallazgos deben clasificarse usando:

P0 — Bloqueante
P1 — Alta prioridad
P2 — Mejora importante
P3 — Nice to have

Ejemplo:

P0
Inventario de sucursales se mezcla.

P1
Alta de producto demasiado compleja.

P2
Falta edición inline.

P3
Mejorar animación de drawer.

==================================================
FASE 30 — EVALUACIÓN POR MÓDULO
==================================================

Crear tabla final:

Módulo
Funcionalidad
UX
Claridad
Riesgo
Score

Ejemplo:

Dashboard
8
6
7
Medio
7.0

Productos
8
5
6
Medio
6.3

Inventario
7
6
8
Alto
7.0

Pedidos
...

==================================================
FASE 31 — PROPUESTA DE NUEVA ARQUITECTURA ADMIN
==================================================

Después de auditar, propón navegación ideal.

Ejemplo:

ADMIN

Inicio

Pedidos

Agenda

Productos
├ Inventario
├ Importar

Promociones

Sucursales

Clientes

Alertas

Configuración

Pero NO uses este ejemplo automáticamente.

Primero analiza el producto real y luego recomienda.

==================================================
FASE 32 — QUICK WINS
==================================================

Identifica cambios que podrían mejorar mucho la experiencia con poco esfuerzo.

Ejemplo:

- mejores filtros
- edición inline
- ocultar campos avanzados
- cambiar orden de formulario
- mejorar CTA
- mejor empty state
- tabs
- breadcrumbs
- shortcuts

==================================================
FASE 33 — NO IMPLEMENTAR TODAVÍA
==================================================

IMPORTANTE:

En esta primera ejecución NO hagas un rediseño completo.

NO cambies arquitectura.

NO elimines módulos.

NO hagas refactors grandes.

Primero entrega diagnóstico.

Sólo puedes corregir bugs evidentes si impiden analizar el sistema.

==================================================
ENTREGABLE FINAL
==================================================

Quiero recibir:

# ADMIN AUDIT

## 1. Executive Summary

Qué tan usable y funcional es actualmente el Admin.

Score general /10.

## 2. Arquitectura actual

Mapa del Admin.

## 3. Principales flujos

Cómo funcionan actualmente.

## 4. Problemas críticos

P0 / P1.

## 5. Fricciones UX

Dónde se pierde tiempo o claridad.

## 6. Problemas funcionales

Qué no funciona o funciona parcialmente.

## 7. Duplicidades

Qué podría simplificarse.

## 8. Módulos faltantes

Qué hace falta para operar correctamente.

## 9. Propuesta de navegación

Nueva arquitectura recomendada.

## 10. Quick Wins

Mejoras pequeñas / alto impacto.

## 11. Mejoras estructurales

Cambios mayores posteriores.

## 12. Score por módulo

Tabla comparativa.

## 13. Roadmap recomendado

Fase 1
Fase 2
Fase 3

==================================================
FORMATO DEL ANÁLISIS
==================================================

No quiero comentarios genéricos como:

"se puede mejorar UX"

Quiero:

PROBLEMA

EVIDENCIA EN CÓDIGO

IMPACTO

RECOMENDACIÓN

PRIORIDAD

Ejemplo:

PROBLEMA:
El cambio de stock requiere abrir ficha completa.

EVIDENCIA:
InventoryTable.tsx sólo redirige a /products/:id.

IMPACTO:
El encargado necesita múltiples clics para actualizar productos.

RECOMENDACIÓN:
Agregar inline stock adjustment + /-/edit.

PRIORIDAD:
P1

==================================================
CRITERIO PRINCIPAL
==================================================

El Admin debe permitir que una persona nueva pueda operar Mallorca sin necesitar explicación técnica.

Las acciones frecuentes deben ser rápidas.

Las acciones complejas deben estar disponibles, pero no estorbar.

La complejidad del sistema debe existir por debajo.

No delante del usuario.

Empieza inspeccionando el código y entrégame únicamente el diagnóstico completo y el plan de optimización.

NO implementes los cambios todavía.