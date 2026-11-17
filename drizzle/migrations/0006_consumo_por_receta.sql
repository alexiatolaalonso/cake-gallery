CREATE OR REPLACE FUNCTION public.registrar_consumo_receta(p_tarea uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE t tareas; i record; d record; n int := 0; v_total numeric := 0;
BEGIN
  t := _puede_tarea(p_tarea);
  IF EXISTS (SELECT 1 FROM consumos WHERE tarea_id = t.id) THEN
    RAISE EXCEPTION 'El consumo de esta tarea ya se registró';
  END IF;
  FOR i IN SELECT * FROM insumos_tarea(p_tarea) WHERE previsto > 0 LOOP
    IF (SELECT coalesce(sum(disponible),0) FROM lotes WHERE insumo_id = i.insumo_id AND caducidad >= current_date) < i.previsto THEN
      RAISE EXCEPTION 'No hay existencia suficiente de % (faltan % %)', i.nombre,
        round(i.previsto - (SELECT coalesce(sum(disponible),0) FROM lotes WHERE insumo_id = i.insumo_id AND caducidad >= current_date), 3), i.unidad;
    END IF;
    FOR d IN SELECT * FROM _descontar(i.insumo_id, i.previsto) LOOP
      INSERT INTO consumos (tarea_id, orden_id, lote_id, insumo_id, cantidad, costo, creado_por)
      VALUES (t.id, t.orden_id, d.lote_id, i.insumo_id, d.cantidad, d.costo, auth.uid());
      v_total := v_total + d.costo;
    END LOOP;
    UPDATE reservas SET cantidad = greatest(cantidad - i.previsto, 0) WHERE orden_id = t.orden_id AND insumo_id = i.insumo_id;
    n := n + 1;
  END LOOP;
  IF n = 0 THEN RAISE EXCEPTION 'Esta etapa no tiene receta que descontar'; END IF;
  RETURN jsonb_build_object('ok', true, 'insumos', n, 'costo', v_total);
END $$;
REVOKE ALL ON FUNCTION public.registrar_consumo_receta(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.registrar_consumo_receta(uuid) TO authenticated;