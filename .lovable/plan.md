# Cuenta y fichas para el Equipo Armado

Ahora solo existe una cuenta de equipo (equipo@obrador.test), ligada a Decoración. El Equipo Armado ya tiene 18 tareas de relleno, armado y cobertura, pero nadie entra a verlas.

## 1. Cuenta del Equipo Armado
- Nueva cuenta **armado@obrador.test**, con rol Equipo, ligada al Equipo Armado y con la misma contraseña que las otras cuentas de prueba.
- Al entrar solo ve la Pizarra con las tareas de Armado (relleno y armado, cobertura). No ve costos ni cobros.

## 2. Ficha de cada tarea (en la Pizarra)
Botón **«Ver ficha»** en cada tarjeta. Abre:
- **Datos del pedido:** folio, cliente, porciones, pisos, sabor, relleno, cobertura, diseño, descripción y hora de entrega.
- **Ingredientes de la etapa:** cantidades de la receta para esas porciones (lo mismo que se descuenta al registrar el consumo).
- **Proceso paso a paso** según la etapa:
  - *Relleno y armado:* nivelar y cortar las capas, almibarar, rellenar, apilar, poner soportes si tiene varios pisos, refrigerar.
  - *Cobertura:* capa de migas, refrigerar, cobertura final, alisar y revisar.
- **Antes y después:** de qué etapa viene (por ejemplo, Horneado hecho) y a quién se pasa (Decoración).
- Los mismos botones Iniciar, Finalizar y Registrar consumo.

La ficha también sirve para los equipos de Horno y Decoración, con sus propios pasos.

## Nota
Los pasos de cada proceso son una propuesta genérica de pastelería: no venían en tu catálogo. Dime si quieres cambiarlos.

## Detalles técnicos
- Crear el usuario con el cliente admin del servidor, en un script de un solo uso; poner `usuarios.equipo_id` = Equipo Armado y comprobar que `mis_tareas` filtre por `mi_equipo()`.
- Pasos del proceso por etapa en `src/lib/obrador.ts` (`pasosEtapa`). Ficha en un diálogo dentro de `tablero.tsx`, que reutiliza `insumos_tarea`.
