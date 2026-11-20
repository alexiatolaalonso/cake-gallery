import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { errMsg, fecha, fechaHora, sesionQuery } from "@/lib/obrador";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";

export type Solicitud = { id: string; tipo: "urgencia" | "horas_extra"; orden_id: string | null; equipo_id: string | null; fecha: string | null; minutos: number | null; motivo: string; estado: "pendiente" | "aprobada" | "rechazada"; motivo_rechazo: string | null; creado: string };

/** Solicitudes de una orden (se refresca sola mientras haya alguna pendiente). */
export function useSolicitudesOrden(ordenId: string | null) {
  return useQuery({
    queryKey: ["solicitudes", ordenId],
    enabled: !!ordenId,
    refetchInterval: (q) => ((q.state.data as Solicitud[] | undefined)?.some((s) => s.estado === "pendiente") ? 10000 : false),
    queryFn: async () => ((await supabase.from("solicitudes_autorizacion").select("*").eq("orden_id", ordenId!).order("creado", { ascending: false })).data ?? []) as Solicitud[],
  });
}

export function EstadoUrgencia({ ordenId, lista, onPedir }: { ordenId: string | null; lista: Solicitud[] | undefined; onPedir: () => void }) {
  const { data: s } = useQuery(sesionQuery);
  const admin = s?.rol === "administracion";
  const u = lista?.find((x) => x.tipo === "urgencia");
  return (
    <div role="alert" className="rounded-md border border-gold bg-gold/10 p-3 text-sm">
      <p className="font-bold">⚡ Pedido urgente: por debajo del plazo normal, +15 %.</p>
      {u?.estado === "aprobada" ? <p className="mt-1 font-bold text-success">✓ Urgencia autorizada por Administración.</p>
        : u?.estado === "pendiente" ? <p className="mt-1">⏳ Esperando que Administración autorice la urgencia…</p>
        : <>
          {u?.estado === "rechazada" && <p className="mt-1 text-destructive">✕ Rechazada: {u.motivo_rechazo}</p>}
          <p className="mt-1">Necesita autorización de Administración.</p>
          <Button size="sm" className="mt-2" onClick={onPedir}>{admin ? "Autorizar urgencia" : "Solicitar autorización"}</Button>
        </>}
      {!ordenId && <p className="mt-1 text-xs text-muted-foreground">Al pedirla se guarda el pedido como borrador.</p>}
    </div>
  );
}

export function EstadoHorasExtra({ lista }: { lista: Solicitud[] | undefined }) {
  const h = lista?.find((x) => x.tipo === "horas_extra");
  if (!h) return null;
  return h.estado === "pendiente" ? <p className="mt-1 text-sm">⏳ Horas extra pedidas para el {fecha(h.fecha)}: esperando a Administración.</p>
    : h.estado === "rechazada" ? <p className="mt-1 text-sm text-destructive">✕ Horas extra rechazadas: {h.motivo_rechazo}</p>
    : null;
}

export async function pedirAutorizacion(p: { tipo: "urgencia" | "horas_extra"; orden: string | null; equipo?: string | null; fecha?: string | null; minutos?: number | null; motivo: string }) {
  const { data, error } = await supabase.rpc("solicitar_autorizacion", {
    p_tipo: p.tipo, p_orden: p.orden as string, p_equipo: (p.equipo ?? null) as string, p_fecha: (p.fecha ?? null) as string, p_minutos: (p.minutos ?? null) as number, p_motivo: p.motivo,
  });
  if (error) throw error;
  return data as { estado: string };
}

export function HorasExtraDialog({ open, onOpenChange, ordenId, inicial, onDone }: {
  open: boolean; onOpenChange: (v: boolean) => void; ordenId: string | null;
  inicial: { equipo_id?: string | null; equipo?: string; fecha?: string; minutos?: number } | null; onDone: () => void;
}) {
  const { data: s } = useQuery(sesionQuery);
  const admin = s?.rol === "administracion";
  const { data: equipos = [] } = useQuery({ queryKey: ["equipos"], queryFn: async () => (await supabase.from("equipos").select("id, nombre").order("orden_etapa")).data ?? [] });
  const [f, setF] = useState({ equipo: "", fecha: "", minutos: 60, motivo: "" });
  useEffect(() => {
    if (!open || !inicial) return;
    const eq = inicial.equipo_id ?? equipos.find((e) => inicial.equipo && e.nombre.includes(inicial.equipo))?.id ?? "";
    setF({ equipo: eq, fecha: inicial.fecha ?? "", minutos: Math.min(Math.max(inicial.minutos ?? 60, 15), 480), motivo: "" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, equipos.length]);
  async function enviar() {
    try {
      const r = await pedirAutorizacion({ tipo: "horas_extra", orden: ordenId, equipo: f.equipo, fecha: f.fecha, minutos: f.minutos, motivo: f.motivo });
      toast.success(r.estado === "aprobada" ? "Horas extra autorizadas" : "Solicitud enviada a Administración");
      onOpenChange(false); onDone();
    } catch (e) { toast.error(errMsg(e)); }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>{admin ? "Autorizar horas extra" : "Solicitar horas extra"}</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">No hay hueco en el equipo. {admin ? "Como Administración, se autorizan al momento." : "Administración tiene que aprobarlas antes de confirmar."}</p>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1"><Label htmlFor="he-eq">Equipo</Label>
            <select id="he-eq" className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm" value={f.equipo} onChange={(e) => setF({ ...f, equipo: e.target.value })}>
              <option value="">— Elige —</option>{equipos.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
            </select></div>
          <div className="space-y-1"><Label htmlFor="he-dia">Día</Label><Input id="he-dia" type="date" value={f.fecha} onChange={(e) => setF({ ...f, fecha: e.target.value })} /></div>
          <div className="space-y-1"><Label htmlFor="he-min">Minutos extra</Label><Input id="he-min" type="number" min={15} max={480} step={15} value={f.minutos} onChange={(e) => setF({ ...f, minutos: Number(e.target.value) })} /></div>
          <div className="space-y-1 sm:col-span-3"><Label htmlFor="he-mot">Motivo</Label><Input id="he-mot" value={f.motivo} placeholder="Ej.: pedido urgente de boda" onChange={(e) => setF({ ...f, motivo: e.target.value })} /></div>
        </div>
        <DialogFooter><Button disabled={!f.equipo || !f.fecha || !f.motivo.trim()} onClick={enviar}>{admin ? "Autorizar" : "Enviar solicitud"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Aviso en la barra superior con las solicitudes pendientes (solo Administración). */
export function PanelSolicitudes() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [rechazo, setRechazo] = useState<Record<string, string>>({});
  const { data = [] } = useQuery({
    queryKey: ["solicitudes", "pendientes"],
    refetchInterval: 15000,
    queryFn: async () => ((await supabase.from("solicitudes_autorizacion")
      .select("*, ordenes(folio, porciones, fecha_entrega, clientes(nombre)), equipos(nombre)")
      .eq("estado", "pendiente").order("creado")).data ?? []) as (Solicitud & { ordenes: { folio: number; porciones: number; fecha_entrega: string; clientes: { nombre: string } | null } | null; equipos: { nombre: string } | null })[],
  });
  async function resolver(id: string, aprobar: boolean) {
    const { error } = await supabase.rpc("resolver_solicitud", { p_id: id, p_aprobar: aprobar, p_motivo: rechazo[id] ?? "" });
    if (error) { toast.error(errMsg(error)); return; }
    toast.success(aprobar ? "Aprobada" : "Rechazada");
    qc.invalidateQueries({ queryKey: ["solicitudes"] });
    qc.invalidateQueries({ queryKey: ["ocupacion"] });
  }
  return (
    <>
      <button onClick={() => setOpen(true)} className={`shrink-0 rounded px-3 py-1 font-bold ${data.length ? "bg-sidebar-primary text-sidebar-primary-foreground" : "border border-sidebar-border opacity-80"}`}>
        Solicitudes ({data.length})
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Solicitudes pendientes</DialogTitle></DialogHeader>
          {data.length === 0 && <p className="text-sm text-muted-foreground">No hay nada pendiente.</p>}
          <ul className="space-y-3">
            {data.map((s) => (
              <li key={s.id} className="space-y-2 rounded-md border p-3 text-sm">
                <p className="font-bold">{s.tipo === "urgencia" ? "⚡ Pedido urgente (+15 %)" : `⏱ Horas extra · ${s.equipos?.nombre ?? ""} · ${fecha(s.fecha)} · ${s.minutos} min`}</p>
                {s.ordenes && <p>{s.ordenes.folio ? `Orden #${s.ordenes.folio}` : "Borrador"} · {s.ordenes.clientes?.nombre} · {s.ordenes.porciones} porciones · entrega {fechaHora(s.ordenes.fecha_entrega)}</p>}
                <p>Motivo: {s.motivo}</p>
                <Input placeholder="Motivo si la rechazas" value={rechazo[s.id] ?? ""} onChange={(e) => setRechazo({ ...rechazo, [s.id]: e.target.value })} />
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => resolver(s.id, true)}>Aprobar</Button>
                  <Button size="sm" variant="outline" onClick={() => resolver(s.id, false)}>Rechazar</Button>
                </div>
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>
    </>
  );
}
