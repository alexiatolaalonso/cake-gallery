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
import { EstadoHorasExtra, HorasExtraDialog, pedirAutorizacion, useSolicitudesOrden } from "@/components/Autorizaciones";
import { horasExtraDesdeAviso, pideUrgencia } from "@/lib/autorizaciones";
import { enlaceWhatsApp, mensajeCambio, telWhatsApp, type Cambio } from "@/lib/aviso-cliente";
import { TZ } from "@/lib/obrador";

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
  const [dlg, setDlg] = useState<null | "aviso" | "cambio" | "cancelar" | "cobro" | "entregar" | "confirmar">(null);
  const [form, setForm] = useState<{ porciones: number; sabor: string; relleno: string; cobertura: string; fecha: string; hora: string; motivo: string; metodo: Metodo; monto: number; clave: string }>({ porciones: 0, sabor: "", relleno: "", cobertura: "", fecha: "", hora: "", motivo: "", metodo: "efectivo", monto: 0, clave: "" });

  const { data: hermanas } = useQuery({
    queryKey: ["orden-hermanas", id, data?.o?.fecha_entrega],
    enabled: s?.rol === "administracion" && !!data?.o && data.o.clientes?.tipo === "salon" && data.o.modo_entrega !== "sucursal",
    queryFn: async () => {
      const o = data!.o!;
      const dia = new Date(o.fecha_entrega).toLocaleDateString("en-CA", { timeZone: TZ });
      const desde = new Date(`${dia}T00:00:00-06:00`).toISOString();
      const hasta = new Date(new Date(desde).getTime() + 86400000).toISOString();
      const { data: r } = await supabase.from("ordenes").select("id, folio, envio_compartido_con, modo_entrega")
        .eq("cliente_id", o.cliente_id).neq("id", o.id).gte("fecha_entrega", desde).lt("fecha_entrega", hasta)
        .in("estado", ["borrador", "confirmada", "en_produccion", "lista"]).neq("modo_entrega", "sucursal");
      return r ?? [];
    },
  });
  const [aviso, setAviso] = useState<{ texto: string; tel: string | null }>({ texto: "", tel: null });
  const [errCambio, setErrCambio] = useState<string | null>(null);
  const [heOpen, setHeOpen] = useState(false);
  const { data: solicitudes } = useSolicitudesOrden(id);
  if (isLoading || !data?.o) return <p>{isLoading ? "Cargando…" : "Orden no encontrada o sin acceso."}</p>;
  const { o, tareas, cobros, facturas } = data;
  const pagado = cobros.reduce((a, c) => a + Number(c.monto), 0);
  const saldo = Number(o.precio) - pagado;
  const refrescar = () => qc.invalidateQueries();

  const tipo = o.tipos_pastel;
  const avisoPorciones = (() => {
    const p = form.porciones;
    if (p === 0) return "Escribe las porciones (de 10 en 10).";
    if (!Number.isInteger(p)) return "Las porciones deben ser un número entero, sin decimales.";
    if (p < 10 || p % 10 !== 0) return "Las porciones van de 10 en 10 (10, 20, 30…).";
    if (tipo?.min_porciones != null && tipo?.max_porciones != null && (p < tipo.min_porciones || p > tipo.max_porciones))
      return `${tipo.nombre ?? "Este pastel"} admite de ${tipo.min_porciones} a ${tipo.max_porciones} porciones.`;
    return "";
  })();

  const fechaLocal = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: TZ });
  const horaLocal = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: TZ });
  const nombreDe = (lista: { id: string; nombre: string }[] | undefined, id: string) => lista?.find((x) => x.id === id)?.nombre ?? "—";
  const fechaNueva = form.fecha && form.hora ? new Date(`${form.fecha}T${form.hora}:00-06:00`).toISOString() : o.fecha_entrega;
  const cambios: Cambio[] = [];
  if (dlg === "cambio" && cat) {
    if (form.porciones !== o.porciones) cambios.push({ campo: "Porciones", antes: String(o.porciones), ahora: String(form.porciones) });
    if (form.sabor !== o.sabor_id) cambios.push({ campo: "Sabor", antes: nombreDe(cat.sabores, o.sabor_id), ahora: nombreDe(cat.sabores, form.sabor) });
    if (form.relleno !== o.relleno_id) cambios.push({ campo: "Relleno", antes: nombreDe(cat.rellenos, o.relleno_id), ahora: nombreDe(cat.rellenos, form.relleno) });
    if (form.cobertura !== o.cobertura_id) cambios.push({ campo: "Cobertura", antes: nombreDe(cat.coberturas, o.cobertura_id), ahora: nombreDe(cat.coberturas, form.cobertura) });
    if (new Date(fechaNueva).getTime() !== new Date(o.fecha_entrega).getTime()) cambios.push({ campo: "Entrega", antes: fechaHora(o.fecha_entrega), ahora: fechaHora(fechaNueva) });
  }

  async function aplicarCambio() {
    const lista = [...cambios];
    const { data: d, error } = await supabase.rpc("cambiar_orden", { p_orden: id, p_porciones: form.porciones, p_sabor: form.sabor, p_relleno: form.relleno, p_cobertura: form.cobertura, p_fecha: fechaNueva });
    if (error) { setErrCambio(errMsg(error)); toast.error(errMsg(error)); return; }
    setErrCambio(null);
    const r = d as { precio: number; recargo: number; rehacer?: string[] };
    toast.success(`Nuevo total ${mxn(r.precio)}${r.recargo > 0 ? ` (recargo ${mxn(r.recargo)})` : ""}${r.rehacer?.length ? ` · Se rehace: ${r.rehacer.map((e) => etapaLabel[e] ?? e).join(", ")}` : ""}`);
    const texto = mensajeCambio({ cliente: o!.clientes?.nombre ?? "", folio: o!.folio, cambios: lista, total: mxn(r.precio), saldo: mxn(Math.max(Number(r.precio) - pagado, 0)) });
    setAviso({ texto, tel: telWhatsApp(o!.clientes?.telefono) });
    setDlg("aviso");
    refrescar();
  }

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
          <Button variant="outline" onClick={() => { setForm({ ...form, porciones: o.porciones, sabor: o.sabor_id, relleno: o.relleno_id, cobertura: o.cobertura_id, fecha: fechaLocal(o.fecha_entrega), hora: horaLocal(o.fecha_entrega) }); setErrCambio(null); setDlg("cambio"); }}>Modificar pedido</Button>
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
          {s?.rol === "administracion" && (o.envio_compartido_con ? (
            <div className="flex flex-wrap items-center gap-2 rounded-md border p-3 text-sm">
              <span>🚚 Envío compartido con la orden #{hermanas?.find((h) => h.id === o.envio_compartido_con)?.folio ?? "—"} (envío bonificado en este pedido)</span>
              <Button size="sm" variant="outline" onClick={() => rpc(() => supabase.rpc("compartir_envio", { p_orden: id, p_con: o.envio_compartido_con!, p_compartir: false }), (d) => `Envío compartido quitado · total ${mxn(d.precio)}`)}>Quitar</Button>
            </div>
          ) : (hermanas ?? []).filter((h) => !h.envio_compartido_con).map((h) => (
            <div key={h.id} className="flex flex-wrap items-center gap-2 rounded-md border p-3 text-sm">
              <span>Hay otra orden (#{h.folio}) para este salón el mismo día.</span>
              <Button size="sm" onClick={() => rpc(() => supabase.rpc("compartir_envio", { p_orden: id, p_con: h.id, p_compartir: true }), (d) => `Envío compartido · nuevo total ${mxn(d.precio)}`)}>Compartir envío</Button>
            </div>
          )))}
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
          {tareas.filter((t) => t.orden_etapa > 0).map((t) => (
            <li key={t.id} className="rounded-lg border p-3 text-sm">
              <p className="font-bold">{t.orden_etapa}. {etapaLabel[t.etapa]}</p>
              <p>{fechaHora(t.inicio)} → {hora(t.fin)}</p>
              <p>{t.minutos} min · {t.estado === "hecha" ? "✓ Hecha" : t.estado === "en_curso" ? "◐ En curso" : "○ Pendiente"}{t.editada_manual ? " · editada" : ""}</p>
              {t.requiere_revision && <div className="mt-2 space-y-1 rounded bg-destructive/10 p-2">
                <p className="text-xs font-bold text-destructive">⚠ Revisar horario: se movió a mano y el pedido cambió</p>
                {(s?.rol === "administracion" || s?.rol === "produccion") && <Button size="sm" variant="outline" onClick={() => rpc(() => supabase.rpc("marcar_tarea_revisada", { p_tarea: t.id }), () => "Tarea revisada")}>✓ Confirmar revisión</Button>}
              </div>}
            </li>
          ))}
          {!tareas.length && <li className="text-sm text-muted-foreground">Sin tareas (se generan al confirmar).</li>}
        </ol>
      </section>

      <HorasExtraDialog open={heOpen} onOpenChange={setHeOpen} ordenId={id} inicial={errCambio ? horasExtraDesdeAviso(errCambio, fechaLocal(fechaNueva)) : null}
        onDone={() => qc.invalidateQueries({ queryKey: ["solicitudes"] })} />
      <Dialog open={dlg !== null} onOpenChange={(v) => !v && setDlg(null)}>
        <DialogContent>
          {dlg === "confirmar" && <>
            <DialogHeader><DialogTitle>Confirmar con anticipo</DialogTitle></DialogHeader>
            <PagoCampos form={form} setForm={setForm} />
            <DialogFooter><Button onClick={() => rpc(() => supabase.rpc("confirmar_orden", { p_orden: id, p_metodo: form.metodo, p_monto: form.monto, p_clave: form.clave }), (d) => `Confirmada · ${d.factura ?? ""}`)}>Confirmar</Button></DialogFooter>
          </>}
          {dlg === "cambio" && cat && <>
            <DialogHeader><DialogTitle>Modificar pedido</DialogTitle></DialogHeader>
            <p className="text-sm text-muted-foreground">Recalcula tareas, insumos y factura. Permitido hasta que empieza Decoración. Si faltan menos de 3 días, se cobra un recargo del 15 % sobre la diferencia. Lo ya hecho que haya que rehacer se registra como gasto interno, sin cobrarlo al cliente.</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1"><Label htmlFor="cambio-porciones">Porciones</Label>
                <Input id="cambio-porciones" type="number" step={10} min={tipo?.min_porciones ?? 10} max={tipo?.max_porciones ?? 120} value={form.porciones} aria-invalid={!!avisoPorciones} onChange={(e) => setForm({ ...form, porciones: Number(e.target.value) })} />
                {avisoPorciones && <p className="text-xs font-bold text-destructive">⚠ {avisoPorciones}</p>}
              </div>
              <div className="space-y-1"><Label>Sabor</Label><select className={sel} value={form.sabor} onChange={(e) => setForm({ ...form, sabor: e.target.value })}>{cat.sabores.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}</select></div>
              <div className="space-y-1"><Label>Relleno</Label><select className={sel} value={form.relleno} onChange={(e) => setForm({ ...form, relleno: e.target.value })}>{cat.rellenos.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}</select></div>
              <div className="space-y-1"><Label>Cobertura</Label><select className={sel} value={form.cobertura} onChange={(e) => setForm({ ...form, cobertura: e.target.value })}>{cat.coberturas.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}</select></div>
              <div className="space-y-1"><Label htmlFor="cambio-fecha">Fecha de entrega</Label><Input id="cambio-fecha" type="date" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} /></div>
              <div className="space-y-1"><Label htmlFor="cambio-hora">Hora</Label><Input id="cambio-hora" type="time" step={900} value={form.hora} onChange={(e) => setForm({ ...form, hora: e.target.value })} /></div>
            </div>
            <p className="text-xs text-muted-foreground">La nueva fecha sigue las reglas del cotizador: plazo mínimo, horario de recogida de 11:15 a 19:00 y hueco en los equipos.</p>
            {cambios.length > 0 ? (
              <ul className="rounded-md bg-muted p-3 text-sm">{cambios.map((c) => <li key={c.campo}><b>{c.campo}:</b> {c.antes} → {c.ahora}</li>)}</ul>
            ) : <p className="text-sm text-muted-foreground">Todavía no has cambiado nada.</p>}
            {errCambio && <div role="alert" className="rounded-md border border-destructive bg-destructive/10 p-3 text-sm">
              <p className="font-bold text-destructive">⚠ {errCambio}</p>
              {pideUrgencia(errCambio) && (() => {
                const u = solicitudes?.find((x) => x.tipo === "urgencia");
                return u?.estado === "pendiente" ? <p className="mt-1">⏳ Esperando que Administración autorice la urgencia…</p>
                  : u?.estado === "aprobada" ? <p className="mt-1 font-bold text-success">✓ Urgencia autorizada: vuelve a pulsar «Aplicar cambio».</p>
                  : <Button size="sm" className="mt-2" onClick={async () => {
                      try { const r = await pedirAutorizacion({ tipo: "urgencia", orden: id, motivo: `Cambio de entrega a ${fechaHora(fechaNueva)} por debajo del plazo` });
                        toast.success(r.estado === "aprobada" ? "Urgencia autorizada" : "Solicitud enviada a Administración"); qc.invalidateQueries({ queryKey: ["solicitudes"] });
                      } catch (e) { toast.error(errMsg(e)); }
                    }}>{s?.rol === "administracion" ? "Autorizar urgencia (+15 %)" : "Solicitar urgencia (+15 %)"}</Button>;
              })()}
              {horasExtraDesdeAviso(errCambio, fechaLocal(fechaNueva)) && <Button size="sm" className="mt-2" onClick={() => setHeOpen(true)}>Solicitar horas extra</Button>}
              <EstadoHorasExtra lista={solicitudes} />
            </div>}
            <DialogFooter><Button disabled={!!avisoPorciones || cambios.length === 0} onClick={aplicarCambio}>Aplicar cambio</Button></DialogFooter>
          </>}
          {dlg === "aviso" && <>
            <DialogHeader><DialogTitle>Avisar al cliente</DialogTitle></DialogHeader>
            <p className="rounded-md bg-muted p-3 text-sm">{aviso.texto}</p>
            {!aviso.tel && <p className="text-sm font-bold text-destructive">⚠ Este cliente no tiene un teléfono válido. Copia el mensaje y envíalo por otro medio.</p>}
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => { navigator.clipboard.writeText(aviso.texto); toast.success("Mensaje copiado"); }}>Copiar mensaje</Button>
              {aviso.tel && <Button asChild><a href={enlaceWhatsApp(aviso.tel, aviso.texto)} target="_blank" rel="noopener noreferrer">Avisar por WhatsApp</a></Button>}
            </DialogFooter>
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
