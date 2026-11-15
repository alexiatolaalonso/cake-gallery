import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const catalogoQuery = queryOptions({
  queryKey: ["catalogo"],
  queryFn: async () => {
    const [tipos, sabores, rellenos, coberturas, niveles] = await Promise.all([
      supabase.from("tipos_pastel").select("*").order("precio_base"),
      supabase.from("sabores").select("*").order("nombre"),
      supabase.from("rellenos").select("*").order("nombre"),
      supabase.from("coberturas").select("*").order("nombre"),
      supabase.from("niveles_diseno").select("*").order("dias_plazo"),
    ]);
    return { tipos: tipos.data ?? [], sabores: sabores.data ?? [], rellenos: rellenos.data ?? [], coberturas: coberturas.data ?? [], niveles: niveles.data ?? [] };
  },
});

export const clientesQuery = queryOptions({
  queryKey: ["clientes"],
  queryFn: async () => (await supabase.from("clientes").select("*").order("nombre")).data ?? [],
});
