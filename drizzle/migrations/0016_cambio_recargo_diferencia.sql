CREATE OR REPLACE FUNCTION public.avance_pedidos(p_ordenes uuid[])
 RETURNS TABLE(orden_id uuid, etapa text, orden_etapa integer, estado text, equipo text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT t.orden_id, t.etapa, t.orden_etapa, t.estado::text, e.nombre
  FROM tareas t JOIN equipos e ON e.id = t.equipo_id
  WHERE t.orden_id = ANY(p_ordenes) AND t.orden_etapa > 0
    AND (public.rol_en('{administracion,produccion}')
      OR (public.has_role(auth.uid(),'equipo') AND EXISTS (SELECT 1 FROM tareas m WHERE m.orden_id = t.orden_id AND m.equipo_id = public.mi_equipo())))
  ORDER BY t.orden_id, t.orden_etapa
$function$;

CREATE OR REPLACE FUNCTION public.mis_tareas(p_desde date, p_hasta date)
 RETURNS TABLE(id uuid, orden_id uuid, folio integer, etapa text, equipo text, dia date, inicio timestamp with time zone, fin timestamp with time zone, minutos integer, estado text, atrasada boolean, editada_manual boolean, porciones integer, tipo text, sabor text, relleno text, cobertura text, diseno text, descripcion text, fecha_entrega timestamp with time zone, cliente text, bloqueo_etapa text, bloqueo_estado text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT t.id, t.orden_id, o.folio, t.etapa, e.nombre, t.dia, t.inicio, t.fin, t.minutos,
    t.estado::text, (t.estado <> 'hecha' AND t.fin < now()), t.editada_manual, o.porciones, tp.nombre, s.nombre, r.nombre, c.nombre,
    n.nombre, o.descripcion, o.fecha_entrega, cl.nombre, b.etapa, b.estado::text
  FROM tareas t JOIN ordenes o ON o.id = t.orden_id JOIN equipos e ON e.id = t.equipo_id
  JOIN tipos_pastel tp ON tp.id = o.tipo_id JOIN sabores s ON s.id = o.sabor_id JOIN rellenos r ON r.id = o.relleno_id
  JOIN coberturas c ON c.id = o.cobertura_id JOIN niveles_diseno n ON n.id = o.nivel_id JOIN clientes cl ON cl.id = o.cliente_id
  LEFT JOIN LATERAL (SELECT p.etapa, p.estado FROM tareas p WHERE p.orden_id = t.orden_id AND p.orden_etapa < t.orden_etapa AND p.estado <> 'hecha' ORDER BY p.orden_etapa LIMIT 1) b ON true
  WHERE t.orden_etapa > 0 AND t.dia BETWEEN p_desde AND p_hasta AND o.estado NOT IN ('cancelada')
    AND (public.rol_en('{administracion,produccion}') OR (public.has_role(auth.uid(),'equipo') AND t.equipo_id = public.mi_equipo()))
  ORDER BY t.inicio
$function$;

CREATE OR REPLACE FUNCTION public.cambiar_orden(p_orden uuid, p_porciones integer, p_sabor uuid, p_relleno uuid, p_cobertura uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE o ordenes; tp tipos_pastel; v_base_ant numeric; v_base numeric; v_recargo_cambio numeric := 0; v_recargo numeric; v_total numeric;
  f facturas_internas; v_dif numeric; v_rehacer text[] := '{}'; v_desde int := 99; t tareas;
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
  IF NOT EXISTS (SELECT 1 FROM sabores WHERE id = p_sabor) THEN RAISE EXCEPTION 'El sabor elegido ya no está disponible. Elegí otro.'; END IF;
  IF NOT EXISTS (SELECT 1 FROM rellenos WHERE id = p_relleno) THEN RAISE EXCEPTION 'El relleno elegido ya no está disponible. Elegí otro.'; END IF;
  IF NOT EXISTS (SELECT 1 FROM coberturas WHERE id = p_cobertura) THEN RAISE EXCEPTION 'La cobertura elegida ya no está disponible. Elegí otra.'; END IF;

  v_base_ant := o.precio - o.recargo_urgencia;
  v_base := _precio(o.tipo_id, p_porciones, p_sabor, p_relleno, p_cobertura, o.nivel_id, o.modo_entrega);
  IF o.fecha_entrega - now() < interval '3 days' THEN v_recargo_cambio := round(greatest(v_base - v_base_ant, 0) * 0.15, 2); END IF;
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

  UPDATE ordenes SET porciones = p_porciones, sabor_id = p_sabor, relleno_id = p_relleno, cobertura_id = p_cobertura,
    precio = v_total, recargo_urgencia = v_recargo, actualizado = now() WHERE id = p_orden;
  PERFORM _generar_plan(p_orden);

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
  RETURN jsonb_build_object('ok', true, 'precio', v_total, 'recargo', v_recargo_cambio, 'rehacer', to_jsonb(v_rehacer));
END
$function$;