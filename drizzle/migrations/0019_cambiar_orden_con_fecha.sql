DROP FUNCTION IF EXISTS public.cambiar_orden(uuid, integer, uuid, uuid, uuid);
CREATE OR REPLACE FUNCTION public.cambiar_orden(p_orden uuid, p_porciones integer, p_sabor uuid, p_relleno uuid, p_cobertura uuid, p_fecha timestamp with time zone DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE o ordenes; tp tipos_pastel; v_base_ant numeric; v_base numeric; v_recargo_cambio numeric := 0; v_recargo numeric; v_total numeric;
  f facturas_internas; v_dif numeric; v_rehacer text[] := '{}'; v_desde int := 99; t tareas; v_fecha timestamptz; v_antes jsonb;
BEGIN
  IF NOT rol_en('{administracion,mostrador}') THEN RAISE EXCEPTION 'Sin permiso'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('obrador_planificacion'));
  SELECT * INTO o FROM ordenes WHERE id = p_orden FOR UPDATE;
  IF o.estado NOT IN ('confirmada','en_produccion') THEN RAISE EXCEPTION 'Solo se cambian órdenes confirmadas o en producción'; END IF;
  IF EXISTS (SELECT 1 FROM tareas WHERE orden_id = p_orden AND etapa = 'decoracion' AND estado <> 'pendiente') THEN
    RAISE EXCEPTION 'Ya empezó Decoración: no se admiten cambios';
  END IF;
  SELECT * INTO tp FROM tipos_pastel WHERE id = o.tipo_id;
  IF p_porciones IS NULL OR p_porciones < 10 OR p_porciones % 10 <> 0 THEN
    RAISE EXCEPTION 'Las porciones van de 10 en 10 (10, 20, 30…). % no es válido', p_porciones;
  END IF;
  IF p_porciones < tp.min_porciones OR p_porciones > tp.max_porciones THEN
    RAISE EXCEPTION '% admite de % a % porciones', tp.nombre, tp.min_porciones, tp.max_porciones;
  END IF;
  v_fecha := coalesce(p_fecha, o.fecha_entrega);
  IF v_fecha <> o.fecha_entrega THEN
    PERFORM _validar_pedido(o.tipo_id, p_porciones, o.nivel_id, v_fecha);
    PERFORM _validar_entrega(o.tipo_id, o.modo_entrega, v_fecha);
  END IF;
  v_antes := jsonb_build_object('porciones', o.porciones, 'sabor_id', o.sabor_id, 'relleno_id', o.relleno_id, 'cobertura_id', o.cobertura_id, 'fecha_entrega', o.fecha_entrega, 'precio', o.precio);
  IF NOT EXISTS (SELECT 1 FROM sabores WHERE id = p_sabor) THEN RAISE EXCEPTION 'El sabor elegido ya no está disponible. Elige otro.'; END IF;
  IF NOT EXISTS (SELECT 1 FROM rellenos WHERE id = p_relleno) THEN RAISE EXCEPTION 'El relleno elegido ya no está disponible. Elige otro.'; END IF;
  IF NOT EXISTS (SELECT 1 FROM coberturas WHERE id = p_cobertura) THEN RAISE EXCEPTION 'La cobertura elegida ya no está disponible. Elige otra.'; END IF;

  CREATE TEMP TABLE IF NOT EXISTS _mover (etapa_mov text, LIKE consumos) ON COMMIT DROP;
  CREATE TEMP TABLE IF NOT EXISTS _mover_merma (etapa_mov text, merma_id uuid) ON COMMIT DROP;
  DELETE FROM _mover WHERE true; DELETE FROM _mover_merma WHERE true;
  v_base_ant := o.precio - o.recargo_urgencia;
  v_base := _precio(o.tipo_id, p_porciones, p_sabor, p_relleno, p_cobertura, o.nivel_id, o.modo_entrega);
  IF v_fecha - now() < interval '3 days' THEN v_recargo_cambio := round(greatest(v_base - v_base_ant, 0) * 0.15, 2); END IF;
  v_recargo := o.recargo_urgencia + v_recargo_cambio;
  v_total := v_base + v_recargo;

  IF p_porciones <> o.porciones OR p_sabor <> o.sabor_id THEN v_desde := 1;
  ELSIF p_relleno <> o.relleno_id THEN v_desde := 2;
  ELSIF p_cobertura <> o.cobertura_id THEN v_desde := 3; END IF;
  FOR t IN SELECT * FROM tareas WHERE orden_id = p_orden AND orden_etapa BETWEEN v_desde AND 3 AND estado <> 'pendiente' ORDER BY orden_etapa LOOP
    v_rehacer := v_rehacer || t.etapa;
    INSERT INTO movimientos_merma (insumo_id, lote_id, orden_id, tarea_id, cantidad, costo, motivo, creado_por)
      SELECT c.insumo_id, c.lote_id, c.orden_id, c.tarea_id, c.cantidad, c.costo, 'Cambio de pedido #' || o.folio, auth.uid()
      FROM consumos c WHERE c.tarea_id = t.id;
    DELETE FROM consumos WHERE tarea_id = t.id;
    UPDATE tareas SET etapa = 'rehecha:' || etapa, orden_etapa = 0, estado = 'hecha',
      finalizada_en = coalesce(finalizada_en, now()), iniciada_en = coalesce(iniciada_en, now()) WHERE id = t.id;
  END LOOP;

  FOR t IN SELECT * FROM tareas x WHERE x.orden_id = p_orden AND x.estado = 'pendiente'
      AND (EXISTS (SELECT 1 FROM consumos c WHERE c.tarea_id = x.id) OR EXISTS (SELECT 1 FROM movimientos_merma m WHERE m.tarea_id = x.id)) LOOP
    IF t.orden_etapa BETWEEN v_desde AND 3 THEN
      INSERT INTO movimientos_merma (insumo_id, lote_id, orden_id, tarea_id, cantidad, costo, motivo, creado_por)
        SELECT c.insumo_id, c.lote_id, c.orden_id, NULL, c.cantidad, c.costo, 'Cambio de pedido #' || o.folio, auth.uid()
        FROM consumos c WHERE c.tarea_id = t.id;
      DELETE FROM consumos WHERE tarea_id = t.id;
      IF NOT (t.etapa = ANY(v_rehacer)) THEN v_rehacer := v_rehacer || t.etapa; END IF;
    ELSE
      INSERT INTO _mover SELECT t.etapa, c.* FROM consumos c WHERE c.tarea_id = t.id;
      DELETE FROM consumos WHERE tarea_id = t.id;
    END IF;
    INSERT INTO _mover_merma SELECT t.etapa, m.id FROM movimientos_merma m WHERE m.tarea_id = t.id;
    UPDATE movimientos_merma SET tarea_id = NULL WHERE tarea_id = t.id;
  END LOOP;

  UPDATE ordenes SET porciones = p_porciones, sabor_id = p_sabor, relleno_id = p_relleno, cobertura_id = p_cobertura, fecha_entrega = v_fecha,
    precio = v_total, recargo_urgencia = v_recargo, actualizado = now() WHERE id = p_orden;
  PERFORM _generar_plan(p_orden);
  INSERT INTO consumos (id, tarea_id, orden_id, lote_id, insumo_id, cantidad, costo, creado, creado_por)
    SELECT mv.id, nt.id, mv.orden_id, mv.lote_id, mv.insumo_id, mv.cantidad, mv.costo, mv.creado, mv.creado_por
    FROM _mover mv JOIN tareas nt ON nt.orden_id = p_orden AND nt.etapa = mv.etapa_mov AND nt.orden_etapa > 0;
  UPDATE movimientos_merma m SET tarea_id = nt.id FROM _mover_merma mm JOIN tareas nt ON nt.orden_id = p_orden AND nt.etapa = mm.etapa_mov AND nt.orden_etapa > 0
    WHERE m.id = mm.merma_id AND NOT (mm.etapa_mov = ANY(v_rehacer));

  SELECT * INTO f FROM facturas_internas WHERE orden_id = p_orden AND estado <> 'cancelada' ORDER BY numero DESC LIMIT 1;
  IF f.id IS NOT NULL AND f.total <> v_total THEN
    v_dif := v_total - f.total - v_recargo_cambio;
    IF v_dif <> 0 THEN
      INSERT INTO factura_renglones (factura_id, concepto, cantidad, importe)
      VALUES (f.id, 'Ajuste por cambio: ' || p_porciones || ' porciones', 1, v_dif);
    END IF;
    IF v_recargo_cambio > 0 THEN
      INSERT INTO factura_renglones (factura_id, concepto, cantidad, importe)
      VALUES (f.id, 'Recargo 15% sobre la diferencia (cambio a menos de 3 días)', 1, v_recargo_cambio);
    END IF;
    UPDATE facturas_internas SET total = v_total, estado = 'emitida', pagada = NULL WHERE id = f.id;
  END IF;
  RETURN jsonb_build_object('ok', true, 'precio', v_total, 'recargo', v_recargo_cambio, 'rehacer', to_jsonb(v_rehacer), 'antes', v_antes, 'fecha', v_fecha);
END
$function$;
GRANT EXECUTE ON FUNCTION public.cambiar_orden(uuid,integer,uuid,uuid,uuid,timestamptz) TO authenticated;