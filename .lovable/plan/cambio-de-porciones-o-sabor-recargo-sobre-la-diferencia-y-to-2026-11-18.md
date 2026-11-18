# Cambio de porciones o sabor: recargo sobre la diferencia y todos los gastos internos

## Cómo queda la regla
- **Se permite cambiar** porciones, sabor, relleno o cobertura mientras **Decoración no haya empezado**, aunque ya se haya horneado o rellenado. Se quita el bloqueo actual de «ya tiene consumos».
- **Recalcula:** tareas, reservas de ingredientes y factura (como ahora).
- **Precio al cliente:**
  - Con 3 días o más hasta la entrega: precio nuevo, sin recargo.
  - Con menos de 3 días: precio nuevo + **15 % solo sobre la diferencia** (si sube). Ejemplo: $1,400 → $1,800 a 2 días = $400 × 15 % = $60 → total $1,860 (hoy cobraría $2,070).
  - Si el cambio baja el precio, no hay recargo.
  - Si ya había un recargo de urgencia en el pedido, se conserva.
- **Internamente, todos los gastos:** si el cambio obliga a rehacer una etapa ya hecha (p. ej. cambia el sabor después del horneado, o el relleno después del armado):
  - Lo ya consumido se queda registrado como merma con motivo «Cambio de pedido #folio» (cuenta como gasto en informes; no se devuelve al inventario).
  - Esa etapa vuelve a planificarse como tarea nueva y reserva otra vez sus ingredientes.
  - Las horas de equipo ya trabajadas también quedan como costo del pedido.
  - El cliente **no** paga esos gastos: solo la diferencia de precio + el 15 % si toca.
- Si solo cambia algo que aún no se hizo (p. ej. cobertura antes de empezar), no hay merma.

## Pantalla
- El aviso del diálogo «Cambiar porciones o sabor» explica: «Recargo 15 % sobre la diferencia si faltan menos de 3 días. Lo ya hecho que haya que rehacer se registra como gasto interno».
- Al aplicar: «Nuevo total $X (recargo $Y)» y, si hubo, «Se rehace: Horneado».

## Detalles técnicos
- Migración: reescribir `cambiar_orden`:
  - Quitar el bloqueo por consumos/mermas.
  - `v_recargo_cambio := greatest(v_base_nuevo - v_base_anterior, 0) * 0.15` si faltan < 3 días; `recargo_urgencia` = recargo previo + recargo del cambio.
  - Detectar etapas hechas/en curso afectadas (sabor→horneado; relleno o porciones→relleno; cobertura o porciones→cobertura; porciones→horneado). Para cada una: insertar `movimientos_merma` con lo consumido (motivo «Cambio de pedido»), marcar la tarea vieja como sustituida y dejar que `_generar_plan` cree la nueva pendiente.
  - Renglón de factura: «Ajuste por cambio» con la diferencia y otro con el «Recargo 15 % sobre diferencia».
- `ordenes.$id.tsx`: texto del aviso y mensaje de éxito.
- Test: 1,400→1,800 a 2 días = 1,860; a 5 días = 1,800; 1,800→1,400 a 2 días = 1,400.
