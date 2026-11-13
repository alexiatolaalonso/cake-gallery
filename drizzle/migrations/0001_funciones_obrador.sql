CREATE OR REPLACE FUNCTION public._tz() RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT 'America/Mexico_City' $$;

CREATE OR REPLACE FUNCTION public._cargo_entrega(m public.modo_entrega) RETURNS numeric LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE m WHEN 'sucursal' THEN 0 WHEN 'zona' THEN 180 ELSE 450 END::numeric $$;

CREATE OR REPLACE FUNCTION public._precio(p_tipo uuid, p_porciones int, p_sabor uuid, p_relleno uuid, p_cobertura uuid, p_nivel uuid, p_modo public.modo_entrega)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT round(((tp.precio_base + s.recargo + r.recargo + c.recargo + n.recargo) * p_porciones / 10.0) + public._cargo_entrega(p_modo), 2)
  FROM tipos_pastel tp, sabores s, rellenos r, coberturas c, niveles_diseno n
  WHERE tp.id = p_tipo AND s.id = p_sabor AND r.id = p_relleno AND c.id = p_cobertura AND n.id = p_nivel
$$;

CREATE OR REPLACE FUNCTION public._plazo_dias(p_tipo uuid, p_nivel uuid) RETURNS int
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN tp.escultorico THEN least(n.dias_plazo + 1, 7) ELSE n.dias_plazo END
  FROM tipos_pastel tp, niveles_diseno n WHERE tp.id = p_tipo AND n.id = p_nivel
$$;

CREATE OR REPLACE FUNCTION public._primera_fecha(p_tipo uuid, p_nivel uuid) RETURNS timestamptz
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT (((now() AT TIME ZONE public._tz())::date + public._plazo_dias(p_tipo, p_nivel)) + time '12:00') AT TIME ZONE public._tz()
$$;

CREATE OR REPLACE FUNCTION public._validar_pedido(p_tipo uuid, p_porciones int, p_nivel uuid, p_fecha timestamptz)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE tp tipos_pastel; v_plazo int; v_dias int;
BEGIN
  SELECT * INTO tp FROM tipos_pastel WHERE id = p_tipo;
  IF tp IS NULL THEN RAISE EXCEPTION 'Tipo de pastel no existe'; END IF;
  IF p_porciones IS NULL OR p_porciones < 10 OR p_porciones % 10 <> 0 THEN
    RAISE EXCEPTION 'Las porciones van de 10 en 10 (10, 20, 30…). % no es válido', p_porciones;
  END IF;
  IF p_porciones < tp.min_porciones OR p_porciones > tp.max_porciones THEN
    RAISE EXCEPTION '% admite de % a % porciones', tp.nombre, tp.min_porciones, tp.max_porciones;
  END IF;
  v_plazo := _plazo_dias(p_tipo, p_nivel);
  v_dias := (p_fecha AT TIME ZONE _tz())::date - (now() AT TIME ZONE _tz())::date;
  IF v_dias < v_plazo THEN
    RAISE EXCEPTION 'Plazo mínimo de % días. Primera fecha posible: %', v_plazo,
      to_char(_primera_fecha(p_tipo, p_nivel) AT TIME ZONE _tz(), 'DD/MM/YYYY');
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public._minutos_etapa(p_etapa text, p_porciones int, p_nivel uuid, p_modo public.modo_entrega)
RETURNS int LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE p_etapa
    WHEN 'horneado'   THEN 30 + 20 * p_porciones / 10
    WHEN 'relleno'    THEN 10 * p_porciones / 10
    WHEN 'cobertura'  THEN 15 * p_porciones / 10
    WHEN 'decoracion' THEN (SELECT minutos_por_10 FROM niveles_diseno WHERE id = p_nivel) * p_porciones / 10
    WHEN 'entrega'    THEN CASE p_modo WHEN 'sucursal' THEN 15 WHEN 'zona' THEN 60 ELSE 120 END
  END
$$;

CREATE OR REPLACE FUNCTION public._usados(p_equipo uuid, p_dia date, p_excluir uuid)
RETURNS int LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(sum(t.minutos),0)::int FROM tareas t
  WHERE t.equipo_id = p_equipo AND t.dia = p_dia AND t.orden_id IS DISTINCT FROM p_excluir
$$;

CREATE OR REPLACE FUNCTION public._planificar(p_orden uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE o ordenes; e equipos; v_deadline timestamptz; v_dia date; v_mins int; v_cap int; v_extra int;
  v_bloq boolean; v_ini timestamptz; v_fin timestamptz; v_start timestamptz; v_end timestamptz;
  v_hoy date := (now() AT TIME ZONE _tz())::date; v_res jsonb := '[]'; v_ok boolean; cd capacidad_dia;
BEGIN
  SELECT * INTO o FROM ordenes WHERE id = p_orden;
  v_deadline := o.fecha_entrega;
  FOR e IN SELECT * FROM equipos ORDER BY orden_etapa DESC LOOP
    IF EXISTS (SELECT 1 FROM tareas WHERE orden_id = p_orden AND etapa = e.etapa AND estado <> 'pendiente') THEN
      CONTINUE;
    END IF;
    v_mins := _minutos_etapa(e.etapa, o.porciones, o.nivel_id, o.modo_entrega);
    v_dia := (v_deadline AT TIME ZONE _tz())::date;
    v_ok := false;
    WHILE v_dia >= v_hoy LOOP
      SELECT * INTO cd FROM capacidad_dia WHERE equipo_id = e.id AND fecha = v_dia;
      v_extra := coalesce(cd.minutos_extra, 0);
      v_bloq := coalesce(cd.sin_capacidad, false) AND cd.autorizado_por IS NULL;
      v_cap := e.minutos_diarios + v_extra;
      v_start := (v_dia + e.hora_inicio) AT TIME ZONE _tz();
      v_end := ((v_dia + e.hora_fin) AT TIME ZONE _tz()) + make_interval(mins => v_extra);
      v_fin := least(v_deadline, v_end);
      v_ini := v_fin - make_interval(mins => v_mins);
      IF NOT v_bloq AND _usados(e.id, v_dia, p_orden) + v_mins <= v_cap AND v_ini >= v_start AND v_ini >= now() THEN
        v_ok := true; EXIT;
      END IF;
      v_dia := v_dia - 1;
    END LOOP;
    IF NOT v_ok THEN
      RAISE EXCEPTION 'Sin minutos libres para % (% min) antes de la entrega. Mueve la fecha o autoriza horas extra', e.nombre, v_mins;
    END IF;
    v_res := v_res || jsonb_build_object('equipo_id', e.id, 'etapa', e.etapa, 'orden_etapa', e.orden_etapa,
      'dia', v_dia, 'inicio', v_ini, 'fin', v_fin, 'minutos', v_mins);
    v_deadline := v_ini;
  END LOOP;
  RETURN v_res;
END $$;

CREATE OR REPLACE FUNCTION public._necesidad(p_orden uuid)
RETURNS TABLE(insumo_id uuid, cantidad numeric) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT r.insumo_id, round(sum(r.cantidad_por_10 * o.porciones / 10.0), 3)
  FROM ordenes o JOIN recetas r ON
    (r.componente = 'sabor' AND r.componente_id = o.sabor_id) OR
    (r.componente = 'relleno' AND r.componente_id = o.relleno_id) OR
    (r.componente = 'cobertura' AND r.componente_id = o.cobertura_id)
  WHERE o.id = p_orden GROUP BY r.insumo_id
$$;

CREATE OR REPLACE FUNCTION public._disponible_para(p_insumo uuid, p_para timestamptz, p_excluir uuid)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce((SELECT sum(disponible) FROM lotes WHERE insumo_id = p_insumo AND caducidad >= (p_para AT TIME ZONE public._tz())::date),0)
       + coalesce((SELECT sum(cantidad) FROM compras WHERE insumo_id = p_insumo AND estado = 'en_camino'
                   AND fecha_llegada < (p_para AT TIME ZONE public._tz())::date
                   AND (caducidad IS NULL OR caducidad >= (p_para AT TIME ZONE public._tz())::date)),0)
       - coalesce((SELECT sum(cantidad) FROM reservas WHERE insumo_id = p_insumo AND orden_id IS DISTINCT FROM p_excluir),0)
$$;

CREATE OR REPLACE FUNCTION public._generar_plan(p_orden uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_plan jsonb; t jsonb; v_para timestamptz; n record; v_disp numeric; v_nombre text; v_unidad text;
BEGIN
  DELETE FROM tareas WHERE orden_id = p_orden AND estado = 'pendiente';
  DELETE FROM reservas WHERE orden_id = p_orden;
  v_plan := _planificar(p_orden);
  FOR t IN SELECT * FROM jsonb_array_elements(v_plan) LOOP
    INSERT INTO tareas (orden_id, equipo_id, etapa, orden_etapa, dia, inicio, fin, minutos)
    VALUES (p_orden, (t->>'equipo_id')::uuid, t->>'etapa', (t->>'orden_etapa')::int, (t->>'dia')::date,
            (t->>'inicio')::timestamptz, (t->>'fin')::timestamptz, (t->>'minutos')::int);
  END LOOP;
  SELECT coalesce(min(inicio), (SELECT fecha_entrega FROM ordenes WHERE id = p_orden)) INTO v_para
    FROM tareas WHERE orden_id = p_orden AND estado = 'pendiente';
  IF EXISTS (SELECT 1 FROM tareas WHERE orden_id = p_orden AND estado <> 'pendiente') THEN v_para := now(); END IF;
  FOR n IN SELECT * FROM _necesidad(p_orden) LOOP
    v_disp := _disponible_para(n.insumo_id, v_para, p_orden)
              + coalesce((SELECT sum(c.cantidad) FROM consumos c WHERE c.orden_id = p_orden AND c.insumo_id = n.insumo_id),0);
    IF v_disp < n.cantidad THEN
      SELECT nombre, unidad INTO v_nombre, v_unidad FROM insumos WHERE id = n.insumo_id;
      RAISE EXCEPTION 'Falta %: se necesitan % %, hay % % disponibles o por llegar antes de la primera tarea',
        v_nombre, n.cantidad, v_unidad, round(greatest(v_disp,0),3), v_unidad;
    END IF;
    INSERT INTO reservas (orden_id, insumo_id, cantidad, necesaria_para)
    VALUES (p_orden, n.insumo_id,
      greatest(n.cantidad - coalesce((SELECT sum(c.cantidad) FROM consumos c WHERE c.orden_id = p_orden AND c.insumo_id = n.insumo_id),0), 0),
      v_para);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public._nuevo_folio() RETURNS int LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE folios SET ultimo = ultimo + 1 WHERE serie = 'FI' RETURNING ultimo
$$;

CREATE OR REPLACE FUNCTION public._renglones_orden(p_orden uuid)
RETURNS TABLE(concepto text, cantidad numeric, importe numeric) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT tp.nombre || ' · ' || o.porciones || ' porciones · ' || s.nombre || ' / ' || r.nombre || ' / ' || c.nombre || ' · Diseño ' || n.nombre,
         (o.porciones / 10)::numeric,
         round((tp.precio_base + s.recargo + r.recargo + c.recargo + n.recargo) * o.porciones / 10.0, 2)
  FROM ordenes o JOIN tipos_pastel tp ON tp.id = o.tipo_id JOIN sabores s ON s.id = o.sabor_id
  JOIN rellenos r ON r.id = o.relleno_id JOIN coberturas c ON c.id = o.cobertura_id JOIN niveles_diseno n ON n.id = o.nivel_id
  WHERE o.id = p_orden
  UNION ALL
  SELECT 'Entrega: ' || o.modo_entrega::text, 1, public._cargo_entrega(o.modo_entrega) FROM ordenes o WHERE o.id = p_orden AND o.modo_entrega <> 'sucursal'
$$;

CREATE OR REPLACE FUNCTION public._confirmar(p_orden uuid, p_metodo public.metodo_pago, p_monto numeric, p_clave text, p_usuario uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o ordenes; v_precio numeric; v_min numeric; v_num int; v_fac uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('obrador_planificacion'));
  SELECT * INTO o FROM ordenes WHERE id = p_orden FOR UPDATE;
  IF o IS NULL THEN RAISE EXCEPTION 'Orden no encontrada'; END IF;
  IF o.estado <> 'borrador' THEN
    IF p_clave IS NOT NULL AND EXISTS (SELECT 1 FROM cobros WHERE orden_id = p_orden AND clave_idempotencia = p_clave) THEN
      RETURN jsonb_build_object('ok', true, 'repetida', true, 'folio', o.folio);
    END IF;
    RAISE EXCEPTION 'La orden ya no está en borrador (estado: %)', o.estado;
  END IF;
  PERFORM _validar_pedido(o.tipo_id, o.porciones, o.nivel_id, o.fecha_entrega);
  v_precio := _precio(o.tipo_id, o.porciones, o.sabor_id, o.relleno_id, o.cobertura_id, o.nivel_id, o.modo_entrega);
  v_min := round(v_precio * 0.5, 2);
  IF p_monto IS NULL OR p_monto < v_min THEN
    RAISE EXCEPTION 'El anticipo mínimo es el 50%%: $%', v_min;
  END IF;
  IF p_monto > v_precio THEN RAISE EXCEPTION 'El anticipo no puede superar el total ($%)', v_precio; END IF;
  UPDATE ordenes SET precio = v_precio, recargo_urgencia = 0, estado = 'confirmada', actualizado = now() WHERE id = p_orden;
  PERFORM _generar_plan(p_orden);
  INSERT INTO cobros (orden_id, tipo, metodo, monto, clave_idempotencia, creado_por)
  VALUES (p_orden, 'anticipo', p_metodo, p_monto, p_clave, p_usuario);
  v_num := _nuevo_folio();
  INSERT INTO facturas_internas (numero, orden_id, total) VALUES (v_num, p_orden, v_precio) RETURNING id INTO v_fac;
  INSERT INTO factura_renglones (factura_id, concepto, cantidad, importe) SELECT v_fac, * FROM _renglones_orden(p_orden);
  UPDATE cotizaciones SET estado = 'aceptada' WHERE orden_id = p_orden AND estado IN ('borrador','enviada');
  RETURN jsonb_build_object('ok', true, 'folio', o.folio, 'factura', 'FI-' || lpad(v_num::text,4,'0'), 'precio', v_precio);
END $$;

CREATE OR REPLACE FUNCTION public.cotizar(p_tipo uuid, p_porciones int, p_sabor uuid, p_relleno uuid, p_cobertura uuid, p_nivel uuid, p_modo public.modo_entrega, p_fecha timestamptz)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_err text; v_precio numeric;
BEGIN
  IF NOT rol_en('{administracion,mostrador}') THEN RAISE EXCEPTION 'Sin permiso'; END IF;
  v_precio := _precio(p_tipo, coalesce(p_porciones,0), p_sabor, p_relleno, p_cobertura, p_nivel, p_modo);
  BEGIN
    PERFORM _validar_pedido(p_tipo, p_porciones, p_nivel, p_fecha);
  EXCEPTION WHEN others THEN v_err := SQLERRM;
  END;
  RETURN jsonb_build_object('precio', v_precio, 'anticipo', round(v_precio*0.5,2),
    'plazo_dias', _plazo_dias(p_tipo, p_nivel), 'primera_fecha', _primera_fecha(p_tipo, p_nivel), 'error', v_err);
END $$;

CREATE OR REPLACE FUNCTION public.guardar_borrador(p_id uuid, p_cliente uuid, p_tipo uuid, p_porciones int, p_sabor uuid, p_relleno uuid, p_cobertura uuid, p_nivel uuid, p_modo public.modo_entrega, p_fecha timestamptz, p_descripcion text, p_direccion text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid; v_precio numeric;
BEGIN
  IF NOT rol_en('{administracion,mostrador}') THEN RAISE EXCEPTION 'Sin permiso'; END IF;
  PERFORM _validar_pedido(p_tipo, p_porciones, p_nivel, p_fecha);
  v_precio := _precio(p_tipo, p_porciones, p_sabor, p_relleno, p_cobertura, p_nivel, p_modo);
  IF p_id IS NULL THEN
    INSERT INTO ordenes (cliente_id, tipo_id, porciones, sabor_id, relleno_id, cobertura_id, nivel_id, modo_entrega, fecha_entrega, descripcion, direccion, precio, creado_por)
    VALUES (p_cliente, p_tipo, p_porciones, p_sabor, p_relleno, p_cobertura, p_nivel, p_modo, p_fecha, p_descripcion, p_direccion, v_precio, auth.uid())
    RETURNING id INTO v_id;
  ELSE
    UPDATE ordenes SET cliente_id = p_cliente, tipo_id = p_tipo, porciones = p_porciones, sabor_id = p_sabor, relleno_id = p_relleno,
      cobertura_id = p_cobertura, nivel_id = p_nivel, modo_entrega = p_modo, fecha_entrega = p_fecha, descripcion = p_descripcion,
      direccion = p_direccion, precio = v_precio, actualizado = now()
    WHERE id = p_id AND estado = 'borrador' RETURNING id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'Solo se editan borradores desde el cotizador'; END IF;
    UPDATE cotizaciones SET estado = 'reemplazada' WHERE orden_id = v_id AND estado = 'borrador';
  END IF;
  INSERT INTO cotizaciones (orden_id, precio, detalle) VALUES (v_id, v_precio, jsonb_build_object('porciones', p_porciones, 'fecha', p_fecha));
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.confirmar_orden(p_orden uuid, p_metodo public.metodo_pago, p_monto numeric, p_clave text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT rol_en('{administracion,mostrador}') THEN RAISE EXCEPTION 'Sin permiso'; END IF;
  RETURN _confirmar(p_orden, p_metodo, p_monto, p_clave, auth.uid());
END $$;

CREATE OR REPLACE FUNCTION public.cambiar_orden(p_orden uuid, p_porciones int, p_sabor uuid, p_relleno uuid, p_cobertura uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o ordenes; v_base numeric; v_recargo numeric := 0; v_total numeric; f facturas_internas;
BEGIN
  IF NOT rol_en('{administracion,mostrador}') THEN RAISE EXCEPTION 'Sin permiso'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('obrador_planificacion'));
  SELECT * INTO o FROM ordenes WHERE id = p_orden FOR UPDATE;
  IF o.estado NOT IN ('confirmada','en_produccion') THEN RAISE EXCEPTION 'Solo se cambian órdenes confirmadas o en producción'; END IF;
  IF EXISTS (SELECT 1 FROM tareas WHERE orden_id = p_orden AND etapa = 'decoracion' AND estado <> 'pendiente') THEN
    RAISE EXCEPTION 'Ya empezó Decoración: no se admiten cambios';
  END IF;
  IF p_porciones IS NULL OR p_porciones < 10 OR p_porciones % 10 <> 0 THEN
    RAISE EXCEPTION 'Las porciones van de 10 en 10. % no es válido', p_porciones;
  END IF;
  IF p_porciones NOT BETWEEN (SELECT min_porciones FROM tipos_pastel WHERE id = o.tipo_id) AND (SELECT max_porciones FROM tipos_pastel WHERE id = o.tipo_id) THEN
    RAISE EXCEPTION 'Porciones fuera del rango del tipo de pastel';
  END IF;
  v_base := _precio(o.tipo_id, p_porciones, p_sabor, p_relleno, p_cobertura, o.nivel_id, o.modo_entrega);
  IF o.fecha_entrega - now() < interval '3 days' THEN v_recargo := round(v_base * 0.15, 2); END IF;
  v_total := v_base + v_recargo;
  UPDATE ordenes SET porciones = p_porciones, sabor_id = p_sabor, relleno_id = p_relleno, cobertura_id = p_cobertura,
    precio = v_total, recargo_urgencia = v_recargo, actualizado = now() WHERE id = p_orden;
  PERFORM _generar_plan(p_orden);
  SELECT * INTO f FROM facturas_internas WHERE orden_id = p_orden AND estado <> 'cancelada' ORDER BY numero DESC LIMIT 1;
  IF f.id IS NOT NULL AND f.total <> v_total THEN
    INSERT INTO factura_renglones (factura_id, concepto, cantidad, importe)
    VALUES (f.id, 'Ajuste por cambio: ' || p_porciones || ' porciones' || CASE WHEN v_recargo > 0 THEN ' (incluye recargo 15% por cambio a menos de 3 días)' ELSE '' END, 1, v_total - f.total);
    UPDATE facturas_internas SET total = v_total, estado = 'emitida', pagada = NULL WHERE id = f.id;
  END IF;
  RETURN jsonb_build_object('ok', true, 'precio', v_total, 'recargo', v_recargo);
END $$;

CREATE OR REPLACE FUNCTION public.cancelar_orden(p_orden uuid, p_motivo text, p_metodo public.metodo_pago)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o ordenes; v_dias numeric; v_pct int; v_pagado numeric; v_dev numeric;
BEGIN
  IF NOT rol_en('{administracion,mostrador}') THEN RAISE EXCEPTION 'Sin permiso'; END IF;
  IF coalesce(trim(p_motivo),'') = '' THEN RAISE EXCEPTION 'Indica el motivo de cancelación'; END IF;
  SELECT * INTO o FROM ordenes WHERE id = p_orden FOR UPDATE;
  IF o.estado IN ('cancelada','entregada') THEN RAISE EXCEPTION 'La orden ya está %', o.estado; END IF;
  v_dias := extract(epoch FROM (o.fecha_entrega - now())) / 86400.0;
  v_pct := CASE WHEN v_dias >= 7 THEN 100 WHEN v_dias >= 3 THEN 50 ELSE 0 END;
  SELECT coalesce(sum(monto),0) INTO v_pagado FROM cobros WHERE orden_id = p_orden;
  v_dev := round(v_pagado * v_pct / 100.0, 2);
  IF v_dev > 0 THEN
    INSERT INTO cobros (orden_id, tipo, metodo, monto, creado_por) VALUES (p_orden, 'reembolso', p_metodo, -v_dev, auth.uid());
  END IF;
  DELETE FROM tareas WHERE orden_id = p_orden AND estado = 'pendiente';
  DELETE FROM reservas WHERE orden_id = p_orden;
  UPDATE facturas_internas SET estado = 'cancelada', motivo_cancelacion = 'Orden cancelada: ' || p_motivo WHERE orden_id = p_orden AND estado <> 'cancelada';
  UPDATE ordenes SET estado = 'cancelada', actualizado = now() WHERE id = p_orden;
  RETURN jsonb_build_object('ok', true, 'porcentaje', v_pct, 'devolucion', v_dev);
END $$;

CREATE OR REPLACE FUNCTION public.registrar_cobro(p_orden uuid, p_metodo public.metodo_pago, p_monto numeric, p_clave text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o ordenes; v_pagado numeric; v_saldo numeric;
BEGIN
  IF NOT rol_en('{administracion,mostrador}') THEN RAISE EXCEPTION 'Sin permiso'; END IF;
  SELECT * INTO o FROM ordenes WHERE id = p_orden FOR UPDATE;
  IF p_clave IS NOT NULL AND EXISTS (SELECT 1 FROM cobros WHERE orden_id = p_orden AND clave_idempotencia = p_clave) THEN
    RETURN jsonb_build_object('ok', true, 'repetido', true);
  END IF;
  IF o.estado IN ('borrador','cancelada') THEN RAISE EXCEPTION 'No se cobra una orden en %', o.estado; END IF;
  SELECT coalesce(sum(monto),0) INTO v_pagado FROM cobros WHERE orden_id = p_orden;
  v_saldo := o.precio - v_pagado;
  IF p_monto <= 0 OR p_monto > v_saldo THEN RAISE EXCEPTION 'Monto inválido: el saldo es $%', v_saldo; END IF;
  INSERT INTO cobros (orden_id, tipo, metodo, monto, clave_idempotencia, creado_por) VALUES (p_orden, 'saldo', p_metodo, p_monto, p_clave, auth.uid());
  IF p_monto = v_saldo THEN
    UPDATE facturas_internas SET estado = 'pagada', pagada = now() WHERE orden_id = p_orden AND estado = 'emitida';
  END IF;
  RETURN jsonb_build_object('ok', true, 'saldo', v_saldo - p_monto);
END $$;

CREATE OR REPLACE FUNCTION public.marcar_entregada(p_orden uuid, p_motivo_autorizacion text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o ordenes; v_saldo numeric;
BEGIN
  IF NOT rol_en('{administracion,mostrador}') THEN RAISE EXCEPTION 'Sin permiso'; END IF;
  SELECT * INTO o FROM ordenes WHERE id = p_orden FOR UPDATE;
  IF o.estado IN ('borrador','cancelada','entregada') THEN RAISE EXCEPTION 'No se puede entregar una orden en %', o.estado; END IF;
  SELECT o.precio - coalesce(sum(monto),0) INTO v_saldo FROM cobros WHERE orden_id = p_orden;
  IF v_saldo > 0.005 THEN
    IF coalesce(trim(p_motivo_autorizacion),'') = '' OR NOT has_role(auth.uid(),'administracion') THEN
      RAISE EXCEPTION 'Saldo pendiente de $%. Solo Administración puede autorizar la entrega con motivo', v_saldo;
    END IF;
  END IF;
  UPDATE ordenes SET estado = 'entregada', entrega_autorizada_motivo = nullif(trim(p_motivo_autorizacion),''), actualizado = now() WHERE id = p_orden;
  UPDATE tareas SET estado = 'hecha', finalizada_en = coalesce(finalizada_en, now()) WHERE orden_id = p_orden AND etapa = 'entrega';
  RETURN jsonb_build_object('ok', true, 'saldo', v_saldo);
END $$;

CREATE OR REPLACE FUNCTION public.marcar_factura_pagada(p_factura uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT rol_en('{administracion,mostrador}') THEN RAISE EXCEPTION 'Sin permiso'; END IF;
  UPDATE facturas_internas SET estado = 'pagada', pagada = now() WHERE id = p_factura AND estado = 'emitida';
  IF NOT FOUND THEN RAISE EXCEPTION 'Solo se marcan pagadas facturas emitidas'; END IF;
END $$;

CREATE OR REPLACE FUNCTION public.cancelar_factura(p_factura uuid, p_motivo text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT rol_en('{administracion,mostrador}') THEN RAISE EXCEPTION 'Sin permiso'; END IF;
  IF coalesce(trim(p_motivo),'') = '' THEN RAISE EXCEPTION 'Indica el motivo'; END IF;
  UPDATE facturas_internas SET estado = 'cancelada', motivo_cancelacion = p_motivo WHERE id = p_factura AND estado <> 'cancelada';
  IF NOT FOUND THEN RAISE EXCEPTION 'La factura ya está cancelada'; END IF;
END $$;

CREATE OR REPLACE FUNCTION public._caducar_lotes()
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE l lotes; n int := 0;
BEGIN
  FOR l IN SELECT * FROM lotes WHERE caducidad < (now() AT TIME ZONE _tz())::date AND disponible > 0 FOR UPDATE LOOP
    INSERT INTO movimientos_merma (insumo_id, lote_id, cantidad, costo, motivo)
    VALUES (l.insumo_id, l.id, l.disponible, round(l.disponible * l.costo, 2), 'caducidad');
    UPDATE lotes SET disponible = 0 WHERE id = l.id;
    n := n + 1;
  END LOOP;
  RETURN n;
END $$;

CREATE OR REPLACE FUNCTION public._descontar(p_insumo uuid, p_cantidad numeric)
RETURNS TABLE(lote_id uuid, cantidad numeric, costo numeric) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE l lotes; v_rest numeric := p_cantidad; v_toma numeric;
BEGIN
  PERFORM _caducar_lotes();
  IF (SELECT coalesce(sum(disponible),0) FROM lotes WHERE insumo_id = p_insumo AND caducidad >= (now() AT TIME ZONE _tz())::date) < p_cantidad THEN
    RAISE EXCEPTION 'No hay suficiente % en lotes vigentes', (SELECT nombre FROM insumos WHERE id = p_insumo);
  END IF;
  FOR l IN SELECT * FROM lotes WHERE insumo_id = p_insumo AND disponible > 0 AND caducidad >= (now() AT TIME ZONE _tz())::date
           ORDER BY caducidad, recibido FOR UPDATE LOOP
    EXIT WHEN v_rest <= 0;
    v_toma := least(v_rest, l.disponible);
    UPDATE lotes SET disponible = disponible - v_toma WHERE id = l.id;
    lote_id := l.id; cantidad := v_toma; costo := round(v_toma * l.costo, 2);
    RETURN NEXT;
    v_rest := v_rest - v_toma;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public._puede_tarea(p_tarea uuid) RETURNS tareas
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE t tareas;
BEGIN
  SELECT * INTO t FROM tareas WHERE id = p_tarea;
  IF t IS NULL THEN RAISE EXCEPTION 'Tarea no encontrada'; END IF;
  IF rol_en('{administracion,produccion}') THEN RETURN t; END IF;
  IF has_role(auth.uid(),'equipo') AND t.equipo_id = mi_equipo() THEN RETURN t; END IF;
  RAISE EXCEPTION 'Sin permiso sobre esta tarea';
END $$;

CREATE OR REPLACE FUNCTION public.registrar_consumo(p_tarea uuid, p_insumo uuid, p_cantidad numeric)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE t tareas; d record; v_lotes int := 0;
BEGIN
  t := _puede_tarea(p_tarea);
  IF p_cantidad IS NULL OR p_cantidad <= 0 THEN RAISE EXCEPTION 'Cantidad inválida'; END IF;
  FOR d IN SELECT * FROM _descontar(p_insumo, p_cantidad) LOOP
    INSERT INTO consumos (tarea_id, orden_id, lote_id, insumo_id, cantidad, costo, creado_por)
    VALUES (t.id, t.orden_id, d.lote_id, p_insumo, d.cantidad, d.costo, auth.uid());
    v_lotes := v_lotes + 1;
  END LOOP;
  UPDATE reservas SET cantidad = greatest(cantidad - p_cantidad, 0) WHERE orden_id = t.orden_id AND insumo_id = p_insumo;
  RETURN jsonb_build_object('ok', true, 'lotes', v_lotes);
END $$;

CREATE OR REPLACE FUNCTION public.registrar_merma(p_tarea uuid, p_insumo uuid, p_cantidad numeric, p_motivo text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE t tareas; d record;
BEGIN
  t := _puede_tarea(p_tarea);
  IF p_cantidad IS NULL OR p_cantidad <= 0 THEN RAISE EXCEPTION 'Cantidad inválida'; END IF;
  IF coalesce(trim(p_motivo),'') = '' THEN RAISE EXCEPTION 'Indica el motivo de la merma'; END IF;
  FOR d IN SELECT * FROM _descontar(p_insumo, p_cantidad) LOOP
    INSERT INTO movimientos_merma (insumo_id, lote_id, orden_id, tarea_id, cantidad, costo, motivo, creado_por)
    VALUES (p_insumo, d.lote_id, t.orden_id, t.id, d.cantidad, d.costo, p_motivo, auth.uid());
  END LOOP;
  RETURN jsonb_build_object('ok', true);
END $$;

CREATE OR REPLACE FUNCTION public.caducar_lotes() RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT rol_en('{administracion,produccion}') THEN RAISE EXCEPTION 'Sin permiso'; END IF;
  RETURN _caducar_lotes();
END $$;

CREATE OR REPLACE FUNCTION public.recibir_compra(p_compra uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c compras;
BEGIN
  IF NOT rol_en('{administracion,produccion}') THEN RAISE EXCEPTION 'Sin permiso'; END IF;
  SELECT * INTO c FROM compras WHERE id = p_compra AND estado = 'en_camino' FOR UPDATE;
  IF c IS NULL THEN RAISE EXCEPTION 'Compra no está en camino'; END IF;
  INSERT INTO lotes (insumo_id, codigo, cantidad, disponible, costo, caducidad)
  VALUES (c.insumo_id, 'C-' || left(c.id::text, 6), c.cantidad, c.cantidad, c.costo, coalesce(c.caducidad, current_date + 30));
  UPDATE compras SET estado = 'recibida' WHERE id = p_compra;
END $$;

CREATE OR REPLACE FUNCTION public.mis_tareas(p_desde date, p_hasta date)
RETURNS TABLE(id uuid, orden_id uuid, folio int, etapa text, equipo text, dia date, inicio timestamptz, fin timestamptz, minutos int,
  estado text, atrasada boolean, editada_manual boolean, porciones int, tipo text, sabor text, relleno text, cobertura text,
  diseno text, descripcion text, fecha_entrega timestamptz, cliente text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT t.id, t.orden_id, o.folio, t.etapa, e.nombre, t.dia, t.inicio, t.fin, t.minutos,
    t.estado::text, (t.estado <> 'hecha' AND t.fin < now()), t.editada_manual, o.porciones, tp.nombre, s.nombre, r.nombre, c.nombre,
    n.nombre, o.descripcion, o.fecha_entrega, cl.nombre
  FROM tareas t JOIN ordenes o ON o.id = t.orden_id JOIN equipos e ON e.id = t.equipo_id
  JOIN tipos_pastel tp ON tp.id = o.tipo_id JOIN sabores s ON s.id = o.sabor_id JOIN rellenos r ON r.id = o.relleno_id
  JOIN coberturas c ON c.id = o.cobertura_id JOIN niveles_diseno n ON n.id = o.nivel_id JOIN clientes cl ON cl.id = o.cliente_id
  WHERE t.dia BETWEEN p_desde AND p_hasta AND o.estado NOT IN ('cancelada')
    AND (public.rol_en('{administracion,produccion}') OR (public.has_role(auth.uid(),'equipo') AND t.equipo_id = public.mi_equipo()))
  ORDER BY t.inicio
$$;

CREATE OR REPLACE FUNCTION public.insumos_tarea(p_tarea uuid)
RETURNS TABLE(insumo_id uuid, nombre text, unidad text, previsto numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE t tareas;
BEGIN
  t := _puede_tarea(p_tarea);
  RETURN QUERY SELECT n.insumo_id, i.nombre, i.unidad, n.cantidad FROM _necesidad(t.orden_id) n JOIN insumos i ON i.id = n.insumo_id ORDER BY i.nombre;
END $$;

CREATE OR REPLACE FUNCTION public.iniciar_tarea(p_tarea uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE t tareas;
BEGIN
  t := _puede_tarea(p_tarea);
  IF t.estado <> 'pendiente' THEN RAISE EXCEPTION 'La tarea ya está %', t.estado; END IF;
  IF EXISTS (SELECT 1 FROM tareas WHERE orden_id = t.orden_id AND orden_etapa < t.orden_etapa AND estado <> 'hecha') THEN
    RAISE EXCEPTION 'Falta terminar la etapa anterior';
  END IF;
  UPDATE tareas SET estado = 'en_curso', iniciada_en = now() WHERE id = p_tarea;
  UPDATE ordenes SET estado = 'en_produccion' WHERE id = t.orden_id AND estado = 'confirmada';
END $$;

CREATE OR REPLACE FUNCTION public.finalizar_tarea(p_tarea uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE t tareas;
BEGIN
  t := _puede_tarea(p_tarea);
  IF t.estado <> 'en_curso' THEN RAISE EXCEPTION 'Primero inicia la tarea'; END IF;
  UPDATE tareas SET estado = 'hecha', finalizada_en = now() WHERE id = p_tarea;
  IF NOT EXISTS (SELECT 1 FROM tareas WHERE orden_id = t.orden_id AND etapa <> 'entrega' AND estado <> 'hecha') THEN
    UPDATE ordenes SET estado = 'lista' WHERE id = t.orden_id AND estado IN ('confirmada','en_produccion');
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.mover_tarea(p_tarea uuid, p_inicio timestamptz)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE t tareas; v_fin timestamptz; v_dia date; e equipos; cd capacidad_dia;
BEGIN
  IF NOT rol_en('{administracion,produccion}') THEN RAISE EXCEPTION 'Sin permiso'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('obrador_planificacion'));
  SELECT * INTO t FROM tareas WHERE id = p_tarea FOR UPDATE;
  IF t.estado <> 'pendiente' THEN RAISE EXCEPTION 'Solo se mueven tareas pendientes'; END IF;
  v_fin := p_inicio + make_interval(mins => t.minutos);
  v_dia := (p_inicio AT TIME ZONE _tz())::date;
  IF EXISTS (SELECT 1 FROM tareas WHERE orden_id = t.orden_id AND orden_etapa > t.orden_etapa AND inicio < v_fin) THEN
    RAISE EXCEPTION 'Terminaría después del inicio de la etapa siguiente';
  END IF;
  IF EXISTS (SELECT 1 FROM tareas WHERE orden_id = t.orden_id AND orden_etapa < t.orden_etapa AND fin > p_inicio) THEN
    RAISE EXCEPTION 'Empezaría antes de que termine la etapa anterior';
  END IF;
  SELECT * INTO e FROM equipos WHERE id = t.equipo_id;
  SELECT * INTO cd FROM capacidad_dia WHERE equipo_id = e.id AND fecha = v_dia;
  IF coalesce(cd.sin_capacidad,false) AND cd.autorizado_por IS NULL THEN RAISE EXCEPTION 'Día marcado Sin capacidad'; END IF;
  IF (SELECT coalesce(sum(minutos),0) FROM tareas WHERE equipo_id = e.id AND dia = v_dia AND id <> t.id) + t.minutos > e.minutos_diarios + coalesce(cd.minutos_extra,0) THEN
    RAISE EXCEPTION 'El equipo no tiene minutos libres ese día';
  END IF;
  UPDATE tareas SET inicio = p_inicio, fin = v_fin, dia = v_dia, editada_manual = true WHERE id = p_tarea;
END $$;

CREATE OR REPLACE FUNCTION public.marcar_sin_capacidad(p_fecha date, p_equipo uuid, p_sin boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT rol_en('{administracion,produccion}') THEN RAISE EXCEPTION 'Sin permiso'; END IF;
  INSERT INTO capacidad_dia (fecha, equipo_id, sin_capacidad) VALUES (p_fecha, p_equipo, p_sin)
  ON CONFLICT (fecha, equipo_id) DO UPDATE SET sin_capacidad = p_sin,
    autorizado_por = CASE WHEN p_sin THEN NULL ELSE capacidad_dia.autorizado_por END;
END $$;

CREATE OR REPLACE FUNCTION public.autorizar_horas_extra(p_fecha date, p_equipo uuid, p_minutos int, p_motivo text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT rol_en('{administracion,produccion}') THEN RAISE EXCEPTION 'Sin permiso'; END IF;
  IF coalesce(trim(p_motivo),'') = '' THEN RAISE EXCEPTION 'Las horas extra requieren motivo'; END IF;
  IF p_minutos < 0 OR p_minutos > 480 THEN RAISE EXCEPTION 'Minutos extra entre 0 y 480'; END IF;
  INSERT INTO capacidad_dia (fecha, equipo_id, minutos_extra, motivo, autorizado_por) VALUES (p_fecha, p_equipo, p_minutos, p_motivo, auth.uid())
  ON CONFLICT (fecha, equipo_id) DO UPDATE SET minutos_extra = p_minutos, motivo = p_motivo, autorizado_por = auth.uid();
END $$;

CREATE OR REPLACE FUNCTION public.ocupacion(p_desde date, p_hasta date)
RETURNS TABLE(fecha date, equipo_id uuid, equipo text, etapa text, usados int, capacidad int, sin_capacidad boolean, autorizado boolean, motivo text, estado text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT d::date, e.id, e.nombre, e.etapa, public._usados(e.id, d::date, NULL),
    e.minutos_diarios + coalesce(cd.minutos_extra,0), coalesce(cd.sin_capacidad,false), cd.autorizado_por IS NOT NULL, cd.motivo,
    CASE WHEN coalesce(cd.sin_capacidad,false) AND cd.autorizado_por IS NULL THEN 'sin_capacidad'
         WHEN public._usados(e.id, d::date, NULL) >= e.minutos_diarios + coalesce(cd.minutos_extra,0) THEN 'saturado'
         WHEN public._usados(e.id, d::date, NULL) >= 0.7 * (e.minutos_diarios + coalesce(cd.minutos_extra,0)) THEN 'justo'
         ELSE 'con_lugar' END
  FROM generate_series(p_desde, p_hasta, interval '1 day') d CROSS JOIN equipos e
  LEFT JOIN capacidad_dia cd ON cd.equipo_id = e.id AND cd.fecha = d::date
  WHERE public.rol_en('{administracion,produccion,mostrador}')
  ORDER BY d, e.orden_etapa
$$;

CREATE OR REPLACE FUNCTION public.rentabilidad()
RETURNS TABLE(orden_id uuid, folio int, cliente text, estado text, precio numeric, costo_insumos numeric, costo_merma numeric, costo_minutos numeric, costo_total numeric, margen numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH b AS (
    SELECT o.id, o.folio, cl.nombre cliente, o.estado::text estado, o.precio,
      coalesce((SELECT sum(costo) FROM consumos c WHERE c.orden_id = o.id),0) ci,
      coalesce((SELECT sum(costo) FROM movimientos_merma m WHERE m.orden_id = o.id),0) cm,
      coalesce((SELECT sum(round(e.costo_minuto * CASE WHEN t.finalizada_en IS NOT NULL AND t.iniciada_en IS NOT NULL
             THEN greatest(extract(epoch FROM t.finalizada_en - t.iniciada_en)/60, 1) ELSE t.minutos END, 2))
        FROM tareas t JOIN equipos e ON e.id = t.equipo_id WHERE t.orden_id = o.id),0) cmin
    FROM ordenes o JOIN clientes cl ON cl.id = o.cliente_id
    WHERE o.estado <> 'borrador' AND public.has_role(auth.uid(),'administracion')
  )
  SELECT id, folio, cliente, estado, precio, ci, cm, round(cmin,2), round(ci+cm+cmin,2), round(precio-(ci+cm+cmin),2) FROM b ORDER BY folio DESC
$$;

DO $$ DECLARE f record; BEGIN
  FOR f IN SELECT p.oid::regprocedure AS sig, p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname = 'public' AND p.proname LIKE '\_%' LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', f.sig);
  END LOOP;
  FOR f IN SELECT p.oid::regprocedure AS sig FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname = 'public' LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon', f.sig);
  END LOOP;
END $$;
