import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { errMsg, fecha, mxn } from "@/lib/obrador";
import { Pagina, meta } from "@/components/Pagina";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/inventario")({
  head: () => meta("Inventario y compras", "Lotes con caducidad, reservas y compras en camino"),
  component: Inventario,
});

function Inventario() {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["inventario"],
    queryFn: async () => {
      const [ins, lotes, res, comp] = await Promise.all([
        supabase.from("insumos").select("*").order("nombre"),
        supabase.from("lotes").select("*").gt("disponible", 0).order("caducidad"),
        supabase.from("reservas").select("insumo_id, cantidad"),
        supabase.from("compras").select("*").order("fecha_llegada"),
      ]);
      return { ins: ins.data ?? [], lotes: lotes.data ?? [], res: res.data ?? [], comp: comp.data ?? [] };
    },
  });
  const [nc, setNc] = useState({ insumo: "", cantidad: 0, fecha: "" });
  if (!data) return <p>Cargando…</p>;
  const hoy = new Date().toLocaleDateString("en-CA");
  const nombre = (id: string) => data.ins.find((i) => i.id === id);

  async function run(p: PromiseLike<{ error: unknown; data?: unknown }>, ok: string) {
    const { error } = await p;
    if (error) { toast.error(errMsg(error)); return; }
    toast.success(ok); qc.invalidateQueries({ queryKey: ["inventario"] });
  }

  return (
    <Pagina titulo="Inventario y compras" sub="Se consume primero el lote de caducidad más próxima"
      acciones={<Button variant="outline" onClick={() => run(supabase.rpc("caducar_lotes"), "Lotes caducados pasados a merma")}>Pasar caducados a merma</Button>}>
      <section className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full min-w-max text-sm">
          <thead className="bg-secondary text-left"><tr>{["Insumo", "Disponible", "Reservado", "Libre", "En camino", "Costo"].map((h) => <th key={h} className="px-3 py-2">{h}</th>)}</tr></thead>
          <tbody>{data.ins.map((i) => {
            const disp = data.lotes.filter((l) => l.insumo_id === i.id && l.caducidad >= hoy).reduce((a, l) => a + Number(l.disponible), 0);
            const resv = data.res.filter((r) => r.insumo_id === i.id).reduce((a, r) => a + Number(r.cantidad), 0);
            const cam = data.comp.filter((c) => c.insumo_id === i.id && c.estado === "en_camino").reduce((a, c) => a + Number(c.cantidad), 0);
            const libre = disp - resv;
            return (<tr key={i.id} className="border-t">
              <td className="px-3 py-2 font-bold">{i.nombre}</td><td className="px-3 py-2">{disp.toFixed(2)} {i.unidad}</td><td className="px-3 py-2">{resv.toFixed(2)}</td>
              <td className={`px-3 py-2 font-bold ${libre < 0 ? "text-destructive" : ""}`}>{libre < 0 ? "⚠ " : ""}{libre.toFixed(2)}</td><td className="px-3 py-2">{cam ? cam.toFixed(2) : "—"}</td><td className="px-3 py-2">{mxn(i.costo)}/{i.unidad}</td>
            </tr>);
          })}</tbody>
        </table>
      </section>
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border bg-card p-4">
          <h2 className="mb-2 text-xl font-bold">Lotes</h2>
          <ul className="max-h-[480px] divide-y overflow-auto text-sm">
            {data.lotes.map((l) => { const v = l.caducidad < hoy; const prox = !v && (new Date(l.caducidad).getTime() - Date.now()) < 7 * 864e5; return (
              <li key={l.id} className="flex justify-between gap-2 py-1.5">
                <span>{nombre(l.insumo_id)?.nombre} · <span className="text-muted-foreground">{l.codigo}</span></span>
                <span>{Number(l.disponible).toFixed(2)} {nombre(l.insumo_id)?.unidad} · <b className={v ? "text-destructive" : prox ? "text-gold" : ""}>{v ? "⊘ Caducado " : prox ? "◑ Caduca " : ""}{fecha(l.caducidad)}</b></span>
              </li>); })}
          </ul>
        </section>
        <section className="space-y-3 rounded-xl border bg-card p-4">
          <h2 className="text-xl font-bold">Compras</h2>
          <div className="grid gap-2 sm:grid-cols-4">
            <select className="h-10 rounded-md border bg-card px-2 text-sm sm:col-span-2" value={nc.insumo} onChange={(e) => setNc({ ...nc, insumo: e.target.value })}>
              <option value="">Insumo…</option>{data.ins.map((i) => <option key={i.id} value={i.id}>{i.nombre}</option>)}
            </select>
            <Input type="number" placeholder="Cantidad" value={nc.cantidad || ""} onChange={(e) => setNc({ ...nc, cantidad: Number(e.target.value) })} />
            <Input type="date" value={nc.fecha} onChange={(e) => setNc({ ...nc, fecha: e.target.value })} />
          </div>
          <Button disabled={!nc.insumo || !nc.cantidad || !nc.fecha} onClick={() => run(supabase.from("compras").insert({ insumo_id: nc.insumo, cantidad: nc.cantidad, fecha_llegada: nc.fecha, costo: nombre(nc.insumo)?.costo ?? 0 }), "Compra registrada")}>Registrar compra en camino</Button>
          <ul className="divide-y text-sm">
            {data.comp.map((c) => (
              <li key={c.id} className="flex items-center justify-between py-1.5">
                <span>{nombre(c.insumo_id)?.nombre} · {c.cantidad} {nombre(c.insumo_id)?.unidad} · llega {fecha(c.fecha_llegada)}</span>
                {c.estado === "en_camino" ? <Button size="sm" variant="outline" onClick={() => run(supabase.rpc("recibir_compra", { p_compra: c.id }), "Compra recibida como lote")}>Recibir</Button> : <span className="text-muted-foreground">✓ {c.estado}</span>}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </Pagina>
  );
}
