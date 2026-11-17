import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { aCSV, descargarArchivo, hoyISO, mxn } from "@/lib/obrador";
import { Pagina, meta } from "@/components/Pagina";
import { Button } from "@/components/ui/button";
import { RangoFechas, useRango, limites, enRango } from "@/components/RangoFechas";

export const Route = createFileRoute("/_authenticated/informes")({
  head: () => meta("Informes", "Ventas, ocupación, merma y rentabilidad"),
  component: Informes,
});

function agrupar<T>(xs: T[], k: (x: T) => string, v: (x: T) => number) {
  const m = new Map<string, number>();
  xs.forEach((x) => m.set(k(x), (m.get(k(x)) ?? 0) + v(x)));
  return [...m.entries()].map(([clave, total]) => ({ clave, total: Math.round(total * 100) / 100 })).sort((a, b) => b.total - a.total);
}

function Informes() {
  const [rango, setRango] = useRango();
  const ocDesde = rango.desde || hoyISO(0);
  const tope = new Date(new Date(ocDesde + "T12:00:00Z").getTime() + 30 * 86400000).toISOString().slice(0, 10);
  const ocHasta = rango.hasta ? (rango.hasta < tope ? rango.hasta : tope) : rango.desde ? tope : hoyISO(13);
  const { data } = useQuery({
    queryKey: ["informes", rango],
    placeholderData: (prev) => prev,
    queryFn: async () => {
      const { ini, fin } = limites(rango);
      let qo = supabase.from("ordenes").select("id, precio, estado, fecha_entrega, sabores(nombre), niveles_diseno(nombre)").not("estado", "in", "(borrador,cancelada)");
      let qm = supabase.from("movimientos_merma").select("motivo, costo, cantidad, creado");
      if (ini) { qo = qo.gte("fecha_entrega", ini); qm = qm.gte("creado", ini); }
      if (fin) { qo = qo.lte("fecha_entrega", fin); qm = qm.lte("creado", fin); }
      const [o, m, r, oc, fe] = await Promise.all([
        qo, qm,
        supabase.rpc("rentabilidad"),
        supabase.rpc("ocupacion", { p_desde: ocDesde, p_hasta: ocHasta }),
        supabase.from("ordenes").select("id, fecha_entrega"),
      ]);
      const fechas = new Map((fe.data ?? []).map((x) => [x.id, x.fecha_entrega]));
      const rent = (r.data ?? []).filter((x) => enRango(fechas.get(x.orden_id), rango) || (!rango.desde && !rango.hasta));
      return { ordenes: o.data ?? [], merma: m.data ?? [], rent, ocup: oc.data ?? [] };
    },
  });
  if (!data) return <p>Cargando…</p>;
  const porSabor = agrupar(data.ordenes, (o) => o.sabores?.nombre ?? "—", (o) => Number(o.precio));
  const porDiseno = agrupar(data.ordenes, (o) => o.niveles_diseno?.nombre ?? "—", (o) => Number(o.precio));
  const merma = agrupar(data.merma, (m) => m.motivo, (m) => Number(m.costo));
  const ocup = agrupar(data.ocup, (x) => x.equipo, (x) => x.usados).map((x) => {
    const cap = data.ocup.filter((o) => o.equipo === x.clave).reduce((a, o) => a + o.capacidad, 0);
    return { equipo: x.clave, usados: x.total, capacidad: cap, ocupacion_pct: cap ? Math.round((x.total / cap) * 100) : 0 };
  });

  const Bloque = ({ t, filas, nombre }: { t: string; filas: Record<string, unknown>[]; nombre: string }) => (
    <section className="rounded-xl border bg-card p-4">
      <div className="mb-2 flex items-center justify-between gap-2"><h2 className="text-xl font-bold">{t}</h2>
        <Button size="sm" variant="outline" className="shrink-0" onClick={() => descargarArchivo(`${nombre}.csv`, aCSV(filas), "text/csv")}>Exportar CSV</Button></div>
      <div className="overflow-x-auto"><table className="w-full min-w-max text-sm"><thead><tr>{Object.keys(filas[0] ?? {}).map((k) => <th key={k} className="border-b py-1 pr-3 text-left capitalize">{k.replace(/_/g, " ")}</th>)}</tr></thead>
        <tbody>{filas.map((f, i) => <tr key={i} className="border-b">{Object.entries(f).map(([k, v]) => <td key={k} className="py-1 pr-3">{typeof v === "number" && /total|precio|costo|margen/.test(k) ? mxn(v) : String(v ?? "")}</td>)}</tr>)}</tbody></table></div>
    </section>
  );

  return (
    <Pagina titulo="Informes" sub="Costo real = insumos a costo de lote + merma + minutos × costo por minuto">
      <RangoFechas valor={rango} cambiar={setRango} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Bloque t="Ventas por sabor" nombre="ventas-sabor" filas={porSabor.map((x) => ({ sabor: x.clave, total: x.total }))} />
        <Bloque t="Ventas por diseño" nombre="ventas-diseno" filas={porDiseno.map((x) => ({ diseno: x.clave, total: x.total }))} />
        <Bloque t={`Ocupación ${ocDesde} a ${ocHasta}`} nombre="ocupacion" filas={ocup} />
        <Bloque t="Merma por motivo" nombre="merma" filas={merma.map((x) => ({ motivo: x.clave, costo: x.total }))} />
      </div>
      <Bloque t="Rentabilidad por orden" nombre="rentabilidad" filas={data.rent.map((r) => ({ folio: r.folio, cliente: r.cliente, estado: r.estado, precio: Number(r.precio), costo_insumos: Number(r.costo_insumos), costo_merma: Number(r.costo_merma), costo_minutos: Number(r.costo_minutos), costo_total: Number(r.costo_total), margen: Number(r.margen) }))} />
    </Pagina>
  );
}
