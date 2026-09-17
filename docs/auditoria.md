Actúa como:

- Senior Product Designer especializado en SaaS / Admin Systems
- Senior UX/UI Designer
- Product Manager
- UX Architect
- Frontend Architect
- Especialista en ecommerce y operaciones multi-sucursal

Quiero realizar una AUDITORÍA Y OPTIMIZACIÓN TRANSVERSAL del Admin de Pastelería Mallorca.

IMPORTANTE:

NO quiero agregar funcionalidades porque sí.

Muchas de las capacidades principales ya existen o están siendo desarrolladas:

- Dashboard
- Productos
- creación y edición de productos
- categorías
- etiquetas
- inventario
- promociones
- cross-sell
- importación/exportación
- pedidos
- pedidos manuales
- agenda
- sucursales
- usuarios/responsables
- alertas
- reportes

Ahora quiero asegurar que TODO EL ADMIN se sienta como un solo producto:

COHERENTE
RÁPIDO
INTUITIVO
ORDENADO
PROFESIONAL
OPERATIVO

La prioridad es optimizar:

1. funcionalidad
2. flujo de uso
3. arquitectura de información
4. jerarquía visual
5. distribución de pantalla
6. espaciado
7. densidad de información
8. consistencia
9. responsive
10. feedback del sistema
11. prevención de errores
12. velocidad operativa

==================================================
FASE 1 — AUDITAR ANTES DE MODIFICAR
==================================================

NO empieces rediseñando.

Primero recorre el Admin completo y construye un mapa real de:

- rutas
- sidebar
- navegación secundaria
- layouts
- headers
- páginas
- tablas
- formularios
- tabs
- drawers
- modales
- cards
- filtros
- acciones
- estados
- empty states
- loading states
- error states
- componentes reutilizados
- componentes duplicados

Analiza además:

- API calls
- server actions
- hooks
- stores
- permisos
- validaciones
- estados
- responsive actual

Identifica qué patrones ya funcionan bien y deben conservarse.

NO rehacer componentes sanos sólo por uniformidad estética.

==================================================
2. PRINCIPIO CENTRAL
==================================================

El Admin debe sentirse como:

"Una herramienta de operación diaria."

NO como:

- una colección de formularios
- un CMS genérico
- un dashboard decorativo
- un template SaaS
- una colección de cards
- un clon visual de WooCommerce

WooCommerce puede servir como referencia de lógica y familiaridad operativa.

Pero la experiencia debe ser:

más clara
más rápida
más moderna
más contextual
menos técnica

==================================================
3. JERARQUÍA DE NAVEGACIÓN
==================================================

Revisar navegación global.

Referencia conceptual:

Inicio

Pedidos
Agenda

Productos
Inventario
Promociones

Sucursales

Alertas

Configuración

Dentro de Configuración pueden vivir elementos menos frecuentes:

Usuarios
Responsables
Reportes
Configuraciones generales
etc.

NO llenar sidebar con acciones.

Ejemplo:

"Nuevo producto"

NO debe ser navegación principal.

Debe ser CTA dentro de Productos.

"Nuevo pedido"

debe ser CTA dentro de Pedidos.

==================================================
4. CONTEXTO
==================================================

Evitar pedir repetidamente información que el sistema ya conoce.

Ejemplo:

Si estoy en:

Sucursal
→ Reforma
→ Inventario

NO volver a preguntar:

Sucursal.

Si estoy en:

Cliente
→ Ana López
→ Nuevo pedido

preseleccionar cliente.

Si estoy en:

Productos
→ Panettone
→ Inventario

preseleccionar producto.

La interfaz debe conservar contexto.

==================================================
5. ESTRUCTURA GENERAL DE PÁGINA
==================================================

Crear un patrón consistente.

Cada página debería seguir aproximadamente:

PAGE HEADER

Título
Descripción breve opcional

Acciones principales

--------------------------------

Filtros / contexto

--------------------------------

Contenido principal

--------------------------------

Acciones secundarias si aplica

Ejemplo:

Productos                         [+ Añadir producto]

Gestiona catálogo, disponibilidad e inventario.

[Buscar...] [Categoría ▾] [Sucursal ▾] [Estado ▾]

----------------------------------------------------

TABLA

==================================================
6. PAGE HEADER
==================================================

Estandarizar:

altura
padding
tipografía
alineación
acciones

No hacer headers gigantes.

Evitar desperdiciar 200px antes de mostrar contenido operativo.

Desktop recomendado:

padding vertical:
24–32px

Mobile:
16–24px

Título:

28–32px desktop
24–28px tablet/mobile

Descripción:

máximo 1–2 líneas.

==================================================
7. SISTEMA DE ESPACIADO
==================================================

Auditar todo el Admin para detectar:

- espacios excesivos
- elementos demasiado pegados
- paddings inconsistentes
- márgenes arbitrarios

Definir spacing scale.

Ejemplo:

4
8
12
16
24
32
48
64

Evitar valores arbitrarios como:

13px
19px
27px
37px

salvo necesidad real.

==================================================
8. DENSIDAD
==================================================

Este es un ADMIN.

Debe tener una densidad mayor que el storefront.

NO convertir cada dato en una card enorme.

Priorizar:

tablas
listas
filas
drawers
panels
tabs
inline actions

sobre:

cards gigantes.

Una pantalla de 1440px debe aprovechar correctamente el ancho disponible.

==================================================
9. CONTENEDORES
==================================================

Auditar max-width.

No limitar innecesariamente páginas operativas a:

900px
1000px

cuando contienen:

tablas
inventario
pedidos
matrices

Para páginas operativas:

usar casi todo el viewport disponible.

Ejemplo conceptual:

width: 100%
max-width: 1600–1800px
margin: auto

con padding lateral apropiado.

==================================================
10. DIFERENCIAR TIPOS DE PÁGINA
==================================================

No todas las páginas necesitan el mismo layout.

Definir al menos:

A. LIST PAGE

Ejemplo:
Productos
Pedidos
Inventario
Alertas

B. DETAIL PAGE

Ejemplo:
Producto
Pedido
Sucursal

C. CREATION PAGE

Ejemplo:
Nuevo producto
Nuevo pedido
Nueva sucursal

D. OPERATIONAL PAGE

Ejemplo:
Agenda
Inventario Matrix

E. DASHBOARD

Cada una puede tener distinta distribución.

==================================================
11. TABLAS
==================================================

Auditar todas las tablas.

Estandarizar:

altura fila
header
padding
checkbox
badges
acciones
hover
selección
sticky header
paginación

Evitar tablas con demasiado aire.

Referencia:

row height:
48–60px

dependiendo del contenido.

==================================================
12. COLUMNAS
==================================================

Priorizar información.

No mostrar 15 columnas simultáneamente.

Clasificar:

PRIMARY
SECONDARY
OPTIONAL

Ejemplo Productos:

PRIMARY:

Producto
SKU
Precio
Sucursales
Stock
Estado

SECONDARY:

Categoría
Promoción

OPTIONAL:

creado
actualizado
etc.

Permitir ocultar columnas si aporta valor.

==================================================
13. ACCIONES EN TABLAS
==================================================

Acción primaria visible cuando sea importante.

Acciones secundarias:

menú ⋯

Ejemplo:

Producto

Editar

⋯
Duplicar
Archivar
Generar alerta

No mostrar 6 botones por fila.

==================================================
14. FILTROS
==================================================

Crear patrón común.

[ Buscar... ]

[Sucursal ▾]
[Estado ▾]
[Categoría ▾]

[Más filtros]

[Limpiar]

No mostrar permanentemente 12 filtros.

Los filtros frecuentes visibles.

Los avanzados en:

Más filtros.

==================================================
15. FILTROS ACTIVOS
==================================================

Mostrar chips.

Ejemplo:

Sucursal: Reforma ×
Stock: Bajo ×

Limpiar todo

Esto ayuda a entender por qué aparecen ciertos resultados.

==================================================
16. BÚSQUEDA
==================================================

Search consistente.

Permitir cuando corresponda:

nombre
SKU
email
teléfono
número de pedido

Debounce.

No hacer request por cada tecla sin control.

==================================================
17. FORMULARIOS
==================================================

Auditar formularios largos.

Problema a evitar:

50 campos visibles simultáneamente.

Aplicar:

progressive disclosure.

Separar:

BÁSICO

OPERACIÓN

COMERCIAL

AVANZADO

==================================================
18. FORMULARIO — ANCHO
==================================================

No hacer inputs de 1200px para:

teléfono
precio
SKU

Usar anchos según contenido.

Ejemplo:

Nombre:
ancho amplio

SKU:
medio

Precio:
pequeño

Fecha:
medio

==================================================
19. FORMULARIOS — GRID
==================================================

Desktop:

usar 2 columnas cuando tenga sentido.

Ejemplo:

Nombre
[________________________]

SKU                 Estado
[________]           [Activo ▾]

Precio              Categoría
[$_______]           [________]

No usar dos columnas cuando los campos necesitan lectura larga.

==================================================
20. FORMULARIOS — SECCIONES
==================================================

Separar visualmente mediante:

heading
spacing
divider
background muy sutil

NO convertir cada sección en una card pesada.

==================================================
21. LABELS
==================================================

Labels siempre claros.

Evitar lenguaje técnico.

NO:

branch_product_override

SÍ:

Precio especial en esta sucursal

NO:

min_stock_threshold

SÍ:

Alertar cuando queden

==================================================
22. HELP TEXT
==================================================

Mostrar ayuda únicamente cuando sea necesaria.

Ejemplo:

Stock mínimo

[ 5 ]

"Te avisaremos cuando el inventario llegue a esta cantidad."

No llenar todo de tooltips.

==================================================
23. VALIDACIÓN
==================================================

Errores junto al campo.

Ejemplo:

Stock
[-5]

"El inventario no puede ser negativo."

No depender únicamente de toast global.

==================================================
24. GUARDADO
==================================================

Estandarizar:

Guardar

Guardar borrador

Publicar

Actualizar

Cancelar

Evitar que cada módulo utilice terminología diferente.

==================================================
25. STICKY ACTIONS
==================================================

En formularios largos considerar:

sticky footer

o

sticky action bar

con:

Cancelar
Guardar

El usuario no debe regresar 1000px arriba para guardar.

==================================================
26. DRAWERS
==================================================

Usar drawer para operaciones rápidas:

Quick Edit

Actualizar inventario

Crear alerta

Asignar usuario

Cambiar estado

Ver resumen

No usar drawer para formularios enormes.

==================================================
27. MODALES
==================================================

Reservar modal para:

confirmaciones
acciones pequeñas
riesgo
decisiones

NO meter:

"Editar producto completo"

en modal.

==================================================
28. CONFIRMACIONES
==================================================

No pedir confirmación para acciones reversibles simples.

Sí para:

Eliminar
Archivar
Cancelar pedido
Desactivar sucursal
Reemplazar categorías
Sobrescribir inventario

==================================================
29. FEEDBACK
==================================================

Cada acción debe tener feedback.

Ejemplo:

"Producto actualizado."

"Inventario Reforma: 8 → 12."

"Pedido #1048 confirmado."

"Alerta asignada a Ana."

==================================================
30. TOASTS
==================================================

Estandarizar:

Success
Warning
Error
Info

No abusar.

Errores importantes deben permanecer visibles.

==================================================
31. LOADING
==================================================

No mostrar pantalla blanca.

Usar:

skeleton
spinner localizado
disabled state

según operación.

==================================================
32. EMPTY STATES
==================================================

Deben ayudar a continuar.

NO:

"No data."

SÍ:

"No hay promociones activas."

[ Crear promoción ]

==================================================
33. ESTADOS VISUALES
==================================================

Estandarizar badges.

Ejemplo:

Activo
Borrador
Agotado
Stock bajo
Crítico
Pendiente
Preparando
Listo
Entregado

Usar:

color
+
texto

No depender sólo del color.

==================================================
34. COLORES
==================================================

Admin debe mantener relación con Mallorca sin parecer storefront.

Usar Mallorca Red:

#D43B2B

principalmente para:

CTA primario
selección
focus
elementos activos

No pintar toda la interfaz de rojo.

Usar neutros para operación.

==================================================
35. BOTONES
==================================================

Definir jerarquía:

PRIMARY

SECONDARY

TERTIARY

DANGER

Ejemplo:

[ Guardar ]

[ Cancelar ]

⋯

No tener 4 botones primarios compitiendo.

==================================================
36. ICONOS
==================================================

Usar una sola librería.

Tamaño consistente:

16
18
20

No mezclar estilos filled/outline arbitrariamente.

==================================================
37. BORDER RADIUS
==================================================

Mantener moderado.

No convertir Admin en SaaS genérico de:

cards redondas gigantes.

Referencia:

6–10px

para inputs/cards/buttons según componente.

==================================================
38. SOMBRAS
==================================================

Reducir.

Priorizar:

border
background
spacing

para jerarquía.

Sombras sólo cuando indiquen elevación:

dropdown
modal
drawer
floating element.

==================================================
39. DASHBOARD
==================================================

El Dashboard debe responder:

"¿Qué requiere mi atención?"

Antes de:

"¿Qué estadísticas existen?"

Priorizar:

Pedidos próximos

Stock crítico

Alertas

Pedidos pendientes

Incidencias

Después:

ventas
KPIs
reportes

==================================================
40. DASHBOARD ACCIONABLE
==================================================

Cada bloque debe llevar a una acción.

Ejemplo:

3 productos agotados

[ Revisar ]

→ abre Inventario filtrado.

No cards decorativas sin navegación.

==================================================
41. PRODUCTOS
==================================================

Optimizar:

listado
alta rápida
edición
bulk actions
import/export

El usuario debe distinguir claramente:

CATÁLOGO

de

INVENTARIO.

Pero poder administrar inventario desde producto cuando sea necesario.

==================================================
42. PEDIDOS
==================================================

Priorizar:

hora
cliente
sucursal
fulfillment
total
estado

Acciones frecuentes:

Confirmar
Preparar
Listo
Entregar

Mostrar únicamente transiciones válidas.

==================================================
43. PEDIDO MANUAL
==================================================

Optimizar como:

ORDER BUILDER.

Desktop:

aproximadamente:

60% catálogo/búsqueda

40% pedido actual

Evitar formulario vertical gigantesco.

==================================================
44. INVENTARIO
==================================================

Debe ser altamente denso.

Priorizar tabla/matrix.

Producto
Sucursal
Stock
Reservado
Disponible
Mínimo
Estado

Acciones rápidas.

==================================================
45. ALERTAS
==================================================

Priorizar:

qué pasó
dónde
qué producto
qué prioridad
quién atiende
qué hacer

No mostrar metadata técnica innecesaria.

==================================================
46. SUCURSALES
==================================================

Sucursal debe sentirse como:

unidad operativa.

Dentro de sucursal:

Resumen
Pedidos
Agenda
Productos
Inventario
Horarios
Equipo
Alertas
Configuración

Evitar repetir información global.

==================================================
47. RESPONSIVE
==================================================

Auditar al menos:

1920
1440
1366
1280
1024
768
430
390
375

==================================================
48. DESKTOP
==================================================

Aprovechar ancho.

No centrar tablas estrechas dentro de enormes espacios vacíos.

==================================================
49. TABLET
==================================================

Sidebar puede colapsar.

Filtros pueden convertirse en drawer.

Mantener acciones principales accesibles.

==================================================
50. MOBILE
==================================================

No intentar meter tablas desktop completas.

Según módulo:

transformar en:

scroll horizontal controlado

o

filas/cards compactas

o

vista resumida.

Acciones frecuentes accesibles con pulgar.

==================================================
51. SIDEBAR
==================================================

Auditar:

ancho
iconos
spacing
estado activo
submenus
scroll

No hacerlo excesivamente ancho.

Mantener navegación estable.

==================================================
52. TOPBAR
==================================================

Evitar duplicar navegación.

Puede contener:

branch context si aplica
notificaciones
usuario

No llenar de acciones secundarias.

==================================================
53. CONSISTENCIA DE COMPONENTES
==================================================

Crear/reutilizar primitives.

Ejemplo:

PageHeader
DataTable
FilterBar
SearchInput
StatusBadge
EmptyState
Drawer
ConfirmDialog
FormSection
Field
UserSelector
BranchSelector
ProductSelector
DatePicker
TimePicker
ActionMenu

Evitar componentes casi idénticos por módulo.

==================================================
54. DESIGN TOKENS
==================================================

Centralizar:

spacing
font sizes
colors
radius
borders
shadows
breakpoints
control heights

No hardcodear estilos diferentes en cada página.

==================================================
55. CONTROL HEIGHTS
==================================================

Estandarizar inputs/buttons/selects.

Ejemplo:

compact:
32px

default:
40px

large:
48px

No tener inputs de 36, 41, 45, 50px arbitrariamente.

==================================================
56. TIPOGRAFÍA
==================================================

Definir jerarquía consistente:

Page title

Section title

Card/table title

Body

Secondary

Caption

No depender de tamaños enormes.

==================================================
57. INFORMACIÓN SECUNDARIA
==================================================

Usar contraste tipográfico.

Ejemplo:

Panettone Tradicional
PAN001 · Panadería

en vez de dedicar columnas/filas enormes a todo.

==================================================
58. ACCIONES FRECUENTES
==================================================

Identifica las 10 acciones más frecuentes del Admin.

Optimízalas primero.

Probablemente:

1. revisar pedidos de hoy
2. cambiar estado de pedido
3. crear pedido manual
4. buscar producto
5. crear producto
6. modificar stock
7. revisar stock bajo
8. crear promoción
9. importar productos/inventario
10. revisar operación por sucursal

Mide cantidad de clics.

==================================================
59. OBJETIVO DE CLICKS
==================================================

Acciones frecuentes:

1–3 clics desde contexto adecuado.

Evitar:

Sidebar
→ módulo
→ submenu
→ detalle
→ tab
→ botón
→ modal

para tareas cotidianas.

==================================================
60. DEEP LINKS
==================================================

Todos los indicadores accionables deben soportar navegación contextual.

Ejemplo:

Dashboard

"4 stock bajo"

→

/admin/inventario?status=low_stock

No mandar simplemente a Inventario sin filtro.

==================================================
61. PERSISTENCIA DE FILTROS
==================================================

Cuando tenga sentido:

conservar filtros al volver de detalle.

Ejemplo:

Productos
Filtro: Reforma + Panadería

→ Editar producto

→ Volver

Debe conservar:

Reforma + Panadería.

==================================================
62. BREADCRUMBS
==================================================

Usar sólo cuando aporten orientación.

Ejemplo:

Sucursales / Reforma / Inventario

No poner breadcrumbs redundantes en páginas simples.

==================================================
63. ACCESIBILIDAD
==================================================

Revisar:

keyboard navigation
focus visible
labels
aria
contraste
target sizes
dialogs
tables

WCAG AA como referencia.

==================================================
64. PERFORMANCE PERCIBIDA
==================================================

Optimizar:

lazy loading
pagination
virtualization si aplica
debounce
prefetch
optimistic updates sólo cuando sean seguros

Evitar refetch completo después de cada pequeña acción.

==================================================
65. ERRORES DE BACKEND
==================================================

Traducir errores técnicos.

NO:

HTTP 409
INVALID_TRANSITION

SÍ:

"Este pedido ya está en preparación y no puede volver a Confirmado."

Mantener detalle técnico en logs.

==================================================
66. SEGURIDAD UX
==================================================

Ocultar/deshabilitar acciones que el usuario no puede realizar.

Pero también validar backend.

Nunca depender sólo del frontend.

==================================================
67. NO SOBRE-DISEÑAR
==================================================

Evitar:

gradientes innecesarios
glassmorphism
animaciones decorativas
cards por todo
sombras pesadas
bordes exagerados
colores innecesarios
ilustraciones sin función

El Admin debe sentirse:

limpio
preciso
rápido
sobrio
premium

==================================================
68. MICROINTERACCIONES
==================================================

Usar sólo donde aportan feedback:

hover
focus
selección
expand
drawer
saving
success

Duración:

150–250ms generalmente.

==================================================
69. AUDITAR ESPACIO VACÍO
==================================================

Buscar específicamente:

- headers demasiado altos
- cards demasiado grandes
- tablas demasiado estrechas
- formularios con inputs innecesariamente anchos
- gaps verticales >48px sin justificación
- bloques centrados donde deberían usar ancho disponible

Reducir espacio sin hacer la interfaz claustrofóbica.

==================================================
70. AUDITAR DISTRIBUCIÓN
==================================================

Para cada pantalla preguntarse:

¿La información más importante aparece primero?

¿La acción principal está donde el usuario espera?

¿Estamos usando correctamente el ancho?

¿Hay información duplicada?

¿Existe demasiado scroll?

¿Podemos resolver algo inline?

¿Hay contexto repetido?

¿Hay acciones escondidas innecesariamente?

==================================================
71. HEURÍSTICA 80/20
==================================================

Diseñar la vista principal para el 80% de las operaciones.

Mover el 20% excepcional a:

Más opciones
Avanzado
Configuración
drawers

No hacer que todos los usuarios carguen visualmente con todas las posibilidades del sistema.

==================================================
72. NO ROMPER FUNCIONALIDAD
==================================================

Antes de modificar componentes:

identificar:

API
state
validations
permissions
events
side effects

Los cambios UX no deben romper:

inventario
pedidos
promociones
importaciones
alertas
sucursales
permisos

==================================================
73. REUTILIZACIÓN
==================================================

Antes de crear un componente nuevo:

buscar si ya existe uno equivalente.

Consolidar duplicados sólo cuando sea seguro.

==================================================
74. MÉTRICAS DE ÉXITO
==================================================

Objetivos:

Encontrar pedidos de hoy:
< 10 segundos

Cambiar estado:
1–2 clics

Crear producto básico:
< 2 minutos

Actualizar stock:
< 15 segundos

Generar alerta:
< 10 segundos

Crear pedido manual:
< 2–3 minutos para pedido normal

Crear promoción:
< 1 minuto

Encontrar operación de sucursal:
1 clic desde sucursal

Importar inventario:
< 2 minutos después de tener archivo

==================================================
75. TEST DE USABILIDAD MENTAL
==================================================

Para cada pantalla hacer la prueba:

Un usuario nuevo entra.

En 5 segundos:

¿entiende dónde está?

¿entiende qué información está viendo?

¿identifica la acción principal?

¿entiende qué necesita atención?

En 30 segundos:

¿puede completar la tarea principal sin capacitación?

==================================================
76. PRIMER ENTREGABLE
==================================================

NO empieces con un refactor general.

Primero genera:

ADMIN UX/UI AUDIT

con:

1. Executive Summary

2. Current Information Architecture

3. Navigation Problems

4. Layout Problems

5. Spacing Problems

6. Density Problems

7. Functional Friction

8. Inconsistent Components

9. Redundant Components

10. Responsive Problems

11. Accessibility Problems

12. Performance / perceived performance issues

13. Top 10 workflows by operational importance

14. Click count of each workflow

15. Quick Wins

16. Structural Improvements

17. Proposed Design System / tokens

18. Proposed layout patterns

19. Components to consolidate

20. Screens requiring redesign

21. Screens that should NOT be touched

==================================================
77. FORMATO DE FINDINGS
==================================================

Para cada problema usar:

PROBLEMA

Dónde ocurre.

EVIDENCIA EN CÓDIGO

Archivo / componente / ruta.

IMPACTO

Qué problema provoca al usuario.

PROPUESTA

Cómo resolverlo.

PRIORIDAD

P0
P1
P2
P3

ESFUERZO

S
M
L

==================================================
78. PRIORIZACIÓN
==================================================

P0:
rompe operación, provoca errores o impide tarea.

P1:
fricción frecuente o afecta operación diaria.

P2:
mejora importante pero no bloquea.

P3:
polish.

Priorizar:

impacto × frecuencia

antes que:

estética.

==================================================
79. DESPUÉS DE LA AUDITORÍA
==================================================

Propón implementación por fases.

FASE 1
Consistencia global:

layout
spacing
page headers
buttons
tables
filters
badges
feedback

FASE 2
Operación crítica:

Dashboard
Pedidos
Agenda
Inventario
Alertas

FASE 3
Catálogo:

Productos
Alta/edición
Import/export
Promociones

FASE 4
Sucursales:

Branch Hub
Equipo
Horarios
Configuración

FASE 5
Responsive + accessibility + performance + polish

==================================================
80. REGLA FINAL
==================================================

NO optimices buscando:

"que se vea más bonito."

Optimiza buscando:

"que el usuario piense menos y opere más rápido."

Cada cambio debe justificar al menos uno:

- menos clics
- menos scroll
- menos carga cognitiva
- mejor jerarquía
- mejor contexto
- menor riesgo de error
- mayor velocidad
- mayor consistencia
- mejor aprovechamiento de pantalla

Si un cambio sólo es decorativo y no mejora la experiencia:

NO priorizarlo.

El resultado final debe sentirse como un sistema administrativo profesional construido específicamente para la operación de Pastelería Mallorca, no como un template genérico.