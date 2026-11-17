# Pizarra de Producción: solo Horneado

## Qué cambia
Cuando entra una cuenta de **Producción** en la Pizarra:
- Solo ve la etapa de **Horneado** de cada pedido (tarjeta, botones Iniciar/Finalizar, consumo, merma y ficha actúan sobre el horneado).
- Columna según el horneado:
  - Pendiente: horneado sin empezar.
  - En curso: horneado iniciado.
  - Hecha: horneado terminado y el Relleno todavía no empezó.
  - Atrasada: horneado pasó su hora sin terminar.
- En cuanto el equipo de Armado **inicia el Relleno**, el pedido **desaparece** de su lista.
- No se muestran los botones Cobertura/Decoración/Empaque.
- Administración, Armado y Decoración siguen igual.

## Detalles técnicos
- Solo `tablero.tsx`: si `sesion.rol === "produccion"`, filtrar `mias` a `etapa === "horneado"` y aplicar la misma lógica de columna que el rol equipo (oculto si el horneado está hecho y la etapa siguiente ya no está pendiente).
- Sin cambios en la base de datos.
