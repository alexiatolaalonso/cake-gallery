
CREATE TYPE public.app_role AS ENUM ('administracion','mostrador','produccion','equipo');
CREATE TYPE public.estado_orden AS ENUM ('borrador','confirmada','en_produccion','lista','entregada','cancelada');
CREATE TYPE public.estado_tarea AS ENUM ('pendiente','en_curso','hecha');
CREATE TYPE public.modo_entrega AS ENUM ('sucursal','zona','montaje');
CREATE TYPE public.metodo_pago AS ENUM ('efectivo','transferencia','tarjeta');
CREATE TYPE public.tipo_componente AS ENUM ('sabor','relleno','cobertura');

-- EQUIPOS
CREATE TABLE public.equipos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  etapa text NOT NULL UNIQUE,
  orden_etapa int NOT NULL,
  personas int NOT NULL DEFAULT 1,
  minutos_diarios int NOT NULL,
  hora_inicio time NOT NULL DEFAULT '07:00',
  hora_fin time NOT NULL DEFAULT '15:00',
  costo_minuto numeric(10,2) NOT NULL DEFAULT 1.60
);

-- USUARIOS / ROLES
CREATE TABLE public.usuarios (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nombre text NOT NULL,
  correo text,
  equipo_id uuid REFERENCES public.equipos(id),
  creado timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  role public.app_role NOT NULL
);

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;
CREATE OR REPLACE FUNCTION public.mi_rol()
RETURNS public.app_role LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM public.user_roles WHERE user_id = auth.uid()
$$;
CREATE OR REPLACE FUNCTION public.rol_en(_roles public.app_role[])
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = ANY(_roles))
$$;
CREATE OR REPLACE FUNCTION public.mi_equipo()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT equipo_id FROM public.usuarios WHERE user_id = auth.uid()
$$;

-- CATÁLOGO
CREATE TABLE public.clientes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  correo text,
  telefono text,
  tipo text NOT NULL DEFAULT 'particular' CHECK (tipo IN ('particular','empresa','frecuente')),
  creado timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.tipos_pastel (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL UNIQUE,
  precio_base numeric(10,2) NOT NULL,
  min_porciones int NOT NULL,
  max_porciones int NOT NULL,
  pisos int NOT NULL DEFAULT 1,
  escultorico boolean NOT NULL DEFAULT false
);
CREATE TABLE public.sabores (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), nombre text NOT NULL UNIQUE, recargo numeric(10,2) NOT NULL DEFAULT 0);
CREATE TABLE public.rellenos (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), nombre text NOT NULL UNIQUE, recargo numeric(10,2) NOT NULL DEFAULT 0);
CREATE TABLE public.coberturas (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), nombre text NOT NULL UNIQUE, recargo numeric(10,2) NOT NULL DEFAULT 0);
CREATE TABLE public.niveles_diseno (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL UNIQUE,
  recargo numeric(10,2) NOT NULL DEFAULT 0,
  minutos_por_10 int NOT NULL,
  dias_plazo int NOT NULL
);
CREATE TABLE public.insumos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL UNIQUE,
  unidad text NOT NULL,
  costo numeric(10,4) NOT NULL
);
CREATE TABLE public.recetas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  componente public.tipo_componente NOT NULL,
  componente_id uuid NOT NULL,
  insumo_id uuid NOT NULL REFERENCES public.insumos(id),
  cantidad_por_10 numeric(10,3) NOT NULL CHECK (cantidad_por_10 > 0),
  UNIQUE (componente, componente_id, insumo_id)
);
COMMENT ON COLUMN public.recetas.cantidad_por_10 IS 'Incluye 5% de merma prevista';

-- INVENTARIO
CREATE TABLE public.lotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  insumo_id uuid NOT NULL REFERENCES public.insumos(id),
  codigo text NOT NULL,
  cantidad numeric(12,3) NOT NULL CHECK (cantidad >= 0),
  disponible numeric(12,3) NOT NULL CHECK (disponible >= 0),
  costo numeric(10,4) NOT NULL,
  caducidad date NOT NULL,
  recibido timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.compras (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  insumo_id uuid NOT NULL REFERENCES public.insumos(id),
  cantidad numeric(12,3) NOT NULL CHECK (cantidad > 0),
  costo numeric(10,4) NOT NULL,
  fecha_llegada date NOT NULL,
  caducidad date,
  estado text NOT NULL DEFAULT 'en_camino' CHECK (estado IN ('en_camino','recibida','cancelada')),
  creado timestamptz NOT NULL DEFAULT now()
);

-- ÓRDENES
CREATE SEQUENCE public.ordenes_folio_seq START 1001;
CREATE TABLE public.ordenes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  folio int NOT NULL UNIQUE DEFAULT nextval('public.ordenes_folio_seq'),
  cliente_id uuid NOT NULL REFERENCES public.clientes(id),
  tipo_id uuid NOT NULL REFERENCES public.tipos_pastel(id),
  porciones int NOT NULL CONSTRAINT porciones_multiplo_10 CHECK (porciones >= 10 AND porciones % 10 = 0),
  sabor_id uuid NOT NULL REFERENCES public.sabores(id),
  relleno_id uuid NOT NULL REFERENCES public.rellenos(id),
  cobertura_id uuid NOT NULL REFERENCES public.coberturas(id),
  nivel_id uuid NOT NULL REFERENCES public.niveles_diseno(id),
  modo_entrega public.modo_entrega NOT NULL DEFAULT 'sucursal',
  direccion text,
  fecha_entrega timestamptz NOT NULL,
  descripcion text,
  estado public.estado_orden NOT NULL DEFAULT 'borrador',
  precio numeric(12,2) NOT NULL DEFAULT 0,
  recargo_urgencia numeric(12,2) NOT NULL DEFAULT 0,
  entrega_autorizada_motivo text,
  creado_por uuid,
  creado timestamptz NOT NULL DEFAULT now(),
  actualizado timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.cotizaciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  orden_id uuid NOT NULL REFERENCES public.ordenes(id) ON DELETE CASCADE,
  precio numeric(12,2) NOT NULL,
  detalle jsonb NOT NULL DEFAULT '{}',
  estado text NOT NULL DEFAULT 'borrador' CHECK (estado IN ('borrador','enviada','aceptada','reemplazada','cancelada')),
  creado timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.tareas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  orden_id uuid NOT NULL REFERENCES public.ordenes(id) ON DELETE CASCADE,
  equipo_id uuid NOT NULL REFERENCES public.equipos(id),
  etapa text NOT NULL,
  orden_etapa int NOT NULL,
  dia date NOT NULL,
  inicio timestamptz NOT NULL,
  fin timestamptz NOT NULL,
  minutos int NOT NULL,
  estado public.estado_tarea NOT NULL DEFAULT 'pendiente',
  editada_manual boolean NOT NULL DEFAULT false,
  iniciada_en timestamptz,
  finalizada_en timestamptz,
  CHECK (fin > inicio)
);
CREATE INDEX ON public.tareas (equipo_id, dia);
CREATE TABLE public.reservas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  orden_id uuid NOT NULL REFERENCES public.ordenes(id) ON DELETE CASCADE,
  insumo_id uuid NOT NULL REFERENCES public.insumos(id),
  cantidad numeric(12,3) NOT NULL,
  necesaria_para timestamptz NOT NULL,
  UNIQUE (orden_id, insumo_id)
);
CREATE TABLE public.consumos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tarea_id uuid NOT NULL REFERENCES public.tareas(id),
  orden_id uuid NOT NULL REFERENCES public.ordenes(id),
  lote_id uuid NOT NULL REFERENCES public.lotes(id),
  insumo_id uuid NOT NULL REFERENCES public.insumos(id),
  cantidad numeric(12,3) NOT NULL,
  costo numeric(12,2) NOT NULL,
  creado timestamptz NOT NULL DEFAULT now(),
  creado_por uuid
);
CREATE TABLE public.movimientos_merma (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  insumo_id uuid NOT NULL REFERENCES public.insumos(id),
  lote_id uuid REFERENCES public.lotes(id),
  orden_id uuid REFERENCES public.ordenes(id),
  tarea_id uuid REFERENCES public.tareas(id),
  cantidad numeric(12,3) NOT NULL,
  costo numeric(12,2) NOT NULL,
  motivo text NOT NULL,
  creado timestamptz NOT NULL DEFAULT now(),
  creado_por uuid
);

-- FACTURACIÓN / COBROS
CREATE TABLE public.folios (serie text PRIMARY KEY, ultimo int NOT NULL);
INSERT INTO public.folios VALUES ('FI', 0);
CREATE TABLE public.facturas_internas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero int NOT NULL UNIQUE,
  folio text GENERATED ALWAYS AS ('FI-' || lpad(numero::text, 4, '0')) STORED,
  orden_id uuid NOT NULL REFERENCES public.ordenes(id),
  estado text NOT NULL DEFAULT 'emitida' CHECK (estado IN ('emitida','pagada','cancelada')),
  total numeric(12,2) NOT NULL DEFAULT 0,
  motivo_cancelacion text,
  emitida timestamptz NOT NULL DEFAULT now(),
  pagada timestamptz
);
CREATE TABLE public.factura_renglones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  factura_id uuid NOT NULL REFERENCES public.facturas_internas(id),
  concepto text NOT NULL,
  cantidad numeric(10,2) NOT NULL DEFAULT 1,
  importe numeric(12,2) NOT NULL
);
CREATE TABLE public.cobros (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  orden_id uuid NOT NULL REFERENCES public.ordenes(id),
  tipo text NOT NULL CHECK (tipo IN ('anticipo','saldo','reembolso')),
  metodo public.metodo_pago NOT NULL,
  monto numeric(12,2) NOT NULL,
  clave_idempotencia text,
  creado timestamptz NOT NULL DEFAULT now(),
  creado_por uuid,
  UNIQUE (orden_id, clave_idempotencia)
);

-- CAPACIDAD
CREATE TABLE public.capacidad_dia (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha date NOT NULL,
  equipo_id uuid NOT NULL REFERENCES public.equipos(id),
  sin_capacidad boolean NOT NULL DEFAULT false,
  minutos_extra int NOT NULL DEFAULT 0,
  motivo text,
  autorizado_por uuid,
  UNIQUE (fecha, equipo_id)
);

-- GRANTS
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT USAGE ON SEQUENCE public.ordenes_folio_seq TO authenticated, service_role;
REVOKE DELETE ON public.facturas_internas, public.factura_renglones FROM authenticated;

-- RLS
DO $$ DECLARE t text; BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname='public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;

-- Lectura de catálogo sin costos: todos los roles
CREATE POLICY cat_leer ON public.tipos_pastel FOR SELECT TO authenticated USING (public.mi_rol() IS NOT NULL);
CREATE POLICY cat_leer ON public.sabores FOR SELECT TO authenticated USING (public.mi_rol() IS NOT NULL);
CREATE POLICY cat_leer ON public.rellenos FOR SELECT TO authenticated USING (public.mi_rol() IS NOT NULL);
CREATE POLICY cat_leer ON public.coberturas FOR SELECT TO authenticated USING (public.mi_rol() IS NOT NULL);
CREATE POLICY cat_leer ON public.niveles_diseno FOR SELECT TO authenticated USING (public.mi_rol() IS NOT NULL);
-- Admin escribe catálogo
CREATE POLICY cat_admin ON public.tipos_pastel FOR ALL TO authenticated USING (public.has_role(auth.uid(),'administracion')) WITH CHECK (public.has_role(auth.uid(),'administracion'));
CREATE POLICY cat_admin ON public.sabores FOR ALL TO authenticated USING (public.has_role(auth.uid(),'administracion')) WITH CHECK (public.has_role(auth.uid(),'administracion'));
CREATE POLICY cat_admin ON public.rellenos FOR ALL TO authenticated USING (public.has_role(auth.uid(),'administracion')) WITH CHECK (public.has_role(auth.uid(),'administracion'));
CREATE POLICY cat_admin ON public.coberturas FOR ALL TO authenticated USING (public.has_role(auth.uid(),'administracion')) WITH CHECK (public.has_role(auth.uid(),'administracion'));
CREATE POLICY cat_admin ON public.niveles_diseno FOR ALL TO authenticated USING (public.has_role(auth.uid(),'administracion')) WITH CHECK (public.has_role(auth.uid(),'administracion'));

-- Datos con costos: administración y producción (no equipo, no mostrador salvo lectura de equipos)
CREATE POLICY costos_leer ON public.insumos FOR SELECT TO authenticated USING (public.rol_en('{administracion,produccion}'));
CREATE POLICY costos_admin ON public.insumos FOR ALL TO authenticated USING (public.has_role(auth.uid(),'administracion')) WITH CHECK (public.has_role(auth.uid(),'administracion'));
CREATE POLICY recetas_leer ON public.recetas FOR SELECT TO authenticated USING (public.rol_en('{administracion,produccion}'));
CREATE POLICY recetas_admin ON public.recetas FOR ALL TO authenticated USING (public.has_role(auth.uid(),'administracion')) WITH CHECK (public.has_role(auth.uid(),'administracion'));
CREATE POLICY lotes_leer ON public.lotes FOR SELECT TO authenticated USING (public.rol_en('{administracion,produccion}'));
CREATE POLICY lotes_escribir ON public.lotes FOR INSERT TO authenticated WITH CHECK (public.rol_en('{administracion,produccion}'));
CREATE POLICY compras_leer ON public.compras FOR SELECT TO authenticated USING (public.rol_en('{administracion,produccion}'));
CREATE POLICY compras_insert ON public.compras FOR INSERT TO authenticated WITH CHECK (public.rol_en('{administracion,produccion}'));
CREATE POLICY compras_update ON public.compras FOR UPDATE TO authenticated USING (public.rol_en('{administracion,produccion}'));
CREATE POLICY equipos_leer ON public.equipos FOR SELECT TO authenticated USING (public.rol_en('{administracion,produccion,mostrador}'));
CREATE POLICY equipos_admin ON public.equipos FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'administracion'));
CREATE POLICY capacidad_leer ON public.capacidad_dia FOR SELECT TO authenticated USING (public.rol_en('{administracion,produccion,mostrador}'));

-- Usuarios / roles
CREATE POLICY usuarios_propio ON public.usuarios FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(),'administracion'));
CREATE POLICY roles_propio ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(),'administracion'));

-- Clientes y órdenes: mostrador, producción (lectura), admin
CREATE POLICY clientes_leer ON public.clientes FOR SELECT TO authenticated USING (public.rol_en('{administracion,mostrador,produccion}'));
CREATE POLICY clientes_escribir ON public.clientes FOR INSERT TO authenticated WITH CHECK (public.rol_en('{administracion,mostrador}'));
CREATE POLICY clientes_editar ON public.clientes FOR UPDATE TO authenticated USING (public.rol_en('{administracion,mostrador}'));
CREATE POLICY ordenes_leer ON public.ordenes FOR SELECT TO authenticated USING (public.rol_en('{administracion,mostrador,produccion}'));
CREATE POLICY ordenes_borrador_ins ON public.ordenes FOR INSERT TO authenticated WITH CHECK (public.rol_en('{administracion,mostrador}') AND estado = 'borrador');
CREATE POLICY ordenes_borrador_upd ON public.ordenes FOR UPDATE TO authenticated USING (public.rol_en('{administracion,mostrador}') AND estado = 'borrador') WITH CHECK (estado = 'borrador');
CREATE POLICY ordenes_borrador_del ON public.ordenes FOR DELETE TO authenticated USING (public.rol_en('{administracion,mostrador}') AND estado = 'borrador');
CREATE POLICY cotiz_leer ON public.cotizaciones FOR SELECT TO authenticated USING (public.rol_en('{administracion,mostrador}'));
CREATE POLICY cotiz_ins ON public.cotizaciones FOR INSERT TO authenticated WITH CHECK (public.rol_en('{administracion,mostrador}'));
CREATE POLICY tareas_leer ON public.tareas FOR SELECT TO authenticated USING (public.rol_en('{administracion,mostrador,produccion}') OR (public.has_role(auth.uid(),'equipo') AND equipo_id = public.mi_equipo()));
CREATE POLICY reservas_leer ON public.reservas FOR SELECT TO authenticated USING (public.rol_en('{administracion,produccion}'));
CREATE POLICY consumos_leer ON public.consumos FOR SELECT TO authenticated USING (public.rol_en('{administracion,produccion}'));
CREATE POLICY merma_leer ON public.movimientos_merma FOR SELECT TO authenticated USING (public.rol_en('{administracion,produccion}'));

-- Dinero: administración y mostrador
CREATE POLICY facturas_leer ON public.facturas_internas FOR SELECT TO authenticated USING (public.rol_en('{administracion,mostrador}'));
CREATE POLICY renglones_leer ON public.factura_renglones FOR SELECT TO authenticated USING (public.rol_en('{administracion,mostrador}'));
CREATE POLICY cobros_leer ON public.cobros FOR SELECT TO authenticated USING (public.rol_en('{administracion,mostrador}'));
-- folios: sin políticas (solo funciones)

-- Facturas no borrables
CREATE OR REPLACE FUNCTION public.no_borrar_factura() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Las facturas internas no se pueden borrar; cancélala con motivo'; END $$;
CREATE TRIGGER no_borrar_factura BEFORE DELETE ON public.facturas_internas FOR EACH ROW EXECUTE FUNCTION public.no_borrar_factura();
CREATE TRIGGER no_borrar_renglon BEFORE DELETE ON public.factura_renglones FOR EACH ROW EXECUTE FUNCTION public.no_borrar_factura();
