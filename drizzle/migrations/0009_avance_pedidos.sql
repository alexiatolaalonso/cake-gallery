CREATE OR REPLACE FUNCTION public.avance_pedidos(p_ordenes uuid[])
RETURNS TABLE(orden_id uuid, etapa text, orden_etapa integer, estado text, equipo text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT t.orden_id, t.etapa, t.orden_etapa, t.estado::text, e.nombre
  FROM tareas t JOIN equipos e ON e.id = t.equipo_id
  WHERE t.orden_id = ANY(p_ordenes)
    AND (public.rol_en('{administracion,produccion}')
      OR (public.has_role(auth.uid(),'equipo') AND EXISTS (SELECT 1 FROM tareas m WHERE m.orden_id = t.orden_id AND m.equipo_id = public.mi_equipo())))
  ORDER BY t.orden_id, t.orden_etapa
$$;
REVOKE ALL ON FUNCTION public.avance_pedidos(uuid[]) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.avance_pedidos(uuid[]) TO authenticated;