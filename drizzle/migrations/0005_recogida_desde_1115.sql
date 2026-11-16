CREATE OR REPLACE FUNCTION public._validar_entrega(p_tipo uuid, p_modo public.modo_entrega, p_fecha timestamptz)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_hora time := (p_fecha AT TIME ZONE _tz())::time;
BEGIN
  IF (SELECT requiere_montaje FROM tipos_pastel WHERE id = p_tipo) AND p_modo::text <> 'montaje' THEN
    RAISE EXCEPTION 'Los pasteles de boda requieren montaje ($450)';
  END IF;
  IF p_modo::text = 'sucursal' AND (v_hora < time '11:15' OR v_hora > time '19:00') THEN
    RAISE EXCEPTION 'La sucursal entrega de 11:15 a 19:00';
  END IF;
END $$;