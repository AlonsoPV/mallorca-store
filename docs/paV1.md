Plan de optimización del Admin
1. Objetivo de experiencia

La experiencia objetivo debería responder cuatro preguntas en menos de 10 segundos:

¿Qué tengo que atender hoy?
Pedidos pendientes, pedidos próximos, stock crítico y alertas.

¿Qué está pasando en cada sucursal?
Pedidos, ventas, inventario y responsables.

¿Cómo hago una acción frecuente?
Actualizar stock, cambiar estado de pedido, crear producto, activar promoción.

¿Dónde configuro algo poco frecuente?
Horarios, responsables, permisos, reportes y reglas avanzadas.

La regla general sería:

Operación primero. Configuración después.

2. Arquitectura de navegación recomendada

La navegación actual tiene demasiados elementos al mismo nivel y mezcla operación con configuración. La auditoría además detecta duplicidad de “Nuevo Producto”, responsables aislados y falta de Agenda.

Yo dejaría la estructura así:

Sección	Para qué sirve
Inicio	Qué requiere atención hoy
Pedidos	Gestión completa de pedidos
Agenda	Operación por fecha y hora
Productos	Catálogo y alta de productos
Inventario	Stock operativo por sucursal
Promociones	Descuentos y campañas
Sucursales	Operación específica de cada tienda
Alertas	Excepciones que requieren atención
Más / Configuración	Responsables, reportes, usuarios, permisos

Eliminaría “Nuevo Producto” del menú lateral. Debe ser una acción contextual dentro de Productos.

3. Inicio: convertirlo en centro de acción

El Dashboard actual muestra métricas, pero la auditoría concluye que es poco accionable.

La nueva pantalla Inicio debería tener esta jerarquía:

Buenos días. Esto requiere tu atención.

Pedidos hoy
24 pedidos
6 pendientes
3 próximos en 60 min

Inventario
4 productos con stock bajo
1 producto agotado

Alertas
2 requieren atención

Ventas
$28,450 hoy

Después mostrar:

Próximos pedidos
Hora	Pedido	Sucursal	Tipo	Estado
12:00	#1042	Reforma	Pickup	Preparando
12:30	#1043	Lomas	Delivery	Confirmado

Y accesos directos:

Ver agenda · Ver pedidos · Revisar inventario

La métrica debe llevar a una acción. Si hay “4 productos con bajo stock”, hacer clic debe abrir Inventario ya filtrado.

4. Agenda: el nuevo núcleo operativo

Ésta es la ausencia más importante detectada en la auditoría. Actualmente no existe una vista de producción por fecha/hora.

La pantalla debería ser:

Agenda

Sucursal: Reforma ▾
Fecha: Hoy, 14 septiembre ▾

12:00

Pedido #1045 · Pickup
Ana López
2 × Croissant
1 × Panettone

Preparando

12:30

Pedido #1047 · Delivery
Carlos Ruiz
1 × Pastel Chocolate

Confirmado

Las acciones rápidas deberían estar disponibles desde ahí:

Confirmar → Preparando → Listo → Entregado

Sin necesidad de abrir cada pedido si sólo se quiere avanzar de estado.

Esto convierte el Admin en una herramienta útil para cocina, producción y mostrador.

5. Pedidos: pasar de listado a flujo operativo

La auditoría encontró tres problemas importantes: falta filtro Hoy/Mañana, no existe un detalle real de pedido y el frontend permite seleccionar estados que el backend después rechaza.

La pantalla principal debería tener:

Hoy · Mañana · Esta semana

Filtros:
Sucursal · Pickup/Delivery · Estado · Hora

Tabla:

Pedido	Hora	Cliente	Sucursal	Tipo	Total	Estado
#1042	12:00	Ana López	Reforma	Pickup	$850	Preparando

Al abrir un pedido:

Pedido #1042

Recogida
Mallorca Reforma
14 septiembre · 12:00

Cliente
Ana López
55 XXX XXX

Productos
2 × Croissant
1 × Panettone

Pago
Pagado · $850

Historial
11:20 Confirmado
11:35 Preparando

Y un solo CTA principal:

Marcar como listo

No presentar todos los estados posibles; únicamente las transiciones válidas.

6. Productos: simplificar radicalmente

El formulario actual tiene unas 1100 líneas y mezcla demasiadas decisiones en una sola pantalla. La auditoría lo califica 5.3/10 precisamente por carga cognitiva.

La experiencia debería tener dos niveles.

Alta rápida

Información
Nombre
Categoría
Descripción breve

Precio
Precio normal

Dónde se vende
☑ Reforma
Stock: ___

☑ Lomas
Stock: ___

Imagen
Arrastrar imagen

Guardar borrador Publicar

Con eso se debería poder publicar un producto normal en menos de 2 minutos.

Configuración adicional

Dentro del mismo producto:

Promoción
Disponibilidad
Variantes
Contenido
Sucursales
Avanzado

La complejidad sólo aparece cuando el usuario la necesita.

7. Listado de productos: hacerlo realmente multi-sucursal

Actualmente la lista no comunica bien el estado de cada producto por sucursal.

La tabla debería ser:

Producto	Categoría	Precio	Reforma	Lomas	Promo	Estado
Panettone	Panadería	$350	8	4	-20%	Activo
Croissant	Bollería	$65	12	Agotado	—	Activo

Desde aquí permitir edición rápida de:

Precio · Estado · Destacado · Stock

Sin abrir ficha completa.

8. Inventario: conservar lo bueno y hacerlo más operativo

Inventario es actualmente uno de los módulos mejor evaluados, con 7.3/10.

No lo rediseñaría radicalmente. Lo reforzaría.

Mantener:

Lista
y
Matriz

La matriz es especialmente útil:

Producto	Reforma	Lomas
Panettone	8	4
Croissant	12	0
Tarta	3	6

Añadiría:

+ / − stock

Ajustar

Reabastecer

y acceso a:

Ver movimientos

También incorporaría la UI para importación masiva de inventario, que según la auditoría ya existe en API pero no en interfaz.

9. Sucursales: convertir cada una en un mini centro de operación

Ésta es probablemente la pantalla que más necesita intervención. Actualmente el detalle de sucursal muestra prácticamente un dump JSON, a pesar de que el backend ya entrega información rica.

Al entrar a:

Sucursales → Reforma

mostrar:

Mallorca Reforma

Hoy
14 pedidos · $16,450 ventas · 3 stock bajo

Tabs:

Resumen | Pedidos | Agenda | Productos | Inventario | Horarios | Equipo | Configuración

Así cada sucursal se convierte en un contexto operativo completo.

En Equipo debe aparecer el encargado real asociado como usuario, no sólo texto:

María Pérez
Gerente de sucursal
Email
WhatsApp
Preferencias de notificación

10. Promociones: sacarlas de la ficha de producto

Hoy existen, pero están embebidas dentro del producto.

Crear módulo:

Promociones
Promoción	Aplica a	Sucursal	Vigencia	Estado
Panettone -20%	Panettone	Todas	15–20 Sep	Programada

CTA:

Nueva promoción

Flujo:

¿Qué quieres descontar?

Producto / Categoría

Tipo
20%
$50
Precio especial

Dónde
Todas
Reforma
Lomas

Cuándo
Inicio → Fin

Preview:

$350 $280

Así resulta mucho más entendible para el cliente.

11. Alertas: de información a resolución

Hoy las alertas se consultan, pero ofrecen pocas acciones.

Nueva lógica:

Requieren atención

Stock crítico
Panettone · Reforma
2 unidades restantes

Actualizar stock

Agotado
Croissant · Lomas

Reabastecer

Después separar:

Resueltas

La alerta desaparece del área principal cuando la condición deja de existir.

12. Experiencia según rol

Esto es importante para no convertir el Admin nuevamente en una pantalla compleja.

Administrador general ve todo.

Operations Manager ve todas las sucursales, pedidos, agenda e inventario.

Branch Manager entra directamente al contexto de su sucursal.

Ejemplo:

Mallorca Reforma
Hoy tienes 14 pedidos y 3 alertas.

No necesita ver configuración global.

Staff debería entrar principalmente a:

Agenda
Pedidos
Inventario

La auditoría confirma que el backend ya tiene scoping por sucursal y roles, por lo que el trabajo importante es alinear bien la experiencia de interfaz con esos permisos.

13. Roadmap de implementación
Etapa	Objetivo	Resultado
1. Operación diaria	Dashboard, pedidos, Agenda	El equipo puede operar el día
2. Catálogo	Alta rápida, listado productos, inventario	Menos tiempo y errores administrativos
3. Sucursales	Hub operativo de sucursal	Control real multi-sucursal
4. Comercial	Promociones, clientes	Mayor capacidad comercial
5. Refinamiento	Roles, estados, feedback, performance	Producto listo para escalar
Prioridad inmediata

Yo implementaría primero:

Inicio → Agenda → Pedidos → Alta rápida → Sucursal.

Esas cinco intervenciones cambiarían considerablemente la percepción del sistema.

14. Criterios para considerar que cumple expectativas del cliente

No mediría el éxito únicamente por si todas las funciones existen.

El Admin debería superar estas pruebas:

Tarea	Objetivo
Crear producto básico	< 2 min
Actualizar stock	< 15 s
Encontrar pedidos de hoy	< 10 s
Cambiar estado pedido	1–2 clics
Ver stock crítico	< 10 s
Crear promoción	< 1 min
Encontrar operación de una sucursal	1 clic
Entender qué hacer hoy	< 10 s

Y aplicaría una regla final:

Una persona que nunca ha utilizado el sistema debería poder ejecutar el 80% de la operación sin capacitación.

Ese es el cambio que llevaría el Admin actual de aproximadamente 5.8/10 a un producto cercano a 8.5/10: no agregar muchas más funciones, sino reorganizar las existentes alrededor de cómo realmente trabaja Mallorca.