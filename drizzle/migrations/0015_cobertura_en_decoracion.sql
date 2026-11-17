CREATE OR REPLACE FUNCTION public._planificar(p_orden uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
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
    IF EXISTS (SELECT 1 FROM tareas WHERE orden_id = p_orden AND etapa = s.etapa AND estado <> 'pendiente') THEN
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
END $$;