DROP FUNCTION IF EXISTS public.mis_tareas(date, date);
CREATE FUNCTION public.mis_tareas(p_desde date, p_hasta date)
 RETURNS TABLE(id uuid, orden_id uuid, folio integer, etapa text, equipo text, dia date, inicio timestamptz, fin timestamptz, minutos integer, estado text, atrasada boolean, editada_manual boolean, porciones integer, tipo text, sabor text, relleno text, cobertura text, diseno text, descripcion text, fecha_entrega timestamptz, cliente text, bloqueo_etapa text, bloqueo_estado text)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT t.id, t.orden_id, o.folio, t.etapa, e.nombre, t.dia, t.inicio, t.fin, t.minutos,
    t.estado::text, (t.estado <> 'hecha' AND t.fin < now()), t.editada_manual, o.porciones, tp.nombre, s.nombre, r.nombre, c.nombre,
    n.nombre, o.descripcion, o.fecha_entrega, cl.nombre, b.etapa, b.estado::text
  FROM tareas t JOIN ordenes o ON o.id = t.orden_id JOIN equipos e ON e.id = t.equipo_id
  JOIN tipos_pastel tp ON tp.id = o.tipo_id JOIN sabores s ON s.id = o.sabor_id JOIN rellenos r ON r.id = o.relleno_id
  JOIN coberturas c ON c.id = o.cobertura_id JOIN niveles_diseno n ON n.id = o.nivel_id JOIN clientes cl ON cl.id = o.cliente_id
  LEFT JOIN LATERAL (SELECT p.etapa, p.estado FROM tareas p WHERE p.orden_id = t.orden_id AND p.orden_etapa < t.orden_etapa AND p.estado <> 'hecha' ORDER BY p.orden_etapa LIMIT 1) b ON true
  WHERE t.dia BETWEEN p_desde AND p_hasta AND o.estado NOT IN ('cancelada')
    AND (public.rol_en('{administracion,produccion}') OR (public.has_role(auth.uid(),'equipo') AND t.equipo_id = public.mi_equipo()))
  ORDER BY t.inicio
$$;
REVOKE ALL ON FUNCTION public.mis_tareas(date,date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mis_tareas(date,date) TO authenticated;

CREATE OR REPLACE FUNCTION public.verificar_capacidad(p_tipo uuid, p_porciones int, p_sabor uuid, p_relleno uuid, p_cobertura uuid, p_nivel uuid, p_modo modo_entrega, p_fecha timestamptz)
 RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_cli uuid; v_id uuid; v_msg text := null;
BEGIN
  IF NOT rol_en('{administracion,mostrador}') THEN RAISE EXCEPTION 'Sin permiso'; END IF;
  SELECT id INTO v_cli FROM clientes LIMIT 1;
  IF v_cli IS NULL THEN RETURN jsonb_build_object('ok', true, 'motivo', null); END IF;
  BEGIN
    PERFORM _validar_pedido(p_tipo, p_porciones, p_nivel, p_fecha);
    INSERT INTO ordenes (cliente_id, tipo_id, porciones, sabor_id, relleno_id, cobertura_id, nivel_id, modo_entrega, fecha_entrega, precio)
    VALUES (v_cli, p_tipo, p_porciones, p_sabor, p_relleno, p_cobertura, p_nivel, p_modo, p_fecha, 0) RETURNING id INTO v_id;
    PERFORM _planificar(v_id);
    RAISE EXCEPTION USING ERRCODE = 'P0099', MESSAGE = 'simulacion_ok';
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE <> 'P0099' THEN v_msg := SQLERRM; END IF;
  END;
  RETURN jsonb_build_object('ok', v_msg IS NULL, 'motivo', v_msg);
END $$;
REVOKE ALL ON FUNCTION public.verificar_capacidad(uuid,int,uuid,uuid,uuid,uuid,modo_entrega,timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.verificar_capacidad(uuid,int,uuid,uuid,uuid,uuid,modo_entrega,timestamptz) TO authenticated;