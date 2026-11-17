import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { estadoOrden, fechaHora, mxn } from "@/lib/obrador";
import { EstadoBadge } from "@/components/EstadoBadge";
import { EnRiesgo } from "@/components/EnRiesgo";
import { Pagina, meta } from "@/components/Pagina";

export const Route = createFileRoute("/_authenticated/ordenes/")({
  head: () => meta("Órdenes", "Listado de órdenes por estado"),
  component: Ordenes,
});

function Ordenes() {
  const [estado, setEstado] = useState<string>("activas");
  const { data = [], isLoading } = useQuery({
    queryKey: ["ordenes", estado],
    queryFn: async () => {
      let q = supabase.from("ordenes").select("id, folio, porciones, fecha_entrega, estado, precio, modo_entrega, clientes(nombre), tipos_pastel(nombre), sabores(nombre), niveles_diseno(nombre)").order("fecha_entrega");
      if (estado === "activas") q = q.in("estado", ["confirmada", "en_produccion", "lista"]);
      else if (estado !== "todas") q = q.eq("estado", estado as "borrador");
      return (await q).data ?? [];
    },
  });
  return (
    <Pagina titulo="Órdenes" sub="Filtra por estado y abre la ficha">
      <div className="flex flex-wrap gap-2">
        {["activas", ...Object.keys(estadoOrden), "todas"].map((e) => (
          <button key={e} onClick={() => setEstado(e)} aria-pressed={estado === e}
            className={`rounded-full border px-3 py-1 text-sm ${estado === e ? "bg-primary text-primary-foreground" : "bg-card"}`}>
            {estadoOrden[e]?.label ?? (e === "activas" ? "Activas" : "Todas")}
          </button>
        ))}
      </div>
      {isLoading ? <p>Cargando…</p> : (<>
        {/* Móvil: tarjetas apiladas con todo visible sin desplazar */}
        <ul className="space-y-3 md:hidden">
          {data.map((o) => (
            <li key={o.id}>
              <Link to="/ordenes/$id" params={{ id: o.id }} className="block rounded-xl border bg-card p-4 active:bg-muted">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold">#{o.folio} · {o.clientes?.nombre}</span>
                  <span className="flex flex-wrap justify-end gap-1"><EnRiesgo orden={o.id} /><EstadoBadge estado={o.estado} /></span>
                </div>
                <p className="mt-1 text-sm">{o.tipos_pastel?.nombre} · {o.porciones} porc. · {o.sabores?.nombre} · {o.niveles_diseno?.nombre}</p>
                <p className="mt-1 flex justify-between text-sm"><span>{fechaHora(o.fecha_entrega)} <span className="text-muted-foreground">({o.modo_entrega})</span></span><b>{mxn(o.precio)}</b></p>
              </Link>
            </li>
          ))}
          {!data.length && <li className="rounded-xl border bg-card px-4 py-8 text-center text-muted-foreground">Sin órdenes en este estado</li>}
        </ul>
        {/* Escritorio: tabla */}
        <div className="hidden overflow-x-auto rounded-xl border bg-card md:block">
          <table className="w-full text-sm">
            <thead className="bg-secondary text-left"><tr>{["Folio", "Cliente", "Pastel", "Entrega", "Estado", "Precio"].map((h) => <th key={h} className="px-4 py-2">{h}</th>)}</tr></thead>
            <tbody>
              {data.map((o) => (
                <tr key={o.id} className="border-t hover:bg-muted">
                  <td className="px-4 py-2 font-bold"><Link to="/ordenes/$id" params={{ id: o.id }} className="underline">#{o.folio}</Link></td>
                  <td className="px-4 py-2">{o.clientes?.nombre}</td>
                  <td className="px-4 py-2">{o.tipos_pastel?.nombre} · {o.porciones} porc. · {o.sabores?.nombre} · {o.niveles_diseno?.nombre}</td>
                  <td className="px-4 py-2">{fechaHora(o.fecha_entrega)} <span className="text-muted-foreground">({o.modo_entrega})</span></td>
                  <td className="px-4 py-2"><span className="flex flex-wrap gap-1"><EstadoBadge estado={o.estado} /><EnRiesgo orden={o.id} /></span></td>
                  <td className="px-4 py-2">{mxn(o.precio)}</td>
                </tr>
              ))}
              {!data.length && <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">Sin órdenes en este estado</td></tr>}
            </tbody>
          </table>
        </div>
      </>)}
    </Pagina>
  );
}
