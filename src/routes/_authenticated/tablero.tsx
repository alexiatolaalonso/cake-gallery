import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { errMsg, etapaLabel, fecha, fechaHora, hora, hoyISO, pasosEtapa, secuenciaEtapas, sesionQuery } from "@/lib/obrador";
import { meta } from "@/components/Pagina";
import { EnRiesgo } from "@/components/EnRiesgo";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/tablero")({
  head: () => meta("Tablero de tareas", "Pizarra del obrador: pendiente, en curso, hecha, atrasada"),
  component: Tablero,
});

type T = { id: string; orden_id: string; folio: number; etapa: string; equipo: string; dia: string; inicio: string; fin: string; minutos: number; estado: string; atrasada: boolean; porciones: number; tipo: string; sabor: string; relleno: string; cobertura: string; diseno: string; descripcion: string | null; cliente: string; fecha_entrega: string; bloqueo_etapa: string | null; bloqueo_estado: string | null; requiere_revision?: boolean };
const columnas = [
  { k: "pendiente", t: "Pendiente", icon: "○" },
  { k: "en_curso", t: "En curso", icon: "◐" },
  { k: "hecha", t: "Hecha", icon: "✓" },
  { k: "atrasada", t: "Atrasada", icon: "⚠" },
];
type A = { orden_id: string; etapa: string; orden_etapa: number; estado: string; equipo: string };
type P = { t: T; etapas: A[]; columna: string; faltan: A[] };
const btn = "rounded-lg px-4 py-3 text-lg font-extrabold disabled:opacity-40";

function Tablero() {
  const qc = useQueryClient();
  const [dias, setDias] = useState(3);
  const [abiertas, setAbiertas] = useState<Record<string, boolean>>({ en_curso: true, atrasada: true });
  const [filtroEtapa, setFiltroEtapa] = useState<string | null>(null);
  const { data: sesion } = useQuery(sesionQuery);

  const { data = [] } = useQuery({
    queryKey: ["tablero", dias],
    queryFn: async () => ((await supabase.rpc("mis_tareas", { p_desde: hoyISO(-2), p_hasta: hoyISO(dias) })).data ?? []) as T[],
    refetchInterval: 30000,
  });
  const [reg, setReg] = useState<null | { t: T; tipo: "consumo" | "merma" }>(null);
  const [ficha, setFicha] = useState<T | null>(null);
  const ordenes = [...new Set(data.map((t) => t.orden_id))];
  const { data: avance = [] } = useQuery({
    queryKey: ["avance", ordenes.join(",")],
    enabled: ordenes.length > 0,
    queryFn: async () => ((await supabase.rpc("avance_pedidos", { p_ordenes: ordenes })).data ?? []) as A[],
    refetchInterval: 30000,
  });
  const pedidos: P[] = ordenes.map((oid) => {
    const mias = data.filter((t) => t.orden_id === oid && (sesion?.rol !== "produccion" || t.etapa === "horneado")).sort((a, b) => a.inicio.localeCompare(b.inicio));
    if (mias.length === 0) return null;
    const t = mias.find((x) => x.estado !== "hecha") ?? mias[mias.length - 1]!;
    const etapas = avance.filter((a) => a.orden_id === oid).sort((a, b) => a.orden_etapa - b.orden_etapa);
    const lista = etapas.length ? etapas : mias.map((m) => ({ orden_id: oid, etapa: m.etapa, orden_etapa: 0, estado: m.estado, equipo: m.equipo }));
    const atrasada = mias.some((m) => m.atrasada);
    const todas = lista.every((a) => a.estado === "hecha");
    const empezada = lista.some((a) => a.estado !== "pendiente");
    let columna = atrasada ? "atrasada" : todas ? "hecha" : empezada ? "en_curso" : "pendiente";
    if (sesion?.rol === "equipo" || sesion?.rol === "produccion") {
      // Un equipo ve el pedido según SUS etapas; al terminarlas pasa a Hecha y desaparece cuando el siguiente equipo empieza.
      const mias_hechas = mias.every((m) => m.estado === "hecha");
      const ultimaMia = Math.max(...lista.filter((a) => mias.some((m) => m.etapa === a.etapa)).map((a) => a.orden_etapa), 0);
      const siguienteEmpezo = lista.some((a) => a.orden_etapa > ultimaMia && a.estado !== "pendiente");
      if (mias_hechas && siguienteEmpezo) columna = "oculto";
      else columna = mias.some((m) => m.atrasada) ? "atrasada" : mias_hechas ? "hecha" : mias.some((m) => m.estado !== "pendiente") ? "en_curso" : "pendiente";
    }
    return { t, etapas: lista, columna, faltan: lista.filter((a) => a.estado !== "hecha") };
  }).filter((p): p is P => p !== null);
  // El rol Equipo no puede leer la tabla de equipos (tiene costos): se reconoce a Decoración por sus propias tareas.
  const verEtapas = sesion?.rol === "administracion" || (sesion?.rol === "equipo" && data.some((t) => t.equipo.includes("Decoración")));
  const col = (k: string) => pedidos.filter((p) => p.columna === k);
  const visibles = (k: string) => col(k).filter((p) => k !== "en_curso" || !verEtapas || !filtroEtapa || p.t.etapa === filtroEtapa);

  async function accion(fn: "iniciar_tarea" | "finalizar_tarea", id: string) {
    const { error } = await supabase.rpc(fn, { p_tarea: id });
    if (error) { toast.error(errMsg(error)); return; }
    toast.success(fn === "iniciar_tarea" ? "Tarea iniciada" : "Tarea finalizada");
    qc.invalidateQueries({ queryKey: ["tablero"] });
    qc.invalidateQueries({ queryKey: ["avance"] });
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
            <h2 className="text-2xl font-bold">
              <button type="button" aria-expanded={!!abiertas[c.k]} onClick={() => setAbiertas({ ...abiertas, [c.k]: !abiertas[c.k] })} className="flex min-h-12 w-full items-center gap-2 text-left">
                <span aria-hidden>{c.icon}</span><span className="min-w-0 flex-1">{c.t} <span className="text-lg opacity-70">({col(c.k).length})</span></span>
                <span aria-hidden className="shrink-0 text-xl">{abiertas[c.k] ? "▲" : "▼"}</span>
              </button>
            </h2>
            {abiertas[c.k] && c.k === "en_curso" && verEtapas && (
              <div className="mt-3 flex flex-wrap gap-2">
                {[null, "cobertura", "decoracion", "empaque"].map((e) => {
                  const n = col("en_curso").filter((p) => !e || p.t.etapa === e).length;
                  return <button key={e ?? "todas"} type="button" onClick={() => setFiltroEtapa(e)} className={`min-h-11 rounded-full border-2 px-4 text-base font-bold ${filtroEtapa === e ? "border-gold bg-gold text-accent-foreground" : "border-pizarra-foreground/40"}`}>{e ? etapaLabel[e] : "Todas"} ({n})</button>;
                })}
              </div>
            )}
            {abiertas[c.k] && <div className="mt-3 space-y-3">
              {c.k === "en_curso" && verEtapas && visibles(c.k).length === 0 && <p className="opacity-70">No hay pedidos en esta etapa.</p>}
              {visibles(c.k).map(({ t, etapas, faltan }) => (
                <article key={t.orden_id} className={`rounded-lg border-l-8 bg-pizarra-line p-4 ${t.atrasada ? "border-destructive" : t.estado === "hecha" ? "border-success" : t.estado === "en_curso" ? "border-gold" : "border-pizarra-foreground/40"}`}>
                  <p className="text-xl font-extrabold">Pedido #{t.folio}</p>
                  <EnRiesgo orden={t.orden_id} />
                  <ul className="my-2 flex flex-wrap gap-x-3 gap-y-1 text-sm">
                    {etapas.map((a) => <li key={a.etapa} className={a.estado === "hecha" ? "text-success font-bold" : a.estado === "en_curso" ? "text-gold font-bold" : "opacity-70"}>{a.estado === "hecha" ? "✓" : a.estado === "en_curso" ? "◐" : "○"} {etapaLabel[a.etapa] ?? a.etapa}</li>)}
                  </ul>
                  {faltan.length > 0 && <p className="mb-2 text-base font-bold">Falta: {faltan.map((a) => etapaLabel[a.etapa] ?? a.etapa).join(", ")}</p>}
                  <p className="text-sm uppercase tracking-widest opacity-80">{t.estado === "hecha" ? "Última" : "Siguiente"} etapa: {etapaLabel[t.etapa]} · {t.equipo}</p>
                  <p className="text-2xl font-extrabold leading-tight">{t.porciones} porc. {t.tipo}</p>
                  <p className="text-xl">{t.sabor} / {t.relleno}</p>
                  <p className="text-xl">{t.cobertura} · {t.diseno}</p>
                  {t.descripcion && <p className="mt-1 text-base opacity-90">“{t.descripcion}”</p>}
                  <p className="mt-2 text-lg font-bold">{fecha(t.dia)} · {hora(t.inicio)}–{hora(t.fin)} · {t.minutos} min</p>
                  {t.atrasada && <p className="text-lg font-extrabold text-destructive">⚠ ATRASADA ({t.estado === "en_curso" ? "en curso" : "sin iniciar"})</p>}
                  {t.requiere_revision && <p className="mt-2 rounded bg-destructive px-2 py-1 text-base font-bold text-destructive-foreground">⚠ Tarea movida a mano y el pedido cambió: revisar horario</p>}
                  {t.estado === "pendiente" && t.bloqueo_etapa && <p className="mt-2 rounded bg-gold/20 px-2 py-1 text-lg font-bold">⏳ Espera a: {etapaLabel[t.bloqueo_etapa] ?? t.bloqueo_etapa} #{t.folio} ({t.bloqueo_estado === "en_curso" ? "En curso" : "Pendiente"})</p>}
                  <button className={`${btn} mt-3 w-full border-2 border-pizarra-foreground/40 text-base`} onClick={() => setFicha(t)}>📋 Ver ficha</button>
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
            </div>}
          </section>
        ))}
      </div>
      {ficha && <Ficha t={ficha} cerrar={() => setFicha(null)} accion={(fn) => { accion(fn, ficha.id); setFicha(null); }} consumo={() => { setReg({ t: ficha, tipo: "consumo" }); setFicha(null); }} />}
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

function Ficha({ t, cerrar, accion, consumo }: { t: T; cerrar: () => void; accion: (fn: "iniciar_tarea" | "finalizar_tarea") => void; consumo: () => void }) {
  const { data: ins = [] } = useQuery({ queryKey: ["insumos_tarea", t.id], queryFn: async () => (await supabase.rpc("insumos_tarea", { p_tarea: t.id })).data ?? [] });
  const etapa = t.etapa === "armado" ? "relleno" : t.etapa;
  const i = secuenciaEtapas.indexOf(etapa);
  const antes = i > 0 ? secuenciaEtapas[i - 1] : null;
  const despues = i >= 0 && i < secuenciaEtapas.length - 1 ? secuenciaEtapas[i + 1] : null;
  const receta = ins.filter((x) => Number(x.previsto) > 0);
  const compReceta = etapa === "horneado" ? `sabor ${t.sabor}` : etapa === "relleno" ? `relleno ${t.relleno}` : etapa === "cobertura" ? `cobertura ${t.cobertura}` : null;
  return (
    <Dialog open onOpenChange={(v) => !v && cerrar()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Ficha #{t.folio} · {etapaLabel[t.etapa] ?? t.etapa}</DialogTitle></DialogHeader>
        <section className="space-y-1 text-sm">
          <h3 className="text-base font-bold">Pedido</h3>
          <p><b>{t.porciones} porciones</b> · {t.tipo}</p>
          <p>Cliente: {t.cliente}</p>
          <p>Sabor: {t.sabor} · Relleno: {t.relleno}</p>
          <p>Cobertura: {t.cobertura} · Diseño: {t.diseno}</p>
          {t.descripcion && <p className="italic">“{t.descripcion}”</p>}
          <p>Tarea: {fecha(t.dia)} {hora(t.inicio)}–{hora(t.fin)} ({t.minutos} min)</p>
          <p>Entrega: <b>{fechaHora(t.fecha_entrega)}</b></p>
        </section>
        <section className="space-y-1 text-sm">
          <h3 className="text-base font-bold">Ingredientes{compReceta ? ` · receta de ${compReceta}` : ""}</h3>
          {receta.length === 0 ? <p className="text-muted-foreground">Esta etapa no usa receta.</p> : (
            <ul className="divide-y rounded-md border">
              {receta.map((x) => <li key={x.insumo_id} className="flex justify-between gap-2 px-3 py-1.5"><span>{x.nombre}</span><b>{Number(x.previsto).toFixed(3)} {x.unidad}</b></li>)}
            </ul>)}
        </section>
        <section className="space-y-1 text-sm">
          <h3 className="text-base font-bold">Proceso</h3>
          <ol className="list-decimal space-y-1 pl-5">{(pasosEtapa[t.etapa] ?? []).map((p) => <li key={p}>{p}</li>)}</ol>
        </section>
        <section className="grid grid-cols-2 gap-2 text-sm">
          <div className="rounded-md border p-2"><p className="text-xs text-muted-foreground">Viene de</p><p className="font-bold">{antes ? etapaLabel[antes] : "Inicio"}</p>
            {antes && <p className="text-xs">{t.bloqueo_etapa ? `⏳ ${t.bloqueo_estado === "en_curso" ? "En curso" : "Pendiente"}` : "✓ Hecho"}</p>}</div>
          <div className="rounded-md border p-2"><p className="text-xs text-muted-foreground">Pasa a</p><p className="font-bold">{despues ? etapaLabel[despues] : "Entrega"}</p></div>
        </section>
        {t.estado !== "hecha" && (
          <div className="grid grid-cols-2 gap-2">
            <button className={`${btn} bg-gold text-accent-foreground`} disabled={t.estado !== "pendiente" || !!t.bloqueo_etapa} onClick={() => accion("iniciar_tarea")}>Iniciar</button>
            <button className={`${btn} bg-success text-success-foreground`} disabled={t.estado !== "en_curso"} onClick={() => accion("finalizar_tarea")}>Finalizar</button>
            <button className={`${btn} col-span-2 bg-primary text-primary-foreground text-base`} disabled={receta.length === 0} onClick={consumo}>Registrar consumo</button>
          </div>)}
      </DialogContent>
    </Dialog>
  );
}
