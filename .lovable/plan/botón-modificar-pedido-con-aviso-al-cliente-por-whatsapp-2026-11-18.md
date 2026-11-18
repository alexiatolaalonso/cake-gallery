# Botón «Modificar pedido» con aviso al cliente por WhatsApp

## Qué verá
- En la ficha de cada orden, el botón «Cambiar porciones/sabor» pasa a llamarse **«Modificar pedido»**. En una sola ventana se puede cambiar: porciones, sabor, relleno, cobertura y **fecha y hora de entrega**.
- Antes de guardar se muestra un resumen: «Antes → Ahora» de cada dato cambiado, el nuevo total y el recargo (si lo hay).
- La fecha y la hora siguen las mismas reglas que al cotizar: plazo mínimo del pastel, horario de recogida 11:15–19:00, que haya hueco en los equipos y 15 % si faltan menos de 3 días (solo sobre la diferencia, como ya está hoy). Si no se puede, sale el motivo en español y el botón queda bloqueado.
- Al guardar aparece **«Avisar por WhatsApp»**, que abre WhatsApp con el mensaje ya escrito para el teléfono del cliente, por ejemplo:
  «Hola Ana, tu pedido #1071 de Cake Gallery se ha modificado: 30 → 40 porciones; entrega jueves 20 nov 12:00 → viernes 21 nov 13:00. Nuevo total: $3,200 (saldo pendiente $1,600).»
  Tú lo revisas y lo envías. Si el cliente no tiene teléfono, se avisa y se puede copiar el texto.
- Sigue permitido solo hasta que empieza Decoración.

## Detalles técnicos
- Base de datos: nueva versión de `cambiar_orden` con parámetro opcional `p_fecha timestamptz default null`. Si cambia la fecha: `_validar_pedido`/`_validar_entrega` con la nueva fecha, `fecha_entrega` actualizada antes de `_generar_plan`, y el recargo de urgencia se recalcula para la nueva fecha (15 % sobre la diferencia, sin duplicarse). Devuelve también el «antes» para el mensaje.
- Pantalla `ordenes.$id.tsx`: campos fecha/hora (hora con `-06:00`), resumen de cambios, comprobación previa con `verificar_capacidad`, botón con enlace `https://wa.me/<teléfono>?text=...` (teléfono normalizado a dígitos, +52 si no trae prefijo).
- Prueba del armado del mensaje y del teléfono en `src/test`.
