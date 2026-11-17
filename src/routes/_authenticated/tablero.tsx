import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { errMsg, etapaLabel, fecha, hora, hoyISO } from "@/lib/obrador";
import { meta } from "@/components/Pagina";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/tablero")({
  head: () => meta("Tablero de tareas", "Pizarra del obrador: pendiente, en curso, hecha, atrasada"),
  component: Tablero,
});

type T = { id: string; folio: number; etapa: string; equipo: string; dia: string; inicio: string; fin: string; minutos: number; estado: string; atrasada: boolean; porciones: number; tipo: string; sabor: string; relleno: string; cobertura: string; diseno: string; descripcion: string | null; cliente: string; bloqueo_etapa: string | null; bloqueo_estado: string | null };
const columnas = [
  { k: "pendiente", t: "Pendiente", icon: "○" },
  { k: "en_curso", t: "En curso", icon: "◐" },
  { k: "hecha", t: "Hecha", icon: "✓" },
  { k: "atrasada", t: "Atrasada", icon: "⚠" },
];
const btn = "rounded-lg px-4 py-3 text-lg font-extrabold disabled:opacity-40";

function Tablero() {
  const qc = useQueryClient();
  const [dias, setDias] = useState(3);
  const { data = [] } = useQuery({
    queryKey: ["tablero", dias],
    queryFn: async () => ((await supabase.rpc("mis_tareas", { p_desde: hoyISO(-2), p_hasta: hoyISO(dias) })).data ?? []) as T[],
    refetchInterval: 30000,
  });
  const [reg, setReg] = useState<null | { t: T; tipo: "consumo" | "merma" }>(null);
  const col = (k: string) => data.filter((t) => (k === "atrasada" ? t.atrasada : !t.atrasada && t.estado === k));

  async function accion(fn: "iniciar_tarea" | "finalizar_tarea", id: string) {
    const { error } = await supabase.rpc(fn, { p_tarea: id });
    if (error) { toast.error(errMsg(error)); return; }
    toast.success(fn === "iniciar_tarea" ? "Tarea iniciada" : "Tarea finalizada");
    qc.invalidateQueries({ queryKey: ["tablero"] });
  }

  return (
    <div className="pizarra -mx-4 -my-6 min-h-[calc(100vh-60px)] p-4 md:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-4xl font-bold">Pizarra del obrador</h1>
        <label className="text-lg">Ver hasta
          <select className="ml-2 rounded bg-pizarra-line px-2 py-1" value={dias} onChange={(e) => setDias(Number(e.target.value))}>
            <option value={1}>mañana</option><option value={3}>3 días</option><option value={7}>7 días</option><option value={14}>14 días</option>
          </select>
        </label>
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {columnas.map((c) => (
          <section key={c.k} className={`rounded-xl border-2 p-3 ${c.k === "atrasada" ? "border-destructive" : "border-pizarra-line"}`}>
            <h2 className="mb-3 flex items-center gap-2 text-2xl font-bold"><span aria-hidden>{c.icon}</span>{c.t} <span className="text-lg opacity-70">({col(c.k).length})</span></h2>
            <div className="space-y-3">
              {col(c.k).map((t) => (
                <article key={t.id} className={`rounded-lg border-l-8 bg-pizarra-line p-4 ${t.atrasada ? "border-destructive" : t.estado === "hecha" ? "border-success" : t.estado === "en_curso" ? "border-gold" : "border-pizarra-foreground/40"}`}>
                  <p className="text-sm uppercase tracking-widest opacity-80">#{t.folio} · {etapaLabel[t.etapa]} · {t.equipo}</p>
                  <p className="text-2xl font-extrabold leading-tight">{t.porciones} porc. {t.tipo}</p>
                  <p className="text-xl">{t.sabor} / {t.relleno}</p>
                  <p className="text-xl">{t.cobertura} · {t.diseno}</p>
                  {t.descripcion && <p className="mt-1 text-base opacity-90">“{t.descripcion}”</p>}
                  <p className="mt-2 text-lg font-bold">{fecha(t.dia)} · {hora(t.inicio)}–{hora(t.fin)} · {t.minutos} min</p>
                  {t.atrasada && <p className="text-lg font-extrabold text-destructive">⚠ ATRASADA ({t.estado === "en_curso" ? "en curso" : "sin iniciar"})</p>}
                  {t.estado === "pendiente" && t.bloqueo_etapa && <p className="mt-2 rounded bg-gold/20 px-2 py-1 text-lg font-bold">⏳ Espera a: {etapaLabel[t.bloqueo_etapa] ?? t.bloqueo_etapa} #{t.folio} ({t.bloqueo_estado === "en_curso" ? "En curso" : "Pendiente"})</p>}
                  {t.estado !== "hecha" && (
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <button className={`${btn} bg-gold text-accent-foreground`} disabled={t.estado !== "pendiente" || !!t.bloqueo_etapa} onClick={() => accion("iniciar_tarea", t.id)}>Iniciar</button>
                      <button className={`${btn} bg-success text-success-foreground`} disabled={t.estado !== "en_curso"} onClick={() => accion("finalizar_tarea", t.id)}>Finalizar</button>
                      <button className={`${btn} bg-pizarra-foreground text-pizarra text-base`} onClick={() => setReg({ t, tipo: "consumo" })}>Registrar consumo</button>
                      <button className={`${btn} bg-destructive text-destructive-foreground text-base`} onClick={() => setReg({ t, tipo: "merma" })}>Registrar merma</button>
                    </div>
                  )}
                </article>
              ))}
            </div>
          </section>
        ))}
      </div>
      {reg && <Registro t={reg.t} tipo={reg.tipo} cerrar={() => setReg(null)} />}
    </div>
  );
}

function Registro({ t, tipo, cerrar }: { t: T; tipo: "consumo" | "merma"; cerrar: () => void }) {
  const { data: ins = [] } = useQuery({ queryKey: ["insumos_tarea", t.id], queryFn: async () => (await supabase.rpc("insumos_tarea", { p_tarea: t.id })).data ?? [] });
  const [insumo, setInsumo] = useState("");
  const [cant, setCant] = useState(0);
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);
  async function guardar() {
    setEnviando(true);
    const { error } = tipo === "consumo"
      ? await supabase.rpc("registrar_consumo_receta", { p_tarea: t.id })
      : await supabase.rpc("registrar_merma", { p_tarea: t.id, p_insumo: insumo, p_cantidad: cant, p_motivo: motivo });
    setEnviando(false);
    if (error) { toast.error(errMsg(error)); return; }
    toast.success(tipo === "consumo" ? "Consumo de la receta descontado del inventario" : "Merma registrada");
    cerrar();
  }
  const receta = ins.filter((i) => Number(i.previsto) > 0);
  return (
    <Dialog open onOpenChange={(v) => !v && cerrar()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{tipo === "consumo" ? "Registrar consumo de la receta" : "Registrar merma"} · #{t.folio} {etapaLabel[t.etapa]}</DialogTitle></DialogHeader>
        {tipo === "consumo" ? (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">Se descontará del inventario todo lo de la receta para {t.porciones} porciones:</p>
            {receta.length === 0 ? <p>Esta etapa no tiene receta.</p> : (
              <ul className="divide-y rounded-md border text-sm">
                {receta.map((i) => <li key={i.insumo_id} className="flex justify-between px-3 py-2"><span>{i.nombre}</span><b>{Number(i.previsto).toFixed(3)} {i.unidad}</b></li>)}
              </ul>
            )}
          </div>
        ) : (<>
          <div className="space-y-1"><Label>Insumo</Label>
            <select className="h-12 w-full rounded-md border bg-card px-3 text-lg" value={insumo} onChange={(e) => setInsumo(e.target.value)}>
              <option value="">— Elige —</option>
              {ins.map((i) => <option key={i.insumo_id} value={i.insumo_id}>{i.nombre} (previsto {i.previsto} {i.unidad})</option>)}
            </select></div>
          <div className="space-y-1"><Label>Cantidad</Label><Input className="h-12 text-lg" type="number" step="0.001" value={cant} onChange={(e) => setCant(Number(e.target.value))} /></div>
          <div className="space-y-1"><Label>Motivo</Label><Input className="h-12 text-lg" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="quemado, caída, error de receta…" /></div>
        </>)}
        <DialogFooter><button className={`${btn} bg-primary text-primary-foreground`} disabled={enviando || (tipo === "consumo" ? receta.length === 0 : !insumo || cant <= 0)} onClick={guardar}>{tipo === "consumo" ? "Descontar receta" : "Guardar"}</button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
