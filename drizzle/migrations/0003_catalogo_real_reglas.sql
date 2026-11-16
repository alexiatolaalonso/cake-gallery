ALTER TYPE public.modo_entrega RENAME VALUE 'zona' TO 'zona1';
ALTER TYPE public.modo_entrega ADD VALUE IF NOT EXISTS 'zona2';
ALTER TYPE public.modo_entrega ADD VALUE IF NOT EXISTS 'zona3';
ALTER TABLE public.tipos_pastel ADD COLUMN IF NOT EXISTS requiere_montaje boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.niveles_diseno.dias_plazo IS 'Días extra que suma el nivel al plazo por tamaño (máximo 7 en total)';

CREATE OR REPLACE FUNCTION public._cargo_entrega(m public.modo_entrega) RETURNS numeric LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE m::text WHEN 'sucursal' THEN 0 WHEN 'zona1' THEN 90 WHEN 'zona2' THEN 160 WHEN 'zona3' THEN 260 WHEN 'montaje' THEN 450 ELSE 0 END::numeric $$;

CREATE OR REPLACE FUNCTION public._precio(p_tipo uuid, p_porciones int, p_sabor uuid, p_relleno uuid, p_cobertura uuid, p_nivel uuid, p_modo public.modo_entrega)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT round(((tp.precio_base + s.recargo + r.recargo + c.recargo + n.recargo) * p_porciones) + public._cargo_entrega(p_modo), 2)
  FROM tipos_pastel tp, sabores s, rellenos r, coberturas c, niveles_diseno n
  WHERE tp.id = p_tipo AND s.id = p_sabor AND r.id = p_relleno AND c.id = p_cobertura AND n.id = p_nivel
$$;

CREATE OR REPLACE FUNCTION public._renglones_orden(p_orden uuid)
RETURNS TABLE(concepto text, cantidad numeric, importe numeric) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT tp.nombre || ' · ' || o.porciones || ' porciones · ' || s.nombre || ' / ' || r.nombre || ' / ' || c.nombre || ' · Diseño ' || n.nombre,
         o.porciones::numeric,
         round((tp.precio_base + s.recargo + r.recargo + c.recargo + n.recargo) * o.porciones, 2)
  FROM ordenes o JOIN tipos_pastel tp ON tp.id = o.tipo_id JOIN sabores s ON s.id = o.sabor_id
  JOIN rellenos r ON r.id = o.relleno_id JOIN coberturas c ON c.id = o.cobertura_id JOIN niveles_diseno n ON n.id = o.nivel_id
  WHERE o.id = p_orden
  UNION ALL
  SELECT 'Entrega: ' || o.modo_entrega::text, 1, public._cargo_entrega(o.modo_entrega) FROM ordenes o WHERE o.id = p_orden AND o.modo_entrega::text <> 'sucursal'
$$;

CREATE OR REPLACE FUNCTION public._plazo_porciones(p_nivel uuid, p_porciones int) RETURNS int
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT least(CASE WHEN coalesce(p_porciones,0) <= 30 THEN 4 WHEN p_porciones <= 80 THEN 5 ELSE 7 END
               + coalesce((SELECT dias_plazo FROM niveles_diseno WHERE id = p_nivel),0), 7)
$$;

CREATE OR REPLACE FUNCTION public._primera_fecha_porciones(p_nivel uuid, p_porciones int) RETURNS timestamptz
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT (((now() AT TIME ZONE public._tz())::date + public._plazo_porciones(p_nivel, p_porciones)) + time '12:00') AT TIME ZONE public._tz()
$$;

CREATE OR REPLACE FUNCTION public._plazo_dias(p_tipo uuid, p_nivel uuid) RETURNS int
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public._plazo_porciones(p_nivel, (SELECT min_porciones FROM tipos_pastel WHERE id = p_tipo))
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
  v_plazo := _plazo_porciones(p_nivel, p_porciones);
  v_dias := (p_fecha AT TIME ZONE _tz())::date - (now() AT TIME ZONE _tz())::date;
  IF v_dias < v_plazo THEN
    RAISE EXCEPTION 'Plazo mínimo de % días. Primera fecha posible: %', v_plazo,
      to_char(_primera_fecha_porciones(p_nivel, p_porciones) AT TIME ZONE _tz(), 'DD/MM/YYYY');
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public._validar_entrega(p_tipo uuid, p_modo public.modo_entrega, p_fecha timestamptz)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_hora time := (p_fecha AT TIME ZONE _tz())::time;
BEGIN
  IF (SELECT requiere_montaje FROM tipos_pastel WHERE id = p_tipo) AND p_modo::text <> 'montaje' THEN
    RAISE EXCEPTION 'Los pasteles de boda requieren montaje ($450)';
  END IF;
  IF p_modo::text = 'sucursal' AND (v_hora < time '10:00' OR v_hora > time '19:00') THEN
    RAISE EXCEPTION 'La sucursal entrega de 10:00 a 19:00';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.cotizar(p_tipo uuid, p_porciones int, p_sabor uuid, p_relleno uuid, p_cobertura uuid, p_nivel uuid, p_modo public.modo_entrega, p_fecha timestamptz)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_err text; v_precio numeric;
BEGIN
  IF NOT rol_en('{administracion,mostrador}') THEN RAISE EXCEPTION 'Sin permiso'; END IF;
  v_precio := _precio(p_tipo, coalesce(p_porciones,0), p_sabor, p_relleno, p_cobertura, p_nivel, p_modo);
  BEGIN
    PERFORM _validar_pedido(p_tipo, p_porciones, p_nivel, p_fecha);
    PERFORM _validar_entrega(p_tipo, p_modo, p_fecha);
  EXCEPTION WHEN others THEN v_err := SQLERRM;
  END;
  RETURN jsonb_build_object('precio', v_precio, 'anticipo', round(v_precio*0.5,2),
    'plazo_dias', _plazo_porciones(p_nivel, p_porciones), 'primera_fecha', _primera_fecha_porciones(p_nivel, p_porciones), 'error', v_err);
END $$;

CREATE OR REPLACE FUNCTION public._minutos_etapa(p_etapa text, p_porciones int, p_nivel uuid, p_modo public.modo_entrega)
RETURNS int LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE p_etapa
    WHEN 'horneado'   THEN 18 * p_porciones / 10
    WHEN 'relleno'    THEN 12 * p_porciones / 10
    WHEN 'cobertura'  THEN 10 * p_porciones / 10
    WHEN 'decoracion' THEN (SELECT minutos_por_10 FROM niveles_diseno WHERE id = p_nivel) * p_porciones / 10
    WHEN 'empaque'    THEN 15
  END
$$;

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
      ('cobertura','armado',3,1,1,0),
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

CREATE OR REPLACE FUNCTION public.ocupacion(p_desde date, p_hasta date)
RETURNS TABLE(fecha date, equipo_id uuid, equipo text, etapa text, usados int, capacidad int, sin_capacidad boolean, autorizado boolean, motivo text, estado text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT d::date, e.id, e.nombre, e.etapa, public._usados(e.id, d::date, NULL),
    e.minutos_diarios + coalesce(cd.minutos_extra,0), coalesce(cd.sin_capacidad,false), cd.autorizado_por IS NOT NULL, cd.motivo,
    CASE WHEN coalesce(cd.sin_capacidad,false) AND cd.autorizado_por IS NULL THEN 'sin_capacidad'
         WHEN public._usados(e.id, d::date, NULL) > 0.95 * (e.minutos_diarios + coalesce(cd.minutos_extra,0)) THEN 'saturado'
         WHEN public._usados(e.id, d::date, NULL) > 0.70 * (e.minutos_diarios + coalesce(cd.minutos_extra,0)) THEN 'justo'
         ELSE 'con_lugar' END
  FROM generate_series(p_desde, p_hasta, interval '1 day') d CROSS JOIN equipos e
  LEFT JOIN capacidad_dia cd ON cd.equipo_id = e.id AND cd.fecha = d::date
  WHERE public.rol_en('{administracion,produccion,mostrador}')
  ORDER BY d, e.orden_etapa
$$;
REVOKE ALL ON FUNCTION public._plazo_porciones(uuid,int), public._primera_fecha_porciones(uuid,int), public._validar_entrega(uuid, public.modo_entrega, timestamptz) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._trg_validar_entrega() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM _validar_entrega(NEW.tipo_id, NEW.modo_entrega, NEW.fecha_entrega);
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public._trg_validar_entrega() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS validar_entrega ON public.ordenes;
CREATE TRIGGER validar_entrega BEFORE INSERT OR UPDATE OF tipo_id, modo_entrega, fecha_entrega ON public.ordenes
  FOR EACH ROW EXECUTE FUNCTION public._trg_validar_entrega();