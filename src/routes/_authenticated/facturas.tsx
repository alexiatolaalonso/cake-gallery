import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { errMsg, fechaHora, mxn } from "@/lib/obrador";
import { Pagina, meta } from "@/components/Pagina";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/facturas")({
  head: () => meta("Facturación interna", "Facturas internas con folio correlativo"),
  component: Facturas,
});

function Facturas() {
  const qc = useQueryClient();
  const { data = [] } = useQuery({
    queryKey: ["facturas"],
    queryFn: async () => (await supabase.from("facturas_internas").select("*, factura_renglones(*), ordenes(folio, clientes(nombre))").order("numero", { ascending: false })).data ?? [],
  });
  const [abierta, setAbierta] = useState<string | null>(null);
  const [motivo, setMotivo] = useState("");
  const f = data.find((x) => x.id === abierta);

  async function run(p: PromiseLike<{ error: unknown }>, ok: string) {
    const { error } = await p;
    if (error) { toast.error(errMsg(error)); return; }
    toast.success(ok); setMotivo(""); qc.invalidateQueries({ queryKey: ["facturas"] });
  }

  return (
    <Pagina titulo="Facturación interna" sub="Folio FI correlativo, sin huecos · no se borran, se cancelan">
      <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
        <ul className="no-print divide-y rounded-xl border bg-card">
          {data.map((x) => (
            <li key={x.id}><button onClick={() => setAbierta(x.id)} className={`flex w-full justify-between px-4 py-2 text-left text-sm hover:bg-muted ${abierta === x.id ? "bg-secondary" : ""}`}>
              <span><b>{x.folio}</b> · #{x.ordenes?.folio} {x.ordenes?.clientes?.nombre}</span>
              <span>{x.estado === "pagada" ? "✓ Pagada" : x.estado === "cancelada" ? "✕ Cancelada" : "○ Emitida"} · {mxn(x.total)}</span>
            </button></li>
          ))}
        </ul>
        {f ? (
          <article className="rounded-xl border bg-card p-6">
            <div className="flex justify-between">
              <div><h2 className="text-2xl font-bold">Factura interna {f.folio}</h2><p className="text-sm text-muted-foreground">Orden #{f.ordenes?.folio} · {f.ordenes?.clientes?.nombre} · {fechaHora(f.emitida)}</p></div>
              <p className="font-bold">{f.estado === "pagada" ? "✓ PAGADA" : f.estado === "cancelada" ? "✕ CANCELADA" : "○ EMITIDA"}</p>
            </div>
            <table className="mt-4 w-full text-sm"><tbody>
              {f.factura_renglones.map((r) => <tr key={r.id} className="border-t"><td className="py-1.5">{r.concepto}</td><td className="py-1.5 text-right">{mxn(r.importe)}</td></tr>)}
              <tr className="border-t-2 font-bold"><td className="py-2">Total</td><td className="py-2 text-right">{mxn(f.total)}</td></tr>
            </tbody></table>
            {f.motivo_cancelacion && <p className="mt-2 text-sm text-destructive">Motivo de cancelación: {f.motivo_cancelacion}</p>}
            <p className="mt-6 rounded border-2 border-dashed border-destructive p-2 text-center font-bold uppercase tracking-wide text-destructive">No es comprobante fiscal</p>
            <div className="no-print mt-4 flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => window.print()}>Imprimir</Button>
              {f.estado === "emitida" && <Button onClick={() => run(supabase.rpc("marcar_factura_pagada", { p_factura: f.id }), "Marcada pagada")}>Marcar pagada</Button>}
              {f.estado !== "cancelada" && <div className="flex gap-2"><Input placeholder="Motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} /><Button variant="destructive" onClick={() => run(supabase.rpc("cancelar_factura", { p_factura: f.id, p_motivo: motivo }), "Factura cancelada")}>Cancelar con motivo</Button></div>}
            </div>
          </article>
        ) : <p className="text-muted-foreground">Elige una factura.</p>}
      </div>
    </Pagina>
  );
}
