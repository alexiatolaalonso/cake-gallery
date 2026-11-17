CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_rol app_role; v_equipo uuid;
BEGIN
  v_rol := CASE lower(NEW.email)
    WHEN 'admin@obrador.test' THEN 'administracion'
    WHEN 'mostrador@obrador.test' THEN 'mostrador'
    WHEN 'produccion@obrador.test' THEN 'produccion'
    ELSE 'equipo' END;
  IF lower(NEW.email) = 'equipo@obrador.test' THEN SELECT id INTO v_equipo FROM equipos WHERE etapa = 'decoracion';
  ELSIF lower(NEW.email) = 'armado@obrador.test' THEN SELECT id INTO v_equipo FROM equipos WHERE etapa = 'armado';
  ELSIF lower(NEW.email) = 'horno@obrador.test' THEN SELECT id INTO v_equipo FROM equipos WHERE etapa = 'horneado';
  END IF;
  INSERT INTO usuarios (user_id, nombre, correo, equipo_id)
  VALUES (NEW.id, coalesce(NEW.raw_user_meta_data->>'nombre', split_part(NEW.email,'@',1)), NEW.email, v_equipo);
  INSERT INTO user_roles (user_id, role) VALUES (NEW.id, v_rol);
  RETURN NEW;
END $function$;