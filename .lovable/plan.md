# Pedidos urgentes y horas extra, siempre con permiso de Administración

## 1. Pedido urgente (por debajo del plazo normal)
- En el Cotizador y en «Modificar pedido» se podrán elegir fechas anteriores a la primera fecha normal (el horario de recogida 11:15–19:00 se sigue aplicando).
- Aparece el aviso «Pedido urgente: +15 %, necesita autorización de Administración» y se ve el precio con el recargo.
- Mostrador pulsa «Solicitar autorización»: el pedido queda guardado como borrador con la solicitud pendiente y no se puede confirmar hasta que se apruebe.
- Administración puede aprobarlo directamente (o confirmarlo ella misma sin esperar).
- En un cambio de porciones o sabor urgente se mantiene la regla actual: 15 % solo sobre la diferencia.

## 2. Horas extra cuando no hay hueco
- Si la comprobación dice que un equipo no tiene minutos libres, aparece el botón «Solicitar horas extra» junto al motivo. Abre una ventana con el equipo, el día y los minutos que faltan ya rellenados, y un campo de motivo.
- Mostrador envía la solicitud y queda pendiente.
- Administración ve en la barra superior el aviso «Solicitudes pendientes (N)», con una lista para aprobar o rechazar cada una. Al aprobarla se autorizan las horas extra de ese día.
- Cuando todo está aprobado, el pedido se puede confirmar con anticipo (o aplicar el cambio) de forma normal. Si una solicitud se rechaza, se muestra el motivo.
- Si quien abre la ventana es Administración, aprueba en el momento, sin solicitud.

## Detalles técnicos
- Nueva tabla `solicitudes_autorizacion` (tipo `urgencia|horas_extra`, orden_id, equipo_id, fecha, minutos, motivo, estado `pendiente|aprobada|rechazada`, pedida_por, resuelta_por, motivo_rechazo). Con GRANT y RLS: administración/mostrador leen; solo se escribe a través de funciones.
- Funciones SECURITY DEFINER: `solicitar_autorizacion(...)` (mostrador/admin; si es admin se aprueba sola), `resolver_solicitud(id, aprobar, motivo)` (solo admin; si se aprueban horas extra llama a la lógica de `autorizar_horas_extra`).
- `_validar_pedido` / `cambiar_orden` / `_confirmar`: una fecha por debajo del plazo solo se acepta si hay una urgencia aprobada para esa orden; `recargo_urgencia` = 15 % (o 15 % de la diferencia en los cambios).
- `verificar_capacidad` devuelve además `equipo_id`, `fecha` y `minutos_faltantes` para rellenar la ventana.
- Pantallas: cotizador.tsx, ordenes.$id.tsx y un panel de solicitudes en la barra superior (solo Administración).
- Pruebas: urgencia sin aprobar → rechazada; aprobada → +15 %; cambio urgente → 15 % solo de la diferencia.
