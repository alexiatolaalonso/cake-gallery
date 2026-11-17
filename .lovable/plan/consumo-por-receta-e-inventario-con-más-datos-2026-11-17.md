# Consumo por receta e inventario con más datos

## 1. Registrar consumo con un solo botón (Pizarra)
- En cada tarjeta, en lugar de elegir ingrediente por ingrediente, aparece **"Registrar consumo de la receta"**.
- Muestra la lista de lo que se va a descontar (ingrediente, cantidad prevista según la receta y las porciones del pedido) y al pulsar se descuenta todo junto del inventario, usando primero los lotes que caducan antes.
- Si falta existencia de algún ingrediente, no se descuenta nada y avisa cuál falta.
- Solo se puede registrar una vez por tarea (evita descontar doble).
- La **merma** se sigue registrando por ingrediente, porque es un desperdicio puntual.

## 2. Inventario con datos útiles
Arriba de la pantalla, tarjetas resumen:
- Valor total del inventario ($).
- Lotes que caducan en los próximos 7 días.
- Ingredientes con existencia por debajo de lo reservado (faltantes).
- Consumo y merma del último mes ($).

Además:
- En la tabla, por ingrediente: existencia, reservado, libre y estado (OK / Bajo / Falta) con color.
- Sección "Últimos movimientos": consumos y mermas recientes con fecha, pedido y cantidad.
- Cargar unas cuantas compras "en camino" de prueba más, con los insumos y costos actuales del catálogo (sin tocar nombres ni precios).

## Detalles técnicos
- Nueva función SQL `registrar_consumo_receta(p_tarea)` SECURITY DEFINER con las mismas comprobaciones de rol que `registrar_consumo`; recorre `insumos_tarea(p_tarea)` y llama a `_descontar` (FEFO) por insumo en una sola transacción; rechaza si la tarea ya tiene consumos.
- `tablero.tsx`: reemplazar el selector de insumo de consumo por la lista + botón; mantener formulario de merma.
- `inventario.tsx`: tarjetas resumen y movimientos leyendo `lotes`, `reservas`, `consumos`, `movimientos_merma` (solo roles con acceso a costos).
