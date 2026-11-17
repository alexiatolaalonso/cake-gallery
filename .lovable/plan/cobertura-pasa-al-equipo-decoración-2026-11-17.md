# Cobertura pasa al Equipo Decoración

Ahora la Cobertura la hace el Equipo Armado. Pasará a hacerla el Equipo Decoración, junto con la decoración y el empaque.

## Qué cambia

- **Pedidos nuevos y cambios de pedido:** la tarea de Cobertura se planifica en el horario y los minutos del Equipo Decoración (de 11:00 en adelante), no en los de Armado.
- **Pedidos que ya existen:** las 8 tareas de Cobertura pendientes que tiene el Equipo Armado se pasan a Decoración. Si Decoración no tiene minutos libres ese día, la tarea se mueve a un día antes que sí tenga lugar, sin pasar de la fecha de entrega. Las que alguien movió a mano conservan su día y hora, y solo cambian de equipo. Las Coberturas ya hechas no se tocan.
- **Pizarra:**
  - La cuenta de Decoración (equipo@obrador.test) verá las tareas de Cobertura, con su ficha, sus pasos, los ingredientes de la cobertura y el botón «Registrar consumo».
  - La cuenta de Armado (armado@obrador.test) solo verá Relleno y armado.
- **Planificación por capacidad:** los minutos de Cobertura cuentan en la fila de Decoración y dejan de contar en la de Armado.
- **Ficha de la tarea:** en «Antes y después» se verá que Armado se la pasa a Decoración al terminar el relleno.

## Lo que hay que tener en cuenta

Decoración tendrá más trabajo cada día. Algunos días podría quedar «Saturado», y algunos pedidos con poca anticipación podrían dejar de admitirse. Si pasa, puedes autorizar horas extra o añadir personas a Decoración. ¿Quieres que suba sus minutos diarios?

## Detalles técnicos

- Migración: en `_planificar`, la tupla `('cobertura','armado',3,1,1,0)` pasa a `('cobertura','decoracion',3,0,1,0)` (Cobertura puede caer el mismo día de la entrega o el anterior, igual que Decoración).
- Paso de los datos: para cada orden con Cobertura pendiente y `editada_manual = false`, volver a ejecutar `_generar_plan` (respeta las etapas ya iniciadas). Las editadas a mano: `UPDATE tareas SET equipo_id = Decoración`.
- Comprobar `mis_tareas` con las dos cuentas de equipo, `ocupacion` y que el cotizador siga dando «✓ Hay capacidad» en un caso normal.
- Actualizar la regla de AGENTS.md sobre qué equipo hace cada etapa.
