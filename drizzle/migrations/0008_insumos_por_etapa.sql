CREATE OR REPLACE FUNCTION public.insumos_tarea(p_tarea uuid)
RETURNS TABLE(insumo_id uuid, nombre text, unidad text, previsto numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE t tareas; v_comp tipo_componente;
BEGIN
  t := _puede_tarea(p_tarea);
  v_comp := CASE t.etapa WHEN 'horneado' THEN 'sabor'::tipo_componente
                         WHEN 'relleno' THEN 'relleno'::tipo_componente
                         WHEN 'armado' THEN 'relleno'::tipo_componente
                         WHEN 'cobertura' THEN 'cobertura'::tipo_componente END;
  IF v_comp IS NULL THEN RETURN; END IF;
  RETURN QUERY
    SELECT r.insumo_id, i.nombre, i.unidad, round(sum(r.cantidad_por_10 * o.porciones / 10.0), 3)
    FROM ordenes o
    JOIN recetas r ON r.componente = v_comp AND r.componente_id = CASE v_comp WHEN 'sabor' THEN o.sabor_id WHEN 'relleno' THEN o.relleno_id ELSE o.cobertura_id END
    JOIN insumos i ON i.id = r.insumo_id
    WHERE o.id = t.orden_id
    GROUP BY r.insumo_id, i.nombre, i.unidad ORDER BY i.nombre;
END $$;