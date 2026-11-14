
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_rol app_role; v_equipo uuid;
BEGIN
  v_rol := CASE lower(NEW.email)
    WHEN 'admin@obrador.test' THEN 'administracion'
    WHEN 'mostrador@obrador.test' THEN 'mostrador'
    WHEN 'produccion@obrador.test' THEN 'produccion'
    ELSE 'equipo' END;
  IF lower(NEW.email) = 'equipo@obrador.test' THEN SELECT id INTO v_equipo FROM equipos WHERE etapa = 'decoracion'; END IF;
  INSERT INTO usuarios (user_id, nombre, correo, equipo_id)
  VALUES (NEW.id, coalesce(NEW.raw_user_meta_data->>'nombre', split_part(NEW.email,'@',1)), NEW.email, v_equipo);
  INSERT INTO user_roles (user_id, role) VALUES (NEW.id, v_rol);
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

INSERT INTO public.equipos (nombre, etapa, orden_etapa, personas, minutos_diarios, hora_inicio, hora_fin) VALUES
 ('Horneado','horneado',1,2,900,'06:00','14:00'),
 ('Relleno','relleno',2,1,420,'08:00','16:00'),
 ('Cobertura','cobertura',3,2,840,'08:00','16:00'),
 ('Decoración','decoracion',4,2,840,'09:00','17:00'),
 ('Entrega','entrega',5,1,480,'09:00','19:00');

INSERT INTO public.tipos_pastel (nombre, precio_base, min_porciones, max_porciones, pisos, escultorico) VALUES
 ('Redondo',320,10,60,1,false),
 ('Plancha',290,20,120,1,false),
 ('De pisos',380,40,150,3,false),
 ('Escultórico',520,20,80,1,true);
INSERT INTO public.sabores (nombre, recargo) VALUES ('Vainilla',0),('Chocolate',40),('Red velvet',60),('Zanahoria',50),('Limón',30);
INSERT INTO public.rellenos (nombre, recargo) VALUES ('Crema pastelera',0),('Cajeta',30),('Frutos rojos',60),('Ganache de chocolate',50);
INSERT INTO public.coberturas (nombre, recargo) VALUES ('Betún de mantequilla',0),('Chantilly',20),('Fondant',90),('Ganache espejo',70);
INSERT INTO public.niveles_diseno (nombre, recargo, minutos_por_10, dias_plazo) VALUES
 ('Sencillo',0,10,4),('Intermedio',120,25,5),('Elaborado',280,40,7);

INSERT INTO public.insumos (nombre, unidad, costo) VALUES
 ('Harina','kg',18),('Azúcar','kg',22),('Huevo','pza',3),('Mantequilla','kg',140),('Leche','L',24),
 ('Cacao','kg',180),('Vainilla','ml',1.2),('Queso crema','kg',160),('Zanahoria','kg',20),('Limón','pza',2),
 ('Cajeta','kg',90),('Frutos rojos','kg',210),('Chocolate semiamargo','kg',230),('Crema para batir','L',85),
 ('Fondant','kg',120),('Azúcar glass','kg',30),('Colorante rojo','ml',0.8);

WITH r(comp, nombre, insumo, cant) AS (VALUES
 ('sabor','Vainilla','Harina',0.525),('sabor','Vainilla','Azúcar',0.42),('sabor','Vainilla','Huevo',6.3),('sabor','Vainilla','Mantequilla',0.21),('sabor','Vainilla','Leche',0.21),('sabor','Vainilla','Vainilla',10.5),
 ('sabor','Chocolate','Harina',0.42),('sabor','Chocolate','Azúcar',0.42),('sabor','Chocolate','Huevo',6.3),('sabor','Chocolate','Mantequilla',0.21),('sabor','Chocolate','Cacao',0.105),('sabor','Chocolate','Leche',0.21),
 ('sabor','Red velvet','Harina',0.525),('sabor','Red velvet','Azúcar',0.42),('sabor','Red velvet','Huevo',6.3),('sabor','Red velvet','Mantequilla',0.21),('sabor','Red velvet','Cacao',0.021),('sabor','Red velvet','Colorante rojo',10.5),
 ('sabor','Zanahoria','Harina',0.42),('sabor','Zanahoria','Azúcar',0.315),('sabor','Zanahoria','Huevo',5.25),('sabor','Zanahoria','Zanahoria',0.525),('sabor','Zanahoria','Mantequilla',0.105),
 ('sabor','Limón','Harina',0.525),('sabor','Limón','Azúcar',0.42),('sabor','Limón','Huevo',6.3),('sabor','Limón','Mantequilla',0.21),('sabor','Limón','Limón',4.2),
 ('relleno','Crema pastelera','Leche',0.525),('relleno','Crema pastelera','Huevo',3.15),('relleno','Crema pastelera','Azúcar',0.105),('relleno','Crema pastelera','Vainilla',5.25),
 ('relleno','Cajeta','Cajeta',0.42),
 ('relleno','Frutos rojos','Frutos rojos',0.315),('relleno','Frutos rojos','Azúcar',0.105),('relleno','Frutos rojos','Crema para batir',0.21),
 ('relleno','Ganache de chocolate','Chocolate semiamargo',0.21),('relleno','Ganache de chocolate','Crema para batir',0.21),
 ('cobertura','Betún de mantequilla','Mantequilla',0.315),('cobertura','Betún de mantequilla','Azúcar glass',0.42),
 ('cobertura','Chantilly','Crema para batir',0.525),('cobertura','Chantilly','Azúcar glass',0.105),
 ('cobertura','Fondant','Fondant',0.63),('cobertura','Fondant','Mantequilla',0.105),('cobertura','Fondant','Azúcar glass',0.21),
 ('cobertura','Ganache espejo','Chocolate semiamargo',0.263),('cobertura','Ganache espejo','Crema para batir',0.21),('cobertura','Ganache espejo','Azúcar',0.105)
)
INSERT INTO public.recetas (componente, componente_id, insumo_id, cantidad_por_10)
SELECT r.comp::public.tipo_componente,
  CASE r.comp WHEN 'sabor' THEN (SELECT id FROM public.sabores WHERE nombre = r.nombre)
              WHEN 'relleno' THEN (SELECT id FROM public.rellenos WHERE nombre = r.nombre)
              ELSE (SELECT id FROM public.coberturas WHERE nombre = r.nombre) END,
  (SELECT id FROM public.insumos WHERE nombre = r.insumo), r.cant
FROM r;

INSERT INTO public.lotes (insumo_id, codigo, cantidad, disponible, costo, caducidad, recibido)
SELECT i.id, 'L' || to_char(now(),'MMDD') || '-A-' || row_number() OVER (), q.cant * 0.4, q.cant * 0.4, i.costo * 0.97, current_date + 6, now() - interval '10 days'
FROM public.insumos i JOIN (VALUES ('kg',80.0),('pza',1000.0),('L',40.0),('ml',2000.0)) q(unidad, cant) ON q.unidad = i.unidad;
INSERT INTO public.lotes (insumo_id, codigo, cantidad, disponible, costo, caducidad, recibido)
SELECT i.id, 'L' || to_char(now(),'MMDD') || '-B-' || row_number() OVER (), q.cant * 0.6, q.cant * 0.6, i.costo, current_date + 45, now() - interval '2 days'
FROM public.insumos i JOIN (VALUES ('kg',80.0),('pza',1000.0),('L',40.0),('ml',2000.0)) q(unidad, cant) ON q.unidad = i.unidad;
INSERT INTO public.lotes (insumo_id, codigo, cantidad, disponible, costo, caducidad, recibido)
SELECT id, 'L-VENCIDO-01', 4, 4, costo, current_date - 2, now() - interval '20 days' FROM public.insumos WHERE nombre = 'Crema para batir';

INSERT INTO public.compras (insumo_id, cantidad, costo, fecha_llegada, caducidad)
SELECT id, 15, costo, current_date + 3, current_date + 60 FROM public.insumos WHERE nombre IN ('Fondant','Chocolate semiamargo');
INSERT INTO public.compras (insumo_id, cantidad, costo, fecha_llegada, caducidad)
SELECT id, 10, costo * 1.05, current_date + 5, current_date + 20 FROM public.insumos WHERE nombre IN ('Frutos rojos','Crema para batir');

INSERT INTO public.clientes (nombre, correo, telefono, tipo) VALUES
 ('Mariana López','mariana.lopez@ejemplo.mx','5512345678','particular'),
 ('Eventos Jacaranda','contacto@jacaranda.mx','5587654321','empresa'),
 ('Rodrigo Pérez','rodrigo.p@ejemplo.mx','5511122233','frecuente'),
 ('Colegio Nuevo Sol','admin@nuevosol.edu.mx','5544455566','empresa'),
 ('Lucía Hernández','lucia.h@ejemplo.mx','5599988877','particular'),
 ('Café La Esquina','pedidos@laesquina.mx','5533344455','frecuente'),
 ('Andrea Ruiz','andrea.ruiz@ejemplo.mx','5566677788','particular'),
 ('Boda Torres-Gil','torresgil@ejemplo.mx','5522233344','particular');

DO $$
DECLARE v_id uuid; r record;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('Mariana López','Redondo',20,'Chocolate','Cajeta','Betún de mantequilla','Sencillo','sucursal',6,'Letras "Feliz cumple Sofi" en rosa', 'efectivo', 0.5),
    ('Eventos Jacaranda','Plancha',60,'Vainilla','Frutos rojos','Chantilly','Intermedio','zona',8,'Logotipo de la empresa en papel de arroz','transferencia', 1.0),
    ('Rodrigo Pérez','Redondo',30,'Red velvet','Crema pastelera','Betún de mantequilla','Intermedio','sucursal',7,'Flores de betún tono vino','tarjeta', 0.5),
    ('Colegio Nuevo Sol','Plancha',100,'Vainilla','Cajeta','Betún de mantequilla','Sencillo','zona',9,'Escudo del colegio','transferencia', 0.6),
    ('Boda Torres-Gil','De pisos',100,'Limón','Frutos rojos','Fondant','Elaborado','montaje',12,'Tres pisos, flores de azúcar blancas, listón dorado','transferencia', 0.5),
    ('Andrea Ruiz','Escultórico',30,'Chocolate','Ganache de chocolate','Fondant','Intermedio','sucursal',10,'Forma de consola de videojuegos','tarjeta', 0.5),
    ('Café La Esquina','Redondo',40,'Zanahoria','Crema pastelera','Chantilly','Sencillo','zona',5,'Sin decoración, para vitrina','efectivo', 0.5)
  ) AS x(cliente, tipo, porciones, sabor, relleno, cobertura, nivel, modo, dias, descr, metodo, pct)
  LOOP
    INSERT INTO public.ordenes (cliente_id, tipo_id, porciones, sabor_id, relleno_id, cobertura_id, nivel_id, modo_entrega, fecha_entrega, descripcion, direccion)
    VALUES ((SELECT id FROM public.clientes WHERE nombre = r.cliente), (SELECT id FROM public.tipos_pastel WHERE nombre = r.tipo), r.porciones,
      (SELECT id FROM public.sabores WHERE nombre = r.sabor), (SELECT id FROM public.rellenos WHERE nombre = r.relleno),
      (SELECT id FROM public.coberturas WHERE nombre = r.cobertura), (SELECT id FROM public.niveles_diseno WHERE nombre = r.nivel),
      r.modo::public.modo_entrega, ((current_date + r.dias) + time '16:00') AT TIME ZONE 'America/Mexico_City', r.descr,
      CASE WHEN r.modo <> 'sucursal' THEN 'Col. Roma Norte, CDMX' END)
    RETURNING id INTO v_id;
    UPDATE public.ordenes SET precio = public._precio(tipo_id, porciones, sabor_id, relleno_id, cobertura_id, nivel_id, modo_entrega) WHERE id = v_id;
    INSERT INTO public.cotizaciones (orden_id, precio, estado) SELECT id, precio, 'enviada' FROM public.ordenes WHERE id = v_id;
    PERFORM public._confirmar(v_id, r.metodo::public.metodo_pago, (SELECT round(precio * r.pct, 2) FROM public.ordenes WHERE id = v_id), 'seed-' || v_id, NULL);
  END LOOP;

  INSERT INTO public.ordenes (cliente_id, tipo_id, porciones, sabor_id, relleno_id, cobertura_id, nivel_id, modo_entrega, fecha_entrega, descripcion)
  SELECT (SELECT id FROM public.clientes WHERE nombre = 'Lucía Hernández'), (SELECT id FROM public.tipos_pastel WHERE nombre = 'Redondo'), 20,
    (SELECT id FROM public.sabores WHERE nombre = 'Limón'), (SELECT id FROM public.rellenos WHERE nombre = 'Frutos rojos'),
    (SELECT id FROM public.coberturas WHERE nombre = 'Chantilly'), (SELECT id FROM public.niveles_diseno WHERE nombre = 'Sencillo'),
    'sucursal', ((current_date + 14) + time '12:00') AT TIME ZONE 'America/Mexico_City', 'Baby shower, tonos pastel'
  RETURNING id INTO v_id;
  UPDATE public.ordenes SET precio = public._precio(tipo_id, porciones, sabor_id, relleno_id, cobertura_id, nivel_id, modo_entrega) WHERE id = v_id;
  INSERT INTO public.cotizaciones (orden_id, precio) SELECT id, precio FROM public.ordenes WHERE id = v_id;
END $$;

DO $$
DECLARE v_id uuid; v_fac uuid; v_n int; e record; r record; v_dt timestamptz;
BEGIN
  FOR r IN SELECT * FROM (VALUES ('Rodrigo Pérez','Redondo',30,'Chocolate','Ganache de chocolate','Ganache espejo','Intermedio',20),
                                 ('Café La Esquina','Plancha',50,'Vainilla','Cajeta','Betún de mantequilla','Sencillo',12)) x(cliente,tipo,porciones,sabor,relleno,cobertura,nivel,hace)
  LOOP
    v_dt := ((current_date - r.hace) + time '16:00') AT TIME ZONE 'America/Mexico_City';
    INSERT INTO public.ordenes (cliente_id, tipo_id, porciones, sabor_id, relleno_id, cobertura_id, nivel_id, modo_entrega, fecha_entrega, estado, creado)
    VALUES ((SELECT id FROM public.clientes WHERE nombre = r.cliente), (SELECT id FROM public.tipos_pastel WHERE nombre = r.tipo), r.porciones,
      (SELECT id FROM public.sabores WHERE nombre = r.sabor), (SELECT id FROM public.rellenos WHERE nombre = r.relleno),
      (SELECT id FROM public.coberturas WHERE nombre = r.cobertura), (SELECT id FROM public.niveles_diseno WHERE nombre = r.nivel),
      'sucursal', v_dt, 'entregada', v_dt - interval '8 days') RETURNING id INTO v_id;
    UPDATE public.ordenes SET precio = public._precio(tipo_id, porciones, sabor_id, relleno_id, cobertura_id, nivel_id, modo_entrega) WHERE id = v_id;
    FOR e IN SELECT * FROM public.equipos ORDER BY orden_etapa LOOP
      INSERT INTO public.tareas (orden_id, equipo_id, etapa, orden_etapa, dia, inicio, fin, minutos, estado, iniciada_en, finalizada_en)
      SELECT v_id, e.id, e.etapa, e.orden_etapa, (v_dt - make_interval(days => 6 - e.orden_etapa))::date,
        v_dt - make_interval(days => 6 - e.orden_etapa, hours => 4), v_dt - make_interval(days => 6 - e.orden_etapa, hours => 2),
        public._minutos_etapa(e.etapa, r.porciones, o.nivel_id, 'sucursal'), 'hecha',
        v_dt - make_interval(days => 6 - e.orden_etapa, hours => 4), v_dt - make_interval(days => 6 - e.orden_etapa, hours => 2)
      FROM public.ordenes o WHERE o.id = v_id;
    END LOOP;
    INSERT INTO public.consumos (tarea_id, orden_id, lote_id, insumo_id, cantidad, costo, creado)
    SELECT (SELECT id FROM public.tareas WHERE orden_id = v_id AND etapa = 'horneado'), v_id,
      (SELECT id FROM public.lotes l WHERE l.insumo_id = n.insumo_id ORDER BY caducidad DESC LIMIT 1), n.insumo_id, n.cantidad,
      round(n.cantidad * (SELECT costo FROM public.insumos WHERE id = n.insumo_id), 2), v_dt - interval '5 days'
    FROM public._necesidad(v_id) n;
    INSERT INTO public.movimientos_merma (insumo_id, orden_id, cantidad, costo, motivo, creado)
    SELECT id, v_id, 0.3, round(0.3 * costo, 2), CASE WHEN r.hace = 20 THEN 'quemado en horno' ELSE 'caída al desmoldar' END, v_dt - interval '4 days'
    FROM public.insumos WHERE nombre = 'Harina';
    INSERT INTO public.cobros (orden_id, tipo, metodo, monto, creado) SELECT v_id, 'anticipo', 'transferencia', round(precio*0.5,2), v_dt - interval '8 days' FROM public.ordenes WHERE id = v_id;
    INSERT INTO public.cobros (orden_id, tipo, metodo, monto, creado) SELECT v_id, 'saldo', 'efectivo', precio - round(precio*0.5,2), v_dt FROM public.ordenes WHERE id = v_id;
    v_n := public._nuevo_folio();
    INSERT INTO public.facturas_internas (numero, orden_id, total, estado, emitida, pagada) SELECT v_n, v_id, precio, 'pagada', v_dt - interval '8 days', v_dt FROM public.ordenes WHERE id = v_id RETURNING id INTO v_fac;
    INSERT INTO public.factura_renglones (factura_id, concepto, cantidad, importe) SELECT v_fac, * FROM public._renglones_orden(v_id);
  END LOOP;
END $$;

INSERT INTO public.movimientos_merma (insumo_id, cantidad, costo, motivo, creado)
SELECT id, 1.5, round(1.5*costo,2), 'derrame', now() - interval '6 days' FROM public.insumos WHERE nombre = 'Leche';
