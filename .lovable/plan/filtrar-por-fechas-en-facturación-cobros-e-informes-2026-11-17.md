# Filtrar por fechas en Facturación, Cobros e Informes

Arriba de cada una de estas tres páginas aparece la misma barra de fechas:

- Campos **Desde** y **Hasta**.
- Botones rápidos: **Hoy · Últimos 7 días · Este mes · Mes pasado · Todo**.
- Al abrir la página se muestra **Este mes**.
- Funciona bien en celular: los campos van uno debajo del otro.

## Qué filtra en cada página

**Facturación**
- Muestra solo las facturas **emitidas** entre esas fechas.
- Arriba, un resumen del tramo: número de facturas y total emitido, pagado y cancelado.

**Cobros**
- Las casillas de Efectivo, Transferencia, Tarjeta y **Total cobrado** suman solo los cobros de ese tramo.
- La lista de cobros también se filtra.
- Los **saldos pendientes** se siguen mostrando todos (es dinero por cobrar, sin importar la fecha).

**Informes**
- Ventas por sabor y por diseño, y rentabilidad: pedidos con **fecha de entrega** dentro del tramo.
- Mermas: las registradas en ese tramo.
- Ocupación de equipos: los días de ese tramo, hasta un máximo de 31 días.
- El botón de descarga CSV baja solo lo filtrado.

## Detalles técnicos
- Componente compartido `RangoFechas` en `src/components/` que devuelve `{desde, hasta}` en formato YYYY-MM-DD con la zona horaria del obrador (TZ), y que entra en la queryKey de cada página.
- Las consultas usan `.gte/.lte` sobre `emitida` (facturas), `creado` (cobros y mermas) y `fecha_entrega` (pedidos), con los límites construidos en `-06:00`. La rentabilidad se cruza con `fecha_entrega` de los pedidos. Para `ocupacion` se pasan las fechas recortadas a 31 días.
- No hace falta cambiar la base de datos.
