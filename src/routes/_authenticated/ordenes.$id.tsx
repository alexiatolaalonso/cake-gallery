import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { catalogoQuery } from "@/lib/catalogo";
import { descargarArchivo, errMsg, etapaLabel, fechaHora, generarICS, hora, mxn, sesionQuery } from "@/lib/obrador";
import { EstadoBadge } from "@/components/EstadoBadge";
import { EnRiesgo } from "@/components/EnRiesgo";
import { Pagina, meta } from "@/components/Pagina";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/ordenes/$id")({
  head: () => meta("Ficha de orden", "Detalle de la orden, cobros y tareas"),
  component: Ficha,
});
const sel = "h-10 w-full rounded-md border border-input bg-card px-3 text-sm";
type Metodo = "efectivo" | "transferencia" | "tarjeta";

function Ficha() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const { data: s } = useQuery(sesionQuery);
  const { data: cat } = useQuery(catalogoQuery);
  const puedeCaja = s?.rol === "administracion" || s?.rol === "mostrador";
  const { data, isLoading } = useQuery({
    queryKey: ["orden", id],
    queryFn: async () => {
      const [o, t, c, f] = await Promise.all([
        supabase.from("ordenes").select("*, clientes(*), tipos_pastel(nombre, min_porciones, max_porciones), sabores(nombre), rellenos(nombre), coberturas(nombre), niveles_diseno(nombre)").eq("id", id).single(),
        supabase.from("tareas").select("*, equipos(nombre)").eq("orden_id", id).order("orden_etapa"),
        supabase.from("cobros").select("*").eq("orden_id", id).order("creado"),
        supabase.from("facturas_internas").select("id, folio, estado, total").eq("orden_id", id),
      ]);
      return { o: o.data, tareas: t.data ?? [], cobros: c.data ?? [], facturas: f.data ?? [] };
    },
  });
  const [dlg, setDlg] = useState<null | "cambio" | "cancelar" | "cobro" | "entregar" | "confirmar">(null);
  const [form, setForm] = useState<{ porciones: number; sabor: string; relleno: string; cobertura: string; motivo: string; metodo: Metodo; monto: number; clave: string }>({ porciones: 0, sabor: "", relleno: "", cobertura: "", motivo: "", metodo: "efectivo", monto: 0, clave: "" });

  if (isLoading || !data?.o) return <p>{isLoading ? "Cargando…" : "Orden no encontrada o sin acceso."}</p>;
  const { o, tareas, cobros, facturas } = data;
  const pagado = cobros.reduce((a, c) => a + Number(c.monto), 0);
  const saldo = Number(o.precio) - pagado;
  const refrescar = () => qc.invalidateQueries();

  const tipo = o.tipos_pastel;
  const avisoPorciones = (() => {
    const p = form.porciones;
    if (p === 0) return "Escribí las porciones (de 10 en 10).";
    if (!Number.isInteger(p)) return "Las porciones deben ser un número entero, sin decimales.";
    if (p < 10 || p % 10 !== 0) return "Las porciones van de 10 en 10 (10, 20, 30…).";
    if (tipo?.min_porciones != null && tipo?.max_porciones != null && (p < tipo.min_porciones || p > tipo.max_porciones))
      return `${tipo.nombre ?? "Este pastel"} admite de ${tipo.min_porciones} a ${tipo.max_porciones} porciones.`;
    return "";
  })();

  async function rpc(fn: () => PromiseLike<{ data: unknown; error: unknown }>, ok: (d: any) => string) {
    const { data, error } = await fn();
    if (error) { toast.error(errMsg(error)); return; }
    toast.success(ok(data));
    setDlg(null);
    refrescar();
  }

  function ics() {
    const desc = `${o!.tipos_pastel?.nombre} ${o!.porciones} porciones\nSabor ${o!.sabores?.nombre} / ${o!.rellenos?.nombre} / ${o!.coberturas?.nombre}\nDiseño ${o!.niveles_diseno?.nombre}\n${o!.descripcion ?? ""}`;
    descargarArchivo(`orden-${o!.folio}.ics`, generarICS({ folio: o!.folio, titulo: `Entrega pastel #${o!.folio} · ${o!.clientes?.nombre}`, inicio: o!.fecha_entrega, descripcion: desc, lugar: o!.direccion }), "text/calendar");
  }

  const activo = ["confirmada", "en_produccion", "lista"].includes(o.estado);
  return (
    <Pagina titulo={`Orden #${o.folio}`} sub={`${o.clientes?.nombre} · entrega ${fechaHora(o.fecha_entrega)}`}
      volver={
        <Link to="/ordenes" className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md border border-input bg-card px-4 text-sm font-bold hover:bg-muted sm:w-auto sm:justify-start">
          <span aria-hidden="true">←</span> Volver a órdenes
        </Link>
      }
      acciones={<>
        <Button variant="outline" onClick={ics}>Descargar .ics</Button>
        {puedeCaja && o.estado === "borrador" && <Button onClick={() => { setForm({ ...form, metodo: "efectivo", monto: Math.round(Number(o.precio) * 50) / 100, clave: crypto.randomUUID() }); setDlg("confirmar"); }}>Confirmar con anticipo</Button>}
        {puedeCaja && activo && <>
          <Button variant="outline" onClick={() => { setForm({ ...form, porciones: o.porciones, sabor: o.sabor_id, relleno: o.relleno_id, cobertura: o.cobertura_id }); setDlg("cambio"); }}>Cambiar porciones/sabor</Button>
          <Button variant="outline" onClick={() => { setForm({ ...form, monto: saldo, clave: crypto.randomUUID() }); setDlg("cobro"); }} disabled={saldo <= 0}>Cobrar saldo</Button>
          <Button onClick={() => { setForm({ ...form, motivo: "" }); setDlg("entregar"); }}>Marcar entregada</Button>
          <Button variant="destructive" onClick={() => { setForm({ ...form, motivo: "" }); setDlg("cancelar"); }}>Cancelar</Button>
        </>}
      </>}>
      <div className="grid gap-6 lg:grid-cols-3">
        <section className="space-y-2 rounded-xl border bg-card p-5 lg:col-span-2">
          <div className="flex items-center gap-3"><EstadoBadge estado={o.estado} /><span className="text-sm text-muted-foreground">{o.modo_entrega}{o.direccion ? ` · ${o.direccion}` : ""}</span></div>
          <EnRiesgo orden={o.id} detalle />
          <h2 className="text-2xl font-bold">{o.tipos_pastel?.nombre} · {o.porciones} porciones</h2>
          <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            <div><dt className="text-muted-foreground">Sabor</dt><dd className="font-bold">{o.sabores?.nombre}</dd></div>
            <div><dt className="text-muted-foreground">Relleno</dt><dd className="font-bold">{o.rellenos?.nombre}</dd></div>
            <div><dt className="text-muted-foreground">Cobertura</dt><dd className="font-bold">{o.coberturas?.nombre}</dd></div>
            <div><dt className="text-muted-foreground">Diseño</dt><dd className="font-bold">{o.niveles_diseno?.nombre}</dd></div>
          </dl>
          <p className="rounded-md bg-muted p-3 text-sm"><b>Referencia:</b> {o.descripcion || "—"}</p>
          {o.entrega_autorizada_motivo && <p className="text-sm">Entrega autorizada con saldo: {o.entrega_autorizada_motivo}</p>}
        </section>
        {puedeCaja && (
          <section className="space-y-2 rounded-xl border bg-card p-5">
            <h3 className="text-lg font-bold">Cobros</h3>
            <p className="text-sm">Total {mxn(o.precio)}{Number(o.recargo_urgencia) > 0 && <> (incluye recargo {mxn(o.recargo_urgencia)})</>}</p>
            <ul className="divide-y text-sm">{cobros.map((c) => <li key={c.id} className="flex justify-between py-1"><span>{c.tipo} · {c.metodo}</span><b>{mxn(c.monto)}</b></li>)}</ul>
            <p className={`font-bold ${saldo > 0 ? "text-destructive" : "text-success"}`}>{saldo > 0 ? "⚠ Saldo pendiente" : "✓ Liquidada"}: {mxn(saldo)}</p>
            {facturas.map((f) => <Link key={f.id} to="/facturas" className="block text-sm underline">{f.folio} · {f.estado} · {mxn(f.total)}</Link>)}
          </section>
        )}
      </div>
      <section className="rounded-xl border bg-card p-5">
        <h3 className="mb-3 text-lg font-bold">Tareas (planificadas hacia atrás)</h3>
        <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          {tareas.map((t) => (
            <li key={t.id} className="rounded-lg border p-3 text-sm">
              <p className="font-bold">{t.orden_etapa}. {etapaLabel[t.etapa]}</p>
              <p>{fechaHora(t.inicio)} → {hora(t.fin)}</p>
              <p>{t.minutos} min · {t.estado === "hecha" ? "✓ Hecha" : t.estado === "en_curso" ? "◐ En curso" : "○ Pendiente"}{t.editada_manual ? " · editada" : ""}</p>
            </li>
          ))}
          {!tareas.length && <li className="text-sm text-muted-foreground">Sin tareas (se generan al confirmar).</li>}
        </ol>
      </section>

      <Dialog open={dlg !== null} onOpenChange={(v) => !v && setDlg(null)}>
        <DialogContent>
          {dlg === "confirmar" && <>
            <DialogHeader><DialogTitle>Confirmar con anticipo</DialogTitle></DialogHeader>
            <PagoCampos form={form} setForm={setForm} />
            <DialogFooter><Button onClick={() => rpc(() => supabase.rpc("confirmar_orden", { p_orden: id, p_metodo: form.metodo, p_monto: form.monto, p_clave: form.clave }), (d) => `Confirmada · ${d.factura ?? ""}`)}>Confirmar</Button></DialogFooter>
          </>}
          {dlg === "cambio" && cat && <>
            <DialogHeader><DialogTitle>Cambiar porciones o sabor</DialogTitle></DialogHeader>
            <p className="text-sm text-muted-foreground">Recalcula tareas, insumos y factura. Rechazado si ya empezó Decoración. Recargo 15% si faltan menos de 3 días.</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1"><Label htmlFor="cambio-porciones">Porciones</Label>
                <Input id="cambio-porciones" type="number" step={10} min={tipo?.min_porciones ?? 10} max={tipo?.max_porciones ?? 120} value={form.porciones} aria-invalid={!!avisoPorciones} onChange={(e) => setForm({ ...form, porciones: Number(e.target.value) })} />
                {avisoPorciones && <p className="text-xs font-bold text-destructive">⚠ {avisoPorciones}</p>}
              </div>
              <div className="space-y-1"><Label>Sabor</Label><select className={sel} value={form.sabor} onChange={(e) => setForm({ ...form, sabor: e.target.value })}>{cat.sabores.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}</select></div>
              <div className="space-y-1"><Label>Relleno</Label><select className={sel} value={form.relleno} onChange={(e) => setForm({ ...form, relleno: e.target.value })}>{cat.rellenos.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}</select></div>
              <div className="space-y-1"><Label>Cobertura</Label><select className={sel} value={form.cobertura} onChange={(e) => setForm({ ...form, cobertura: e.target.value })}>{cat.coberturas.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}</select></div>
            </div>
            <DialogFooter><Button disabled={!!avisoPorciones} onClick={() => rpc(() => supabase.rpc("cambiar_orden", { p_orden: id, p_porciones: form.porciones, p_sabor: form.sabor, p_relleno: form.relleno, p_cobertura: form.cobertura }), (d) => `Nuevo total ${mxn(d.precio)}${d.recargo > 0 ? " (con recargo 15%)" : ""}`)}>Aplicar cambio</Button></DialogFooter>
          </>}
          {dlg === "cobro" && <>
            <DialogHeader><DialogTitle>Cobrar saldo</DialogTitle></DialogHeader>
            <PagoCampos form={form} setForm={setForm} />
            <DialogFooter><Button onClick={() => rpc(() => supabase.rpc("registrar_cobro", { p_orden: id, p_metodo: form.metodo, p_monto: form.monto, p_clave: form.clave }), (d) => `Cobro registrado · saldo ${mxn(d.saldo)}`)}>Registrar cobro</Button></DialogFooter>
          </>}
          {dlg === "entregar" && <>
            <DialogHeader><DialogTitle>Marcar entregada</DialogTitle></DialogHeader>
            {saldo > 0 ? <p className="text-sm font-bold text-destructive">⚠ Saldo pendiente {mxn(saldo)}. Solo Administración puede autorizar con motivo.</p> : <p className="text-sm">Orden liquidada.</p>}
            {saldo > 0 && <div className="space-y-1"><Label>Motivo de autorización</Label><Input value={form.motivo} onChange={(e) => setForm({ ...form, motivo: e.target.value })} /></div>}
            <DialogFooter><Button onClick={() => rpc(() => supabase.rpc("marcar_entregada", { p_orden: id, p_motivo_autorizacion: form.motivo }), () => "Orden entregada")}>Entregar</Button></DialogFooter>
          </>}
          {dlg === "cancelar" && <>
            <DialogHeader><DialogTitle>Cancelar orden</DialogTitle></DialogHeader>
            <p className="text-sm">Devolución: 100% con 7+ días, 50% con 3–6 días, 0% con menos de 3. Libera insumos y minutos.</p>
            <div className="space-y-1"><Label>Motivo</Label><Input value={form.motivo} onChange={(e) => setForm({ ...form, motivo: e.target.value })} /></div>
            <div className="space-y-1"><Label>Método de devolución</Label><select className={sel} value={form.metodo} onChange={(e) => setForm({ ...form, metodo: e.target.value as Metodo })}><option value="efectivo">Efectivo</option><option value="transferencia">Transferencia</option><option value="tarjeta">Tarjeta</option></select></div>
            <DialogFooter><Button variant="destructive" onClick={() => rpc(() => supabase.rpc("cancelar_orden", { p_orden: id, p_motivo: form.motivo, p_metodo: form.metodo }), (d) => `Cancelada · devolución ${d.porcentaje}% = ${mxn(d.devolucion)}`)}>Cancelar orden</Button></DialogFooter>
          </>}
        </DialogContent>
      </Dialog>
    </Pagina>
  );
}

function PagoCampos({ form, setForm }: { form: { metodo: Metodo; monto: number }; setForm: (f: any) => void }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="space-y-1"><Label>Método</Label><select className={sel} value={form.metodo} onChange={(e) => setForm({ ...form, metodo: e.target.value })}><option value="efectivo">Efectivo</option><option value="transferencia">Transferencia</option><option value="tarjeta">Tarjeta</option></select></div>
      <div className="space-y-1"><Label>Monto</Label><Input type="number" step="0.01" value={form.monto} onChange={(e) => setForm({ ...form, monto: Number(e.target.value) })} /></div>
    </div>
  );
}
