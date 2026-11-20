CREATE TABLE public.solicitudes_autorizacion (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo text NOT NULL CHECK (tipo IN ('urgencia','horas_extra')),
  orden_id uuid REFERENCES public.ordenes(id),
  equipo_id uuid REFERENCES public.equipos(id),
  fecha date,
  minutos integer,
  motivo text NOT NULL,
  estado text NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','aprobada','rechazada')),
  pedida_por uuid,
  resuelta_por uuid,
  motivo_rechazo text,
  creado timestamptz NOT NULL DEFAULT now(),
  resuelta timestamptz
);
GRANT SELECT ON public.solicitudes_autorizacion TO authenticated;
GRANT ALL ON public.solicitudes_autorizacion TO service_role;
ALTER TABLE public.solicitudes_autorizacion ENABLE ROW LEVEL SECURITY;
CREATE POLICY solicitudes_leer ON public.solicitudes_autorizacion FOR SELECT TO authenticated
  USING (public.rol_en('{administracion,mostrador}'));

CREATE OR REPLACE FUNCTION public._validar_pedido(p_tipo uuid, p_porciones integer, p_nivel uuid, p_fecha timestamptz, p_urgente boolean)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
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
  IF p_fecha <= now() THEN RAISE EXCEPTION 'La fecha de entrega ya pasó'; END IF;
  v_plazo := _plazo_porciones(p_nivel, p_porciones);
  v_dias := (p_fecha AT TIME ZONE _tz())::date - (now() AT TIME ZONE _tz())::date;
  IF v_dias < v_plazo AND NOT coalesce(p_urgente, false) THEN
    RAISE EXCEPTION 'Plazo mínimo de % días. Primera fecha posible: %. Para antes hace falta autorización de urgencia de Administración (+15 %%)', v_plazo,
      to_char(_primera_fecha_porciones(p_nivel, p_porciones) AT TIME ZONE _tz(), 'DD/MM/YYYY');
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public._validar_pedido(p_tipo uuid, p_porciones integer, p_nivel uuid, p_fecha timestamptz)
RETURNS void LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT public._validar_pedido(p_tipo, p_porciones, p_nivel, p_fecha, false);
$$;

CREATE OR REPLACE FUNCTION public._es_urgente(p_porciones integer, p_nivel uuid, p_fecha timestamptz)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT (p_fecha AT TIME ZONE _tz())::date - (now() AT TIME ZONE _tz())::date < _plazo_porciones(p_nivel, p_porciones);
$$;

CREATE OR REPLACE FUNCTION public._urgencia_ok(p_orden uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (SELECT 1 FROM solicitudes_autorizacion WHERE orden_id = p_orden AND tipo = 'urgencia' AND estado = 'aprobada');
$$;

CREATE OR REPLACE FUNCTION public._aplicar_solicitud(s solicitudes_autorizacion)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF s.tipo = 'horas_extra' THEN
    INSERT INTO capacidad_dia (fecha, equipo_id, minutos_extra, motivo, autorizado_por)
    VALUES (s.fecha, s.equipo_id, s.minutos, s.motivo, auth.uid())
    ON CONFLICT (fecha, equipo_id) DO UPDATE SET minutos_extra = least(capacidad_dia.minutos_extra + s.minutos, 480),
      motivo = s.motivo, autorizado_por = auth.uid();
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.solicitar_autorizacion(p_tipo text, p_orden uuid, p_equipo uuid, p_fecha date, p_minutos integer, p_motivo text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE s solicitudes_autorizacion; v_admin boolean := rol_en('{administracion}');
BEGIN
  IF NOT rol_en('{administracion,mostrador}') THEN RAISE EXCEPTION 'Sin permiso'; END IF;
  IF coalesce(trim(p_motivo),'') = '' THEN RAISE EXCEPTION 'Escribe el motivo de la solicitud'; END IF;
  IF p_tipo = 'urgencia' AND p_orden IS NULL THEN RAISE EXCEPTION 'Guarda el pedido antes de pedir la urgencia'; END IF;
  IF p_tipo = 'horas_extra' AND (p_equipo IS NULL OR p_fecha IS NULL OR coalesce(p_minutos,0) <= 0 OR p_minutos > 480) THEN
    RAISE EXCEPTION 'Indica equipo, día y minutos extra (entre 1 y 480)';
  END IF;
  SELECT * INTO s FROM solicitudes_autorizacion WHERE estado = 'pendiente' AND tipo = p_tipo
    AND orden_id IS NOT DISTINCT FROM p_orden AND equipo_id IS NOT DISTINCT FROM p_equipo AND fecha IS NOT DISTINCT FROM p_fecha;
  IF s.id IS NOT NULL AND NOT v_admin THEN
    RETURN jsonb_build_object('id', s.id, 'estado', s.estado, 'repetida', true);
  END IF;
  INSERT INTO solicitudes_autorizacion (tipo, orden_id, equipo_id, fecha, minutos, motivo, pedida_por, estado, resuelta_por, resuelta)
  VALUES (p_tipo, p_orden, p_equipo, p_fecha, p_minutos, p_motivo, auth.uid(),
    CASE WHEN v_admin THEN 'aprobada' ELSE 'pendiente' END,
    CASE WHEN v_admin THEN auth.uid() END, CASE WHEN v_admin THEN now() END)
  RETURNING * INTO s;
  IF v_admin THEN PERFORM _aplicar_solicitud(s); END IF;
  RETURN jsonb_build_object('id', s.id, 'estado', s.estado);
END $$;

CREATE OR REPLACE FUNCTION public.resolver_solicitud(p_id uuid, p_aprobar boolean, p_motivo text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE s solicitudes_autorizacion;
BEGIN
  IF NOT rol_en('{administracion}') THEN RAISE EXCEPTION 'Solo Administración puede aprobar o rechazar solicitudes'; END IF;
  SELECT * INTO s FROM solicitudes_autorizacion WHERE id = p_id FOR UPDATE;
  IF s.id IS NULL THEN RAISE EXCEPTION 'Solicitud no encontrada'; END IF;
  IF s.estado <> 'pendiente' THEN RAISE EXCEPTION 'Esta solicitud ya fue resuelta'; END IF;
  IF NOT p_aprobar AND coalesce(trim(p_motivo),'') = '' THEN RAISE EXCEPTION 'Escribe el motivo del rechazo'; END IF;
  UPDATE solicitudes_autorizacion SET estado = CASE WHEN p_aprobar THEN 'aprobada' ELSE 'rechazada' END,
    motivo_rechazo = CASE WHEN p_aprobar THEN NULL ELSE p_motivo END, resuelta_por = auth.uid(), resuelta = now()
  WHERE id = p_id RETURNING * INTO s;
  IF p_aprobar THEN PERFORM _aplicar_solicitud(s); END IF;
END $$;

-- Borrador: se puede guardar por debajo del plazo (queda como urgente pendiente de permiso)
DO $do$ BEGIN
  EXECUTE replace(pg_get_functiondef('public.guardar_borrador(uuid,uuid,uuid,integer,uuid,uuid,uuid,uuid,modo_entrega,timestamptz,text,text)'::regprocedure),
    'PERFORM _validar_pedido(p_tipo, p_porciones, p_nivel, p_fecha);', 'PERFORM _validar_pedido(p_tipo, p_porciones, p_nivel, p_fecha, true);');
  EXECUTE replace(pg_get_functiondef('public.cambiar_orden(uuid,integer,uuid,uuid,uuid,timestamptz)'::regprocedure),
    'PERFORM _validar_pedido(o.tipo_id, p_porciones, o.nivel_id, v_fecha);', 'PERFORM _validar_pedido(o.tipo_id, p_porciones, o.nivel_id, v_fecha, _urgencia_ok(p_orden));');
END $do$;

CREATE OR REPLACE FUNCTION public.cotizar(p_tipo uuid, p_porciones integer, p_sabor uuid, p_relleno uuid, p_cobertura uuid, p_nivel uuid, p_modo modo_entrega, p_fecha timestamptz)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_err text; v_precio numeric; v_urg boolean := false;
BEGIN
  IF NOT rol_en('{administracion,mostrador}') THEN RAISE EXCEPTION 'Sin permiso'; END IF;
  v_precio := _precio(p_tipo, coalesce(p_porciones,0), p_sabor, p_relleno, p_cobertura, p_nivel, p_modo);
  BEGIN
    PERFORM _validar_pedido(p_tipo, p_porciones, p_nivel, p_fecha, true);
    PERFORM _validar_entrega(p_tipo, p_modo, p_fecha);
    v_urg := p_fecha IS NOT NULL AND _es_urgente(p_porciones, p_nivel, p_fecha);
  EXCEPTION WHEN others THEN v_err := SQLERRM;
  END;
  RETURN jsonb_build_object('precio', v_precio, 'anticipo', round(v_precio*0.5,2),
    'urgente', v_urg, 'recargo', CASE WHEN v_urg THEN round(v_precio*0.15,2) ELSE 0 END,
    'total', CASE WHEN v_urg THEN round(v_precio*1.15,2) ELSE v_precio END,
    'anticipo_total', round(CASE WHEN v_urg THEN v_precio*1.15 ELSE v_precio END * 0.5, 2),
    'plazo_dias', _plazo_porciones(p_nivel, p_porciones), 'primera_fecha', _primera_fecha_porciones(p_nivel, p_porciones), 'error', v_err);
END $$;

CREATE OR REPLACE FUNCTION public.verificar_capacidad(p_tipo uuid, p_porciones integer, p_sabor uuid, p_relleno uuid, p_cobertura uuid, p_nivel uuid, p_modo modo_entrega, p_fecha timestamptz)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_cli uuid; v_id uuid; v_msg text := null; v_etapa text; v_equipo equipos; v_min int; v_off int;
BEGIN
  IF NOT rol_en('{administracion,mostrador}') THEN RAISE EXCEPTION 'Sin permiso'; END IF;
  SELECT id INTO v_cli FROM clientes LIMIT 1;
  IF v_cli IS NULL THEN RETURN jsonb_build_object('ok', true, 'motivo', null); END IF;
  BEGIN
    PERFORM _validar_pedido(p_tipo, p_porciones, p_nivel, p_fecha, true);
    INSERT INTO ordenes (cliente_id, tipo_id, porciones, sabor_id, relleno_id, cobertura_id, nivel_id, modo_entrega, fecha_entrega, precio)
    VALUES (v_cli, p_tipo, p_porciones, p_sabor, p_relleno, p_cobertura, p_nivel, p_modo, p_fecha, 0) RETURNING id INTO v_id;
    PERFORM _planificar(v_id);
    RAISE EXCEPTION USING ERRCODE = 'P0099', MESSAGE = 'simulacion_ok';
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE <> 'P0099' THEN v_msg := SQLERRM; END IF;
  END;
  IF v_msg LIKE 'Sin lugar para %' THEN
    v_etapa := substring(v_msg from '^Sin lugar para (\S+) ');
    v_min := substring(v_msg from '\((\d+) min\)')::int;
    v_off := CASE v_etapa WHEN 'relleno' THEN 1 WHEN 'horneado' THEN 2 ELSE 0 END;
    SELECT * INTO v_equipo FROM equipos WHERE etapa = CASE v_etapa WHEN 'relleno' THEN 'armado' WHEN 'horneado' THEN 'horneado' ELSE 'decoracion' END;
    RETURN jsonb_build_object('ok', false, 'motivo', v_msg, 'sin_hueco', true, 'equipo_id', v_equipo.id, 'equipo', v_equipo.nombre,
      'fecha', (p_fecha AT TIME ZONE _tz())::date - v_off, 'minutos', v_min);
  END IF;
  RETURN jsonb_build_object('ok', v_msg IS NULL, 'motivo', v_msg);
END $$;

CREATE OR REPLACE FUNCTION public._confirmar(p_orden uuid, p_metodo metodo_pago, p_monto numeric, p_clave text, p_usuario uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE o ordenes; v_precio numeric; v_recargo numeric := 0; v_total numeric; v_min numeric; v_num int; v_fac uuid;
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
  PERFORM _validar_pedido(o.tipo_id, o.porciones, o.nivel_id, o.fecha_entrega, _urgencia_ok(p_orden));
  v_precio := _precio(o.tipo_id, o.porciones, o.sabor_id, o.relleno_id, o.cobertura_id, o.nivel_id, o.modo_entrega);
  IF _es_urgente(o.porciones, o.nivel_id, o.fecha_entrega) THEN v_recargo := round(v_precio * 0.15, 2); END IF;
  v_total := v_precio + v_recargo;
  v_min := round(v_total * 0.5, 2);
  IF p_monto IS NULL OR p_monto < v_min THEN RAISE EXCEPTION 'El anticipo mínimo es el 50%%: $%', v_min; END IF;
  IF p_monto > v_total THEN RAISE EXCEPTION 'El anticipo no puede superar el total ($%)', v_total; END IF;
  UPDATE ordenes SET precio = v_total, recargo_urgencia = v_recargo, estado = 'confirmada', actualizado = now() WHERE id = p_orden;
  PERFORM _generar_plan(p_orden);
  INSERT INTO cobros (orden_id, tipo, metodo, monto, clave_idempotencia, creado_por)
  VALUES (p_orden, 'anticipo', p_metodo, p_monto, p_clave, p_usuario);
  v_num := _nuevo_folio();
  INSERT INTO facturas_internas (numero, orden_id, total) VALUES (v_num, p_orden, v_total) RETURNING id INTO v_fac;
  INSERT INTO factura_renglones (factura_id, concepto, cantidad, importe) SELECT v_fac, * FROM _renglones_orden(p_orden);
  IF v_recargo > 0 THEN
    INSERT INTO factura_renglones (factura_id, concepto, cantidad, importe) VALUES (v_fac, 'Recargo por urgencia 15 %', 1, v_recargo);
  END IF;
  UPDATE cotizaciones SET estado = 'aceptada' WHERE orden_id = p_orden AND estado IN ('borrador','enviada');
  RETURN jsonb_build_object('ok', true, 'folio', o.folio, 'factura', 'FI-' || lpad(v_num::text,4,'0'), 'precio', v_total);
END $$;

REVOKE EXECUTE ON FUNCTION public._aplicar_solicitud(solicitudes_autorizacion) FROM PUBLIC, anon, authenticated;