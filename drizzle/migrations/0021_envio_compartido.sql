ALTER TABLE public.ordenes ADD COLUMN envio_compartido_con uuid REFERENCES public.ordenes(id);

CREATE OR REPLACE FUNCTION public.compartir_envio(p_orden uuid, p_con uuid, p_compartir boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o ordenes; c ordenes; v_tipo text; v_cargo numeric; f facturas_internas;
BEGIN
  IF NOT rol_en('{administracion}') THEN RAISE EXCEPTION 'Solo Administración puede marcar el envío compartido'; END IF;
  SELECT * INTO o FROM ordenes WHERE id = p_orden FOR UPDATE;
  IF o.id IS NULL THEN RAISE EXCEPTION 'Orden no encontrada'; END IF;
  IF o.estado NOT IN ('borrador','confirmada','en_produccion','lista') THEN RAISE EXCEPTION 'La orden ya no está activa'; END IF;
  v_cargo := _cargo_entrega(o.modo_entrega);
  SELECT * INTO f FROM facturas_internas WHERE orden_id = p_orden AND estado <> 'cancelada' ORDER BY numero DESC LIMIT 1;
  IF p_compartir THEN
    IF o.envio_compartido_con IS NOT NULL THEN RAISE EXCEPTION 'Esta orden ya comparte envío'; END IF;
    SELECT * INTO c FROM ordenes WHERE id = p_con;
    IF c.id IS NULL OR c.id = o.id THEN RAISE EXCEPTION 'Elige otra orden'; END IF;
    IF c.envio_compartido_con IS NOT NULL THEN RAISE EXCEPTION 'La otra orden ya tiene el envío bonificado'; END IF;
    SELECT tipo INTO v_tipo FROM clientes WHERE id = o.cliente_id;
    IF v_tipo <> 'salon' THEN RAISE EXCEPTION 'Solo los pedidos de un salón pueden compartir envío'; END IF;
    IF c.cliente_id <> o.cliente_id THEN RAISE EXCEPTION 'Las dos órdenes deben ser del mismo salón'; END IF;
    IF (o.fecha_entrega AT TIME ZONE _tz())::date <> (c.fecha_entrega AT TIME ZONE _tz())::date THEN RAISE EXCEPTION 'Las dos órdenes deben entregarse el mismo día'; END IF;
    IF o.modo_entrega = 'sucursal' OR c.modo_entrega = 'sucursal' THEN RAISE EXCEPTION 'Las dos órdenes deben ser con entrega a domicilio'; END IF;
    IF c.estado NOT IN ('borrador','confirmada','en_produccion','lista') THEN RAISE EXCEPTION 'La otra orden ya no está activa'; END IF;
    UPDATE ordenes SET envio_compartido_con = c.id, precio = precio - v_cargo, actualizado = now() WHERE id = o.id;
    IF f.id IS NOT NULL THEN
      INSERT INTO factura_renglones (factura_id, concepto, cantidad, importe) VALUES (f.id, 'Envío compartido con orden #' || c.folio, 1, -v_cargo);
      UPDATE facturas_internas SET total = total - v_cargo WHERE id = f.id;
    END IF;
  ELSE
    IF o.envio_compartido_con IS NULL THEN RETURN jsonb_build_object('ok', true); END IF;
    SELECT * INTO c FROM ordenes WHERE id = o.envio_compartido_con;
    UPDATE ordenes SET envio_compartido_con = NULL, precio = precio + v_cargo, actualizado = now() WHERE id = o.id;
    IF f.id IS NOT NULL THEN
      INSERT INTO factura_renglones (factura_id, concepto, cantidad, importe) VALUES (f.id, 'Se quita envío compartido con orden #' || c.folio, 1, v_cargo);
      UPDATE facturas_internas SET total = total + v_cargo, estado = 'emitida', pagada = NULL WHERE id = f.id;
    END IF;
  END IF;
  SELECT * INTO o FROM ordenes WHERE id = p_orden;
  RETURN jsonb_build_object('ok', true, 'precio', o.precio, 'cargo', v_cargo);
END $$;
REVOKE ALL ON FUNCTION public.compartir_envio(uuid, uuid, boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.compartir_envio(uuid, uuid, boolean) TO authenticated;