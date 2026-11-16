# Obrador · Gestión de obra para pastelería por encargo

Cada pastel es una orden: cotización → anticipo → tareas planificadas hacia atrás → consumo por lote → factura interna.

## Cuentas de prueba (contraseña `Obrador2026!`)
| Rol | Correo |
|---|---|
| Administración | admin@obrador.test |
| Mostrador | mostrador@obrador.test |
| Producción | produccion@obrador.test |
| Equipo (Decoración) | equipo@obrador.test |

El rol se asigna en la base de datos (`handle_new_user` → `user_roles`), nunca desde el cliente. El registro público está desactivado.

## Decisiones de arquitectura
- **Reglas en la BD**: precio, plazo, porciones, planificación, reservas, folios y cancelaciones viven en funciones SQL `SECURITY DEFINER` con chequeo de rol. El frontend solo llama `rpc`.
- **Confirmación atómica e idempotente**: `confirmar_orden` toma un candado de planificación (`pg_advisory_xact_lock`), valida anticipo ≥ 50 %, planifica todas las etapas, verifica insumos (lotes vigentes + compras que llegan antes de la primera tarea − reservas) y emite factura en una sola transacción. Repetir con la misma `clave` devuelve el mismo resultado.
- **Planificación hacia atrás**: desde la entrega, cada etapa (Entrega → Decoración → Cobertura → Relleno → Horneado) se coloca en el último día con minutos libres del equipo; la siguiente etapa termina antes de que empiece la posterior. Días "Sin capacidad" se saltan salvo autorización de horas extra con motivo.
- **Folios sin huecos**: tabla `folios` con `UPDATE … RETURNING` dentro de la transacción; facturas y renglones no se pueden borrar (trigger + sin permiso DELETE). Los cambios agregan un renglón de ajuste.
- **FEFO**: el consumo descuenta primero el lote de caducidad más próxima; los lotes caducados pasan automáticamente a merma (`motivo = caducidad`) y no se usan.
- **RLS en todas las tablas**: Equipo no lee órdenes, insumos, lotes, cobros ni facturas; solo ve sus tareas vía `mis_tareas()` (sin precios ni costos).
- **Costo real** (`rentabilidad()`): consumos a costo de lote + merma de la orden + minutos × `costo_minuto` (1.60).

## Reglas clave
- Porciones: múltiplos de 10 desde 10 (`CHECK` en `ordenes` + validación previa a planificar).
- Plazo mínimo por diseño 4/5/7 días; Escultórico +1 (máx. 7). Si no cumple se ofrece la primera fecha posible.
- Cambio de porciones/sabor: rechazado si empezó Decoración; recargo 15 % a menos de 3 días.
- Cancelación: devuelve 100 % (≥7 días), 50 % (3–6), 0 % (<3) y libera insumos y minutos.
- Entregada con saldo pendiente: solo Administración con motivo.

## SQL
Migraciones en `drizzle/migrations/`: esquema + RLS, funciones, carga inicial (catálogo, recetas, lotes, compras, órdenes sintéticas).
