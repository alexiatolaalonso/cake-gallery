ALTER TABLE public.tareas ADD COLUMN IF NOT EXISTS requiere_revision boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public._generar_plan(p_orden uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_plan jsonb; t jsonb; v_para timestamptz; n record; v_disp numeric; v_nombre text; v_unidad text; v_usado numeric; o ordenes;
BEGIN
  SELECT * INTO o FROM ordenes WHERE id = p_orden;
  DELETE FROM tareas WHERE orden_id = p_orden AND estado = 'pendiente' AND NOT editada_manual;
  UPDATE tareas SET minutos = _minutos_etapa(etapa, o.porciones, o.nivel_id, o.modo_entrega),
    fin = inicio + make_interval(mins => _minutos_etapa(etapa, o.porciones, o.nivel_id, o.modo_entrega)),
    requiere_revision = true
  WHERE orden_id = p_orden AND estado = 'pendiente' AND editada_manual AND orden_etapa > 0;
  DELETE FROM reservas WHERE orden_id = p_orden;
  v_plan := _planificar(p_orden);
  FOR t IN SELECT * FROM jsonb_array_elements(v_plan) LOOP
    INSERT INTO tareas (orden_id, equipo_id, etapa, orden_etapa, dia, inicio, fin, minutos)
    VALUES (p_orden, (t->>'equipo_id')::uuid, t->>'etapa', (t->>'orden_etapa')::int, (t->>'dia')::date,
            (t->>'inicio')::timestamptz, (t->>'fin')::timestamptz, (t->>'minutos')::int);
  END LOOP;
  FOR n IN SELECT * FROM _necesidad_fechas(p_orden) LOOP
    v_para := greatest(n.para, now());
    v_usado := coalesce((SELECT sum(c.cantidad) FROM consumos c WHERE c.orden_id = p_orden AND c.insumo_id = n.insumo_id),0);
    v_disp := _disponible_para(n.insumo_id, v_para, p_orden) + v_usado;
    IF v_disp < n.cantidad THEN
      SELECT nombre, unidad INTO v_nombre, v_unidad FROM insumos WHERE id = n.insumo_id;
      RAISE EXCEPTION 'Falta %: se necesitan % %, hay % % disponibles o por llegar antes del % (etapa que lo usa)',
        v_nombre, n.cantidad, v_unidad, round(greatest(v_disp,0),3), v_unidad,
        to_char(v_para AT TIME ZONE _tz(), 'DD/MM HH24:MI');
    END IF;
    INSERT INTO reservas (orden_id, insumo_id, cantidad, necesaria_para)
    VALUES (p_orden, n.insumo_id, greatest(n.cantidad - v_usado, 0), v_para);
  END LOOP;
END $function$;

CREATE OR REPLACE FUNCTION public._planificar(p_orden uuid)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE o ordenes; e equipos; s record; v_deadline timestamptz; v_dia date; v_mins int; v_cap int; v_extra int;
  v_bloq boolean; v_ini timestamptz; v_fin timestamptz; v_start timestamptz; v_end timestamptz; v_entrega date;
  v_hoy date := (now() AT TIME ZONE _tz())::date; v_res jsonb := '[]'; v_ok boolean; cd capacidad_dia;
  v_propios int; v_tandas int; v_tandas_dia int;
BEGIN
  SELECT * INTO o FROM ordenes WHERE id = p_orden;
  v_deadline := o.fecha_entrega;
  v_entrega := (o.fecha_entrega AT TIME ZONE _tz())::date;
  v_tandas := ceil(o.porciones / 30.0);
  FOR s IN SELECT * FROM (VALUES
      ('empaque','decoracion',5,0,0,0),
      ('decoracion','decoracion',4,0,1,0),
      ('cobertura','decoracion',3,0,1,0),
      ('relleno','armado',2,1,1,120),
      ('horneado','horneado',1,2,2,0)
    ) v(etapa, equipo_etapa, orden_etapa, off_min, off_max, espera) ORDER BY orden_etapa DESC LOOP
    IF EXISTS (SELECT 1 FROM tareas WHERE orden_id = p_orden AND etapa = s.etapa AND (estado <> 'pendiente' OR editada_manual)) THEN
      SELECT inicio INTO v_deadline FROM tareas WHERE orden_id = p_orden AND etapa = s.etapa;
      v_deadline := v_deadline - make_interval(mins => s.espera);
      CONTINUE;
    END IF;
    SELECT * INTO e FROM equipos WHERE etapa = s.equipo_etapa;
    v_mins := _minutos_etapa(s.etapa, o.porciones, o.nivel_id, o.modo_entrega);
    v_dia := least((v_deadline AT TIME ZONE _tz())::date, v_entrega - s.off_min);
    v_ok := false;
    WHILE v_dia >= v_hoy AND v_dia >= v_entrega - s.off_max LOOP
      SELECT * INTO cd FROM capacidad_dia WHERE equipo_id = e.id AND fecha = v_dia;
      v_extra := coalesce(cd.minutos_extra, 0);
      v_bloq := coalesce(cd.sin_capacidad, false) AND cd.autorizado_por IS NULL;
      v_cap := e.minutos_diarios + v_extra;
      v_start := (v_dia + e.hora_inicio) AT TIME ZONE _tz();
      v_end := ((v_dia + e.hora_fin) AT TIME ZONE _tz()) + make_interval(mins => v_extra);
      v_fin := least(v_deadline, v_end);
      v_ini := v_fin - make_interval(mins => v_mins);
      SELECT coalesce(sum((x->>'minutos')::int),0) INTO v_propios FROM jsonb_array_elements(v_res) x
        WHERE (x->>'equipo_id')::uuid = e.id AND (x->>'dia')::date = v_dia;
      v_tandas_dia := 0;
      IF s.etapa = 'horneado' THEN
        SELECT coalesce(sum(ceil(oo.porciones / 30.0)),0) INTO v_tandas_dia FROM tareas t JOIN ordenes oo ON oo.id = t.orden_id
          WHERE t.etapa = 'horneado' AND t.dia = v_dia AND t.orden_id <> p_orden;
      END IF;
      IF NOT v_bloq AND _usados(e.id, v_dia, p_orden) + v_propios + v_mins <= v_cap AND v_ini >= v_start AND v_ini >= now()
         AND v_tandas_dia + v_tandas <= 8 THEN
        v_ok := true; EXIT;
      END IF;
      v_dia := v_dia - 1;
    END LOOP;
    IF NOT v_ok THEN
      RAISE EXCEPTION 'Sin lugar para % en el equipo % (% min) para esa fecha. Elige otra fecha o autoriza horas extra', s.etapa, e.nombre, v_mins;
    END IF;
    v_res := v_res || jsonb_build_object('equipo_id', e.id, 'etapa', s.etapa, 'orden_etapa', s.orden_etapa,
      'dia', v_dia, 'inicio', v_ini, 'fin', v_fin, 'minutos', v_mins);
    v_deadline := v_ini - make_interval(mins => s.espera);
  END LOOP;
  RETURN v_res;
END $function$;

CREATE OR REPLACE FUNCTION public.marcar_tarea_revisada(p_tarea uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT rol_en('{administracion,produccion}') THEN RAISE EXCEPTION 'Sin permiso'; END IF;
  UPDATE tareas SET requiere_revision = false WHERE id = p_tarea;
END $function$;

DROP FUNCTION IF EXISTS public.mis_tareas(date, date);
CREATE FUNCTION public.mis_tareas(p_desde date, p_hasta date)
 RETURNS TABLE(id uuid, orden_id uuid, folio integer, etapa text, equipo text, dia date, inicio timestamp with time zone, fin timestamp with time zone, minutos integer, estado text, atrasada boolean, editada_manual boolean, porciones integer, tipo text, sabor text, relleno text, cobertura text, diseno text, descripcion text, fecha_entrega timestamp with time zone, cliente text, bloqueo_etapa text, bloqueo_estado text, requiere_revision boolean)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT t.id, t.orden_id, o.folio, t.etapa, e.nombre, t.dia, t.inicio, t.fin, t.minutos,
    t.estado::text, (t.estado <> 'hecha' AND t.fin < now()), t.editada_manual, o.porciones, tp.nombre, s.nombre, r.nombre, c.nombre,
    n.nombre, o.descripcion, o.fecha_entrega, cl.nombre, b.etapa, b.estado::text, t.requiere_revision
  FROM tareas t JOIN ordenes o ON o.id = t.orden_id JOIN equipos e ON e.id = t.equipo_id
  JOIN tipos_pastel tp ON tp.id = o.tipo_id JOIN sabores s ON s.id = o.sabor_id JOIN rellenos r ON r.id = o.relleno_id
  JOIN coberturas c ON c.id = o.cobertura_id JOIN niveles_diseno n ON n.id = o.nivel_id JOIN clientes cl ON cl.id = o.cliente_id
  LEFT JOIN LATERAL (SELECT p.etapa, p.estado FROM tareas p WHERE p.orden_id = t.orden_id AND p.orden_etapa < t.orden_etapa AND p.estado <> 'hecha' ORDER BY p.orden_etapa LIMIT 1) b ON true
  WHERE t.orden_etapa > 0 AND t.dia BETWEEN p_desde AND p_hasta AND o.estado NOT IN ('cancelada')
    AND (public.rol_en('{administracion,produccion}') OR (public.has_role(auth.uid(),'equipo') AND t.equipo_id = public.mi_equipo()))
  ORDER BY t.inicio
$function$;
GRANT EXECUTE ON FUNCTION public.mis_tareas(date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.marcar_tarea_revisada(uuid) TO authenticated;