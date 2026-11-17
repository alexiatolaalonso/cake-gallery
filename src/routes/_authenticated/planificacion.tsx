import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { errMsg, fecha, hoyISO, sesionQuery } from "@/lib/obrador";
import { CapacidadBadge } from "@/components/EstadoBadge";
import { Pagina, meta } from "@/components/Pagina";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/planificacion")({
  head: () => meta("Planificación por capacidad", "Calendario de minutos por día y equipo"),
  component: Planificacion,
});
type Celda = { fecha: string; equipo_id: string; equipo: string; usados: number; capacidad: number; sin_capacidad: boolean; autorizado: boolean; motivo: string | null; estado: string };

function Planificacion() {
  const qc = useQueryClient();
  const { data: s } = useQuery(sesionQuery);
  const edita = s?.rol === "administracion" || s?.rol === "produccion";
  const [inicio, setInicio] = useState(0);
  const { data = [] } = useQuery({
    queryKey: ["ocupacion", inicio],
    queryFn: async () => ((await supabase.rpc("ocupacion", { p_desde: hoyISO(inicio), p_hasta: hoyISO(inicio + 13) })).data ?? []) as Celda[],
  });
  const [sel, setSel] = useState<Celda | null>(null);
  const [extra, setExtra] = useState({ minutos: 120, motivo: "" });
  const fechas = [...new Set(data.map((d) => d.fecha))];
  const equipos = [...new Map(data.map((d) => [d.equipo_id, d.equipo])).entries()];
  const celda = (f: string, e: string) => data.find((d) => d.fecha === f && d.equipo_id === e);

  async function run(p: PromiseLike<{ error: unknown }>, ok: string) {
    const { error } = await p;
    if (error) { toast.error(errMsg(error)); return; }
    toast.success(ok); setSel(null); qc.invalidateQueries({ queryKey: ["ocupacion"] });
  }

  return (
    <Pagina titulo="Planificación por capacidad" sub="Minutos ocupados / disponibles por día y equipo"
      acciones={<><Button variant="outline" onClick={() => setInicio(inicio - 7)}>← Semana</Button><Button variant="outline" onClick={() => setInicio(0)}>Hoy</Button><Button variant="outline" onClick={() => setInicio(inicio + 7)}>Semana →</Button></>}>
      <p className="text-sm text-muted-foreground md:hidden">Desliza la tabla hacia los lados para ver todos los días →</p>
      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full min-w-max text-sm">
          <thead><tr className="bg-secondary"><th className="px-3 py-2 text-left">Equipo</th>{fechas.map((f) => <th key={f} className="px-2 py-2 text-center whitespace-nowrap">{fecha(f)}</th>)}</tr></thead>
          <tbody>
            {equipos.map(([id, nombre]) => (
              <tr key={id} className="border-t">
                <th className="px-3 py-2 text-left">{nombre}</th>
                {fechas.map((f) => { const c = celda(f, id)!; return (
                  <td key={f} className="px-1 py-1 text-center">
                    <button disabled={!edita} onClick={() => { setSel(c); setExtra({ minutos: 120, motivo: "" }); }} className="w-full rounded p-1 hover:bg-muted">
                      <CapacidadBadge estado={c.estado} />
                      <div className="text-xs">{c.usados}/{c.capacidad}</div>
                      {c.autorizado && <div className="text-[10px] font-bold">+ extra</div>}
                    </button>
                  </td>
                ); })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-sm text-muted-foreground">Con lugar hasta 70% · Justo hasta 95% · Saturado más de 95% · Sin capacidad = no admite tareas nuevas salvo autorización con motivo.</p>
      <Dialog open={!!sel} onOpenChange={(v) => !v && setSel(null)}>
        <DialogContent>
          {sel && <>
            <DialogHeader><DialogTitle>{sel.equipo} · {fecha(sel.fecha)}</DialogTitle></DialogHeader>
            <p className="text-sm">{sel.usados} de {sel.capacidad} min. {sel.motivo && <>Motivo: {sel.motivo}</>}</p>
            <Button variant={sel.sin_capacidad ? "outline" : "destructive"} onClick={() => run(supabase.rpc("marcar_sin_capacidad", { p_fecha: sel.fecha, p_equipo: sel.equipo_id, p_sin: !sel.sin_capacidad }), sel.sin_capacidad ? "Día reabierto" : "Marcado Sin capacidad")}>
              {sel.sin_capacidad ? "Quitar “Sin capacidad”" : "Marcar “Sin capacidad”"}
            </Button>
            <div className="grid gap-2 border-t pt-3 sm:grid-cols-2">
              <div className="space-y-1"><Label>Minutos extra</Label><Input type="number" value={extra.minutos} onChange={(e) => setExtra({ ...extra, minutos: Number(e.target.value) })} /></div>
              <div className="space-y-1"><Label>Motivo</Label><Input value={extra.motivo} onChange={(e) => setExtra({ ...extra, motivo: e.target.value })} /></div>
            </div>
            <DialogFooter><Button onClick={() => run(supabase.rpc("autorizar_horas_extra", { p_fecha: sel.fecha, p_equipo: sel.equipo_id, p_minutos: extra.minutos, p_motivo: extra.motivo }), "Horas extra autorizadas")}>Autorizar horas extra</Button></DialogFooter>
          </>}
        </DialogContent>
      </Dialog>
    </Pagina>
  );
}
