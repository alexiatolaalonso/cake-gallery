CREATE OR REPLACE FUNCTION public._caducar_lotes() RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE l lotes; n int := 0;
BEGIN
  FOR l IN SELECT * FROM lotes WHERE caducidad <= (now() AT TIME ZONE _tz())::date AND disponible > 0 FOR UPDATE LOOP
    INSERT INTO movimientos_merma (insumo_id, lote_id, cantidad, costo, motivo)
    VALUES (l.insumo_id, l.id, l.disponible, round(l.disponible * l.costo, 2), 'caducidad');
    UPDATE lotes SET disponible = 0 WHERE id = l.id;
    n := n + 1;
  END LOOP;
  RETURN n;
END $$;

CREATE OR REPLACE FUNCTION public._disponible_para(p_insumo uuid, p_para timestamp with time zone, p_excluir uuid) RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT coalesce((SELECT sum(disponible) FROM lotes WHERE insumo_id = p_insumo AND caducidad > (p_para AT TIME ZONE public._tz())::date),0)
       + coalesce((SELECT sum(cantidad) FROM compras WHERE insumo_id = p_insumo AND estado = 'en_camino'
                   AND fecha_llegada < (p_para AT TIME ZONE public._tz())::date
                   AND (caducidad IS NULL OR caducidad > (p_para AT TIME ZONE public._tz())::date)),0)
       - coalesce((SELECT sum(cantidad) FROM reservas WHERE insumo_id = p_insumo AND orden_id IS DISTINCT FROM p_excluir),0)
$$;

CREATE OR REPLACE FUNCTION public._descontar(p_insumo uuid, p_cantidad numeric) RETURNS TABLE(lote_id uuid, cantidad numeric, costo numeric) LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE l lotes; v_rest numeric := p_cantidad; v_toma numeric;
BEGIN
  PERFORM _caducar_lotes();
  IF (SELECT coalesce(sum(disponible),0) FROM lotes WHERE insumo_id = p_insumo AND caducidad > (now() AT TIME ZONE _tz())::date) < p_cantidad THEN
    RAISE EXCEPTION 'No hay suficiente % en lotes vigentes', (SELECT nombre FROM insumos WHERE id = p_insumo);
  END IF;
  FOR l IN SELECT * FROM lotes WHERE insumo_id = p_insumo AND disponible > 0 AND caducidad > (now() AT TIME ZONE _tz())::date
           ORDER BY caducidad, recibido FOR UPDATE LOOP
    EXIT WHEN v_rest <= 0;
    v_toma := least(v_rest, l.disponible);
    UPDATE lotes SET disponible = disponible - v_toma WHERE id = l.id;
    lote_id := l.id; cantidad := v_toma; costo := round(v_toma * l.costo, 2);
    RETURN NEXT;
    v_rest := v_rest - v_toma;
  END LOOP;
END $$;

-- Fecha en que cada insumo hace falta: inicio de la primera tarea de la etapa que lo usa
CREATE OR REPLACE FUNCTION public._necesidad_fechas(p_orden uuid) RETURNS TABLE(insumo_id uuid, cantidad numeric, para timestamptz) LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  WITH comp AS (
    SELECT r.insumo_id, r.cantidad_por_10 * o.porciones / 10.0 AS cant,
      (SELECT min(t.inicio) FROM tareas t WHERE t.orden_id = o.id AND t.etapa = ANY (CASE r.componente
          WHEN 'sabor' THEN ARRAY['horneado'] WHEN 'relleno' THEN ARRAY['relleno','armado'] ELSE ARRAY['cobertura'] END)) AS para
    FROM ordenes o JOIN recetas r ON
      (r.componente = 'sabor' AND r.componente_id = o.sabor_id) OR
      (r.componente = 'relleno' AND r.componente_id = o.relleno_id) OR
      (r.componente = 'cobertura' AND r.componente_id = o.cobertura_id)
    WHERE o.id = p_orden)
  SELECT insumo_id, round(sum(cant),3),
         coalesce(min(para), (SELECT min(inicio) FROM tareas WHERE orden_id = p_orden), (SELECT fecha_entrega FROM ordenes WHERE id = p_orden))
  FROM comp GROUP BY insumo_id
$$;

CREATE OR REPLACE FUNCTION public._generar_plan(p_orden uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_plan jsonb; t jsonb; v_para timestamptz; n record; v_disp numeric; v_nombre text; v_unidad text; v_usado numeric;
BEGIN
  DELETE FROM tareas WHERE orden_id = p_orden AND estado = 'pendiente';
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
END $$;

-- Pedidos en riesgo: lo que hay + lo que llega antes de la fecha de uso no alcanza,
-- dando prioridad a las reservas que se necesitan antes.
CREATE OR REPLACE FUNCTION public.ordenes_en_riesgo() RETURNS TABLE(orden_id uuid, folio integer, insumo text, falta numeric, unidad text, necesaria_para timestamptz) LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sin permiso'; END IF;
  PERFORM _caducar_lotes();
  RETURN QUERY
  WITH r AS (
    SELECT rv.orden_id, rv.insumo_id, rv.cantidad, rv.necesaria_para,
      sum(rv.cantidad) OVER (PARTITION BY rv.insumo_id ORDER BY rv.necesaria_para, rv.id) AS acumulado
    FROM reservas rv JOIN ordenes o ON o.id = rv.orden_id
    WHERE o.estado IN ('confirmada','en_produccion') AND rv.cantidad > 0)
  SELECT r.orden_id, o.folio, i.nombre,
    round(least(r.cantidad, r.acumulado - (
      coalesce((SELECT sum(l.disponible) FROM lotes l WHERE l.insumo_id = r.insumo_id AND l.caducidad > (r.necesaria_para AT TIME ZONE _tz())::date),0)
    + coalesce((SELECT sum(c.cantidad) FROM compras c WHERE c.insumo_id = r.insumo_id AND c.estado = 'en_camino'
        AND c.fecha_llegada < (r.necesaria_para AT TIME ZONE _tz())::date
        AND (c.caducidad IS NULL OR c.caducidad > (r.necesaria_para AT TIME ZONE _tz())::date)),0))),3),
    i.unidad, r.necesaria_para
  FROM r JOIN ordenes o ON o.id = r.orden_id JOIN insumos i ON i.id = r.insumo_id
  WHERE r.acumulado > coalesce((SELECT sum(l.disponible) FROM lotes l WHERE l.insumo_id = r.insumo_id AND l.caducidad > (r.necesaria_para AT TIME ZONE _tz())::date),0)
    + coalesce((SELECT sum(c.cantidad) FROM compras c WHERE c.insumo_id = r.insumo_id AND c.estado = 'en_camino'
        AND c.fecha_llegada < (r.necesaria_para AT TIME ZONE _tz())::date
        AND (c.caducidad IS NULL OR c.caducidad > (r.necesaria_para AT TIME ZONE _tz())::date)),0)
  ORDER BY r.necesaria_para;
END $$;

CREATE OR REPLACE FUNCTION public.posponer_compra(p_compra uuid, p_fecha date) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT rol_en('{administracion,produccion}') THEN RAISE EXCEPTION 'Sin permiso'; END IF;
  IF p_fecha IS NULL THEN RAISE EXCEPTION 'Indicá la nueva fecha de llegada'; END IF;
  UPDATE compras SET fecha_llegada = p_fecha WHERE id = p_compra AND estado = 'en_camino';
  IF NOT FOUND THEN RAISE EXCEPTION 'La compra no está en camino'; END IF;
END $$;

REVOKE ALL ON FUNCTION public._necesidad_fechas(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ordenes_en_riesgo() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.posponer_compra(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ordenes_en_riesgo() TO authenticated;
GRANT EXECUTE ON FUNCTION public.posponer_compra(uuid, date) TO authenticated;