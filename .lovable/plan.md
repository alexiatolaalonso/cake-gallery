# Aviso de etapa pendiente y verificación de capacidad en el cotizador

## 1. Pizarra: aviso en la tarjeta
- Cada tarjeta mostrará, si corresponde, un aviso visible: "Espera a: Horneado #103 (Pendiente)" o "(En curso)".
- El botón «Iniciar» queda desactivado mientras la etapa anterior no esté hecha, con el aviso justo encima.
- Si la etapa anterior ya está hecha, no aparece aviso y el botón funciona igual que ahora.

## 2. Cotizador: comprobar de verdad si cabe antes de confirmar
- Al elegir fecha y hora de recogida (igual o posterior a la primera fecha posible), el sistema simula la planificación de ese pedido contra la ocupación real de los equipos, sin guardar nada.
- Si cabe: mensaje verde "Hay capacidad: se puede confirmar" y el botón «Confirmar con anticipo» activo.
- Si no cabe: botón desactivado y advertencia con el motivo concreto, por ejemplo:
  - "Decoración no tiene minutos libres el 19 nov (necesita 300, quedan 120)"
  - "El horno ya tiene 8 tandas el 18 nov"
  - "Día marcado Sin capacidad para Armado"
  - "Fuera del horario de recogida (10:00–19:00)"
- Se recalcula automáticamente al cambiar porciones, diseño, fecha u hora.

## Detalles técnicos
- `mis_tareas()` devuelve además `bloqueo_etapa` y `bloqueo_estado` (etapa previa del mismo pedido no hecha). Tablero los muestra.
- Nueva función SQL `verificar_capacidad(...)` SECURITY DEFINER (roles administración/mostrador): ejecuta la lógica de `_planificar` en modo simulación (sin insertar, o dentro de un bloque con rollback por excepción) y devuelve `{ok, motivo}`. Reutiliza los mismos mensajes que `_confirmar`, para que lo que diga el cotizador coincida con la confirmación.
- El cotizador llama a esta función tras `cotizar` cuando hay fecha válida y condiciona el botón al resultado.
