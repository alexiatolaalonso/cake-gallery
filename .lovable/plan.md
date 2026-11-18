# Pantalla de entrada: mobile first y sin cuentas de prueba

## Qué cambia
- Se quita el recuadro con los correos de prueba y la contraseña.
- En celular: arriba una franja oscura compacta con «CAKE GALLERY» y el lema «Cada pastel, una obra.»; debajo el formulario a todo el ancho, con campos y botón grandes y fáciles de tocar.
- En PC se mantiene el diseño actual en dos mitades (panel oscuro a la izquierda, formulario a la derecha).

## Detalles técnicos
- `src/routes/auth.tsx`: eliminar el arreglo `cuentas` y su bloque; reestructurar con clases base para móvil (`flex flex-col`) y `md:grid md:grid-cols-2`; panel pizarra visible en móvil en versión reducida; inputs `h-12`, botón `h-12`.
- Título de pestaña pasa a «Entrar · Cake Gallery».
- Las cuentas siguen existiendo; solo dejan de mostrarse (siguen en el README).
