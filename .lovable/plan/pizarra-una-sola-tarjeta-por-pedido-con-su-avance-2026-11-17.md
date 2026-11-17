# Pizarra: una sola tarjeta por pedido, con su avance

## Qué pasa ahora
El pedido #1064 tiene 5 etapas. En la base: Horneado **hecho**, Relleno y armado **hecho**, Cobertura **pendiente**, Decoración y Empaque **pendientes**. La Pizarra muestra una tarjeta por etapa, por eso #1064 sale dos veces (Relleno en «Hecha» y Cobertura en «Pendiente») y parece que el pedido está terminado.

## Cambio
- **Una tarjeta por pedido** en la Pizarra (no una por etapa).
- **Arriba de la tarjeta, la línea de avance** del pedido:
  `✓ Horneado · ✓ Relleno y armado · ○ Cobertura · ○ Decoración · ○ Empaque`
  y un aviso claro de lo que falta (ej. «Falta: Cobertura»).
- **Columna según el avance del pedido:**
  - Pendiente: ninguna etapa empezada.
  - En curso: alguna etapa hecha o en curso, pero no todas → #1064 va aquí.
  - Hecha: todas las etapas terminadas.
  - Atrasada: alguna etapa pasó su hora sin terminar.
- Los botones Iniciar / Finalizar / Registrar consumo / merma y «Ver ficha» actúan sobre **la siguiente etapa del pedido que le toca a ese equipo** (para Armado en #1064: Cobertura). La ficha muestra esa etapa.
- Cada equipo sigue viendo solo los pedidos donde tiene alguna etapa.

## Nota
En #1064 la siguiente etapa real es **Cobertura** (todavía pendiente), y después Decoración. Si para ti la cobertura forma parte de la decoración, dímelo y la tratamos como una sola.

## Detalles técnicos
- Agrupar en el cliente las filas de `mis_tareas` por `orden_id`; para la línea de avance de etapas de otros equipos, ampliar `mis_tareas` (o nueva función SECURITY DEFINER `avance_pedidos`) que devuelva etapa+estado de todas las tareas de los pedidos visibles, sin costos.
- Etapa activa = primera tarea del equipo no hecha, ordenada por `orden_etapa`. Solo cambia `tablero.tsx` y una función SQL de lectura.
