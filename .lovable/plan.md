# Recuperar pedidos de prueba con el catálogo actual

Se vuelven a cargar los mismos 10 pedidos de prueba de antes (mismos clientes y descripciones), pero usando **solo** tus tipos, sabores, rellenos, coberturas, niveles y precios actuales. No se toca el catálogo, ni los insumos, ni los clientes.

## Pedidos que se cargan
| Cliente | Pastel | Porciones | Estado |
|---|---|---|---|
| Mariana López | Cumpleaños, Chocolate, Cajeta, Betún, Sencillo | 20 | Confirmada (anticipo 50%) |
| Eventos Jacaranda | XV años, Vainilla, Frutos rojos, Betún, Decorado, Zona 1 | 60 | Confirmada (pagada 100%) |
| Rodrigo Pérez | Cumpleaños, Red velvet, Crema pastelera, Betún, Decorado | 30 | Confirmada |
| Colegio Nuevo Sol | XV años, Vainilla, Cajeta, Betún, Sencillo, Zona 2 | 100 | Confirmada (anticipo 60%) |
| Boda Torres-Gil | Boda, Limón, Frutos rojos, Fondant, Detallado, Montaje | 100 | Confirmada |
| Andrea Ruiz | Temático, Chocolate, Ganache, Fondant, Escultórico | 30 | Confirmada |
| Café La Esquina | Cumpleaños, Zanahoria con nuez, Queso crema, Ganache firme, Sencillo, Zona 1 | 40 | Confirmada |
| Lucía Hernández | Cumpleaños, Limón, Frutos rojos, Betún, Sencillo | 20 | Borrador (cotización) |
| Rodrigo Pérez | Cumpleaños, Chocolate, Ganache, Ganache firme, Decorado | 30 | Entregada hace 20 días |
| Café La Esquina | Cumpleaños, Vainilla, Cajeta, Betún, Sencillo | 40 | Entregada hace 12 días |

## Qué se rellena solo
- **Precios:** calculados con tus precios actuales (nada inventado).
- **Planificación:** tareas de Horno, Armado y Decoración generadas por el planificador con tus reglas; las fechas se eligen dentro del plazo y la capacidad (si alguna no cabe, se mueve al primer día con lugar).
- **Inventario:** se reservan los insumos de cada pedido confirmado.
- **Cobros y facturación:** anticipos de los confirmados con su factura; los dos entregados con anticipo + saldo, factura pagada, consumos y una merma de ejemplo para Informes.

## Detalles técnicos
- Un bloque de datos (run_sql) con la misma lógica de la carga original: `_precio` + `_confirmar` para confirmados, inserción directa para los dos entregados; fechas relativas a hoy respetando el plazo mínimo de cada pedido.
- Verificar después: conteos en órdenes, tareas, cobros y facturas, y revisar en pantalla Órdenes, Planificación, Facturación y Cobros.
