# Bloquear porciones fuera del rango de cada pastel

## Rangos
| Pastel | Porciones |
|---|---|
| Cumpleaños de un piso | 10 a 40 (ya está así) |
| XV años de dos pisos | 40 a 120 (ya está así) |
| Temático con figura | 10 a 60 (ya está así) |
| Boda de varios pisos | 60 a **120** (hoy dice 250, se cambia) |

## Qué verá en el Cotizador
- El campo de porciones solo acepta valores dentro del rango del pastel elegido (y de 10 en 10).
- Si escribe un número fuera del rango, aparece en rojo: "El pastel de boda admite de 60 a 120 porciones".
- Al cambiar de tipo de pastel, las porciones se ajustan solas al rango nuevo.
- Los botones "Guardar borrador" y "Confirmar con anticipo" quedan bloqueados mientras el número no sea válido.
- La base de datos también rechaza cualquier pedido fuera de rango, aunque alguien intente saltarse la pantalla (ya lo hace hoy al guardar y confirmar; se añade también al cambiar un pedido existente).

## Detalles técnicos
- Migración: `UPDATE tipos_pastel SET max_porciones = 120` para boda (backfill de datos) y asegurar que `cambiar_orden` llame a `_validar_pedido` con el rango.
- `cotizador.tsx`: `porcionesOk` incluye `min/max` del tipo; `min`/`max` en el input; clamp en `onChange` de tipo.
- Prueba: 130 porciones de boda debe ser rechazada; 120 aceptada.
- Actualizar memoria del catálogo con boda 60–120.
