# Arreglar el aviso en inglés al cambiar la orden #1071

## Qué verá
- En la orden #1071 (y en cualquier otra) el botón «Aplicar cambio» vuelve a funcionar y ya no sale «DELETE requires a WHERE clause».
- Si algo falla al guardar el cambio, el aviso sale siempre en español.
- Los avisos de esa ventana quedan en español estándar: «Escribe las porciones (de 10 en 10)», «Elige otro sabor/relleno».

## Pasos
1. Base de datos: en la función de cambio de pedido, limpiar las listas internas con `DELETE ... WHERE true` y pasar los mensajes «Elegí otro» a «Elige otro». La lógica de recargo y rehacer etapas no cambia.
2. Diccionario de avisos: traducir «DELETE requires a WHERE clause» a «Error interno al procesar el cambio. Inténtalo de nuevo.» y añadir prueba.
3. Ficha de la orden: «Escribí las porciones…» → «Escribe las porciones…».
4. Comprobar: probar el cambio en #1071 dentro de una transacción que se deshace (sin tocar el pedido real) y ejecutar las pruebas de avisos.

## Detalles técnicos
- Migración nueva con `CREATE OR REPLACE FUNCTION cambiar_orden` (copia exacta de la actual salvo los dos DELETE y los textos).
- `src/lib/obrador.ts` (TRADUCCIONES), `src/routes/_authenticated/ordenes.$id.tsx`, `src/test/avisos-error.test.ts`.
