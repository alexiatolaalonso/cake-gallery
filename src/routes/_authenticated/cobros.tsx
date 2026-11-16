import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fechaHora, mxn } from "@/lib/obrador";
import { Pagina, meta } from "@/components/Pagina";

export const Route = createFileRoute("/_authenticated/cobros")({
  head: () => meta("Cobros", "Anticipos, saldos y devoluciones"),
  component: Cobros,
});

function Cobros() {
  const { data } = useQuery({
    queryKey: ["cobros"],
    queryFn: async () => {
      const [c, o] = await Promise.all([
        supabase.from("cobros").select("*, ordenes(folio, clientes(nombre))").order("creado", { ascending: false }),
        supabase.from("ordenes").select("id, folio, precio, estado, fecha_entrega, clientes(nombre), cobros(monto)").in("estado", ["confirmada", "en_produccion", "lista"]).order("fecha_entrega"),
      ]);
      return { cobros: c.data ?? [], ordenes: o.data ?? [] };
    },
  });
  if (!data) return <p>Cargando…</p>;
  const tot = (m: string) => data.cobros.filter((c) => c.metodo === m && c.tipo !== "reembolso").reduce((a, c) => a + Number(c.monto), 0);
  const saldos = data.ordenes.map((o) => ({ ...o, saldo: Number(o.precio) - o.cobros.reduce((a, c) => a + Number(c.monto), 0) })).filter((o) => o.saldo > 0.005);
  return (
    <Pagina titulo="Cobros" sub="Efectivo, transferencia y tarjeta · anticipo 50% y saldo">
      <div className="grid gap-4 sm:grid-cols-3">
        {(["efectivo", "transferencia", "tarjeta"] as const).map((m) => (
          <div key={m} className="rounded-xl border bg-card p-4"><p className="text-sm capitalize text-muted-foreground">{m}</p><p className="font-display text-3xl font-bold">{mxn(tot(m))}</p></div>
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border bg-card p-4">
          <h2 className="mb-2 text-xl font-bold">Saldos pendientes</h2>
          <ul className="divide-y text-sm">{saldos.map((o) => (
            <li key={o.id} className="flex justify-between py-1.5"><Link to="/ordenes/$id" params={{ id: o.id }} className="underline">#{o.folio} {o.clientes?.nombre} · {fechaHora(o.fecha_entrega)}</Link><b className="text-destructive">⚠ {mxn(o.saldo)}</b></li>
          ))}{!saldos.length && <li className="py-2 text-muted-foreground">Sin saldos pendientes</li>}</ul>
        </section>
        <section className="rounded-xl border bg-card p-4">
          <h2 className="mb-2 text-xl font-bold">Movimientos</h2>
          <ul className="max-h-[500px] divide-y overflow-auto text-sm">{data.cobros.map((c) => (
            <li key={c.id} className="flex justify-between py-1.5"><span>#{c.ordenes?.folio} · {c.tipo} · {c.metodo} · <span className="text-muted-foreground">{fechaHora(c.creado)}</span></span><b>{mxn(c.monto)}</b></li>
          ))}</ul>
        </section>
      </div>
    </Pagina>
  );
}
