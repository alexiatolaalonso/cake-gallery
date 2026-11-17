CREATE OR REPLACE FUNCTION public.cambiar_orden(p_orden uuid, p_porciones integer, p_sabor uuid, p_relleno uuid, p_cobertura uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE o ordenes; tp tipos_pastel; v_base numeric; v_recargo numeric := 0; v_total numeric; f facturas_internas;
BEGIN
  IF NOT rol_en('{administracion,mostrador}') THEN RAISE EXCEPTION 'Sin permiso'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('obrador_planificacion'));
  SELECT * INTO o FROM ordenes WHERE id = p_orden FOR UPDATE;
  IF o.estado NOT IN ('confirmada','en_produccion') THEN RAISE EXCEPTION 'Solo se cambian órdenes confirmadas o en producción'; END IF;
  IF EXISTS (SELECT 1 FROM tareas WHERE orden_id = p_orden AND etapa = 'decoracion' AND estado <> 'pendiente') THEN
    RAISE EXCEPTION 'Ya empezó Decoración: no se admiten cambios';
  END IF;
  IF EXISTS (SELECT 1 FROM consumos c JOIN tareas t ON t.id = c.tarea_id WHERE t.orden_id = p_orden)
     OR EXISTS (SELECT 1 FROM movimientos_merma m JOIN tareas t ON t.id = m.tarea_id WHERE t.orden_id = p_orden) THEN
    RAISE EXCEPTION 'Este pedido ya tiene consumos o mermas registrados: no se admiten cambios';
  END IF;
  SELECT * INTO tp FROM tipos_pastel WHERE id = o.tipo_id;
  IF p_porciones IS NULL OR p_porciones < 10 OR p_porciones % 10 <> 0 THEN
    RAISE EXCEPTION 'Las porciones van de 10 en 10 (10, 20, 30…). % no es válido', p_porciones;
  END IF;
  IF tp.min_porciones IS NOT NULL AND tp.max_porciones IS NOT NULL AND (p_porciones < tp.min_porciones OR p_porciones > tp.max_porciones) THEN
    RAISE EXCEPTION '% admite de % a % porciones', tp.nombre, tp.min_porciones, tp.max_porciones;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM sabores WHERE id = p_sabor) THEN RAISE EXCEPTION 'El sabor elegido ya no está disponible. Elegí otro.'; END IF;
  IF NOT EXISTS (SELECT 1 FROM rellenos WHERE id = p_relleno) THEN RAISE EXCEPTION 'El relleno elegido ya no está disponible. Elegí otro.'; END IF;
  IF NOT EXISTS (SELECT 1 FROM coberturas WHERE id = p_cobertura) THEN RAISE EXCEPTION 'La cobertura elegida ya no está disponible. Elegí otra.'; END IF;
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
END
$function$;