import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { catalogoQuery, clientesQuery } from "@/lib/catalogo";
import { TZ, errMsg, fechaHora, mxn, TIPOS_CLIENTE, etiquetaTipoCliente } from "@/lib/obrador";
import { Pagina, meta } from "@/components/Pagina";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/cotizador")({
  head: () => meta("Cotizador", "Cotiza pasteles por porciones, sabor, diseño y entrega"),
  component: Cotizador,
});

type Cot = { precio: number; anticipo: number; plazo_dias: number; primera_fecha: string; error: string | null };
const sel = "h-10 w-full rounded-md border border-input bg-card px-3 text-sm";

function Cotizador() {
  const { data: cat } = useQuery(catalogoQuery);
  const { data: clientes = [] } = useQuery(clientesQuery);
  const qc = useQueryClient();
  const nav = useNavigate();
  const [f, setF] = useState({ cliente: "", tipo: "", porciones: 20, sabor: "", relleno: "", cobertura: "", nivel: "", modo: "sucursal" as "sucursal" | "zona1" | "zona2" | "zona3" | "montaje", fecha: "", hora: "16:00", descripcion: "", direccion: "" });
  const [nuevo, setNuevo] = useState({ nombre: "", telefono: "" });
  const [cot, setCot] = useState<Cot | null>(null);
  const [borradorId, setBorradorId] = useState<string | null>(null);
  const [confirmar, setConfirmar] = useState(false);
  const [pago, setPago] = useState({ metodo: "efectivo" as "efectivo" | "transferencia" | "tarjeta", monto: 0, clave: "" });
  const [ocupado, setOcupado] = useState(false);
  const [cap, setCap] = useState<{ ok: boolean; motivo: string | null } | null>(null);

  useEffect(() => {
    if (cat && !f.tipo) setF((x) => ({ ...x, tipo: cat.tipos[0]?.id ?? "", sabor: cat.sabores[0]?.id ?? "", relleno: cat.rellenos[0]?.id ?? "", cobertura: cat.coberturas[0]?.id ?? "", nivel: cat.niveles[0]?.id ?? "" }));
  }, [cat, f.tipo]);

  const fechaISO = useMemo(() => (f.fecha ? new Date(`${f.fecha}T${f.hora}:00-06:00`).toISOString() : null), [f.fecha, f.hora]);
  const tipoSel = cat?.tipos.find((t) => t.id === f.tipo);
  const pMin = tipoSel?.min_porciones ?? 10, pMax = tipoSel?.max_porciones ?? 10000;
  const porcionesOk = f.porciones >= 10 && f.porciones % 10 === 0 && f.porciones >= pMin && f.porciones <= pMax;

  useEffect(() => {
    if (!f.tipo || !f.sabor || !f.nivel) return;
    const t = setTimeout(async () => {
      const { data, error } = await supabase.rpc("cotizar", {
        p_tipo: f.tipo, p_porciones: f.porciones, p_sabor: f.sabor, p_relleno: f.relleno, p_cobertura: f.cobertura,
        p_nivel: f.nivel, p_modo: f.modo, p_fecha: fechaISO ?? new Date().toISOString(),
      });
      if (error) toast.error(errMsg(error));
      else setCot(data as unknown as Cot);
    }, 250);
    return () => clearTimeout(t);
  }, [f.tipo, f.porciones, f.sabor, f.relleno, f.cobertura, f.nivel, f.modo, fechaISO]);

  useEffect(() => {
    setCap(null);
    if (!fechaISO || !cot || cot.error || !porcionesOk) return;
    const t = setTimeout(async () => {
      const { data, error } = await supabase.rpc("verificar_capacidad", {
        p_tipo: f.tipo, p_porciones: f.porciones, p_sabor: f.sabor, p_relleno: f.relleno, p_cobertura: f.cobertura,
        p_nivel: f.nivel, p_modo: f.modo, p_fecha: fechaISO,
      });
      if (error) setCap({ ok: false, motivo: errMsg(error) });
      else setCap(data as unknown as { ok: boolean; motivo: string | null });
    }, 300);
    return () => clearTimeout(t);
  }, [cot, fechaISO, porcionesOk, f.tipo, f.porciones, f.sabor, f.relleno, f.cobertura, f.nivel, f.modo]);

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setF((x) => {
      if (k === "tipo") {
        const t = cat?.tipos.find((y) => y.id === e.target.value);
        const p = t ? Math.min(Math.max(x.porciones, t.min_porciones), t.max_porciones) : x.porciones;
        return { ...x, tipo: e.target.value, porciones: p };
      }
      return { ...x, [k]: k === "porciones" ? Number(e.target.value) : e.target.value };
    });
  const [fichaCliente, setFichaCliente] = useState(false);
  const [ficha, setFicha] = useState({ nombre: "", telefono: "", correo: "", tipo: "particular" });
  async function guardarCliente() {
    if (!ficha.nombre.trim()) { toast.error("Escribe el nombre del cliente"); return; }
    const { data, error } = await supabase.from("clientes").insert({ nombre: ficha.nombre.trim(), telefono: ficha.telefono || null, correo: ficha.correo || null, tipo: ficha.tipo }).select("id").single();
    if (error) { toast.error(errMsg(error)); return; }
    await qc.invalidateQueries({ queryKey: ["clientes"] });
    setF((x) => ({ ...x, cliente: data.id }));
    setFicha({ nombre: "", telefono: "", correo: "", tipo: "particular" });
    setFichaCliente(false);
    toast.success("Cliente guardado");
  }
  const nombreDe = (lista: { id: string; nombre: string }[] | undefined, id: string) => lista?.find((x) => x.id === id)?.nombre ?? "";

  async function clienteId() {
    if (f.cliente) return f.cliente;
    if (!nuevo.nombre.trim()) throw new Error("Elige un cliente o escribe el nombre de uno nuevo");
    const { data, error } = await supabase.from("clientes").insert({ nombre: nuevo.nombre.trim(), telefono: nuevo.telefono || null }).select("id").single();
    if (error) throw error;
    qc.invalidateQueries({ queryKey: ["clientes"] });
    setF((x) => ({ ...x, cliente: data.id }));
    return data.id;
  }

  async function guardar() {
    if (!porcionesOk) throw new Error(`Este pastel admite de ${pMin} a ${pMax} porciones, de 10 en 10`);
    if (!fechaISO) throw new Error("Indica fecha y hora de entrega");
    const cid = await clienteId();
    const { data, error } = await supabase.rpc("guardar_borrador", {
      p_id: borradorId as string, p_cliente: cid, p_tipo: f.tipo, p_porciones: f.porciones, p_sabor: f.sabor, p_relleno: f.relleno,
      p_cobertura: f.cobertura, p_nivel: f.nivel, p_modo: f.modo, p_fecha: fechaISO, p_descripcion: f.descripcion, p_direccion: f.direccion,
    });
    if (error) throw error;
    setBorradorId(data as string);
    return data as string;
  }

  async function onGuardar() {
    setOcupado(true);
    try { await guardar(); toast.success("Borrador guardado"); } catch (e) { toast.error(errMsg(e)); } finally { setOcupado(false); }
  }

  function textoWhatsApp() {
    return [
      "¡Hola! Te comparto la cotización de tu pastel 🎂",
      `• ${nombreDe(cat?.tipos, f.tipo)} · ${f.porciones} porciones`,
      `• Sabor: ${nombreDe(cat?.sabores, f.sabor)} · Relleno: ${nombreDe(cat?.rellenos, f.relleno)}`,
      `• Cobertura: ${nombreDe(cat?.coberturas, f.cobertura)} · Diseño: ${nombreDe(cat?.niveles, f.nivel)}`,
      `• Entrega: ${f.modo}${fechaISO ? " · " + fechaHora(fechaISO) : ""}`,
      f.descripcion ? `• Referencia: ${f.descripcion}` : "",
      `Total: ${mxn(cot?.precio)} · Anticipo (50%): ${mxn(cot?.anticipo)}`,
      "Se confirma con el anticipo.",
    ].filter(Boolean).join("\n");
  }
  function compartir() {
    const tel = (clientes.find((c) => c.id === f.cliente)?.telefono ?? nuevo.telefono ?? "").replace(/\D/g, "");
    window.open(`https://wa.me/${tel ? "52" + tel : ""}?text=${encodeURIComponent(textoWhatsApp())}`, "_blank");
  }

  async function abrirConfirmar() {
    setOcupado(true);
    try {
      await guardar();
      setPago({ metodo: "efectivo", monto: cot?.anticipo ?? 0, clave: crypto.randomUUID() });
      setConfirmar(true);
    } catch (e) { toast.error(errMsg(e)); } finally { setOcupado(false); }
  }
  async function onConfirmar() {
    setOcupado(true);
    const { data, error } = await supabase.rpc("confirmar_orden", { p_orden: borradorId!, p_metodo: pago.metodo, p_monto: pago.monto, p_clave: pago.clave });
    setOcupado(false);
    if (error) { toast.error(errMsg(error)); return; }
    const r = data as { folio: number; factura: string };
    toast.success(`Orden #${r.folio} confirmada · factura ${r.factura ?? ""}`);
    qc.invalidateQueries();
    nav({ to: "/ordenes/$id", params: { id: borradorId! } });
  }

  if (!cat) return <p>Cargando catálogo…</p>;
  const tipo = cat.tipos.find((t) => t.id === f.tipo);

  return (
    <Pagina titulo="Cotizador" sub="Mostrador · cada pastel es una orden">
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6 rounded-xl border bg-card p-6">
          <fieldset className="grid gap-4 sm:grid-cols-2">
            <legend className="mb-2 font-display text-lg font-bold">Cliente</legend>
            <div className="space-y-1 sm:col-span-2">
              <div className="flex items-center justify-between"><Label>Cliente registrado</Label>
                <Button type="button" size="sm" variant="outline" onClick={() => setFichaCliente(true)}>+ Nuevo cliente</Button></div>
              <select className={sel} value={f.cliente} onChange={set("cliente")}>
                <option value="">— Nuevo cliente —</option>
                {clientes.map((c) => <option key={c.id} value={c.id}>{c.nombre} ({etiquetaTipoCliente(c.tipo)})</option>)}
              </select>
            </div>
            {!f.cliente && (<>
              <div className="space-y-1"><Label>Nombre</Label><Input value={nuevo.nombre} onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })} /></div>
              <div className="space-y-1"><Label>WhatsApp (10 dígitos)</Label><Input value={nuevo.telefono} onChange={(e) => setNuevo({ ...nuevo, telefono: e.target.value })} /></div>
            </>)}
          </fieldset>

          <fieldset className="grid gap-4 sm:grid-cols-2">
            <legend className="mb-2 font-display text-lg font-bold">El pastel</legend>
            <div className="space-y-1"><Label>Tipo de pastel</Label>
              <select className={sel} value={f.tipo} onChange={set("tipo")}>{cat.tipos.map((t) => <option key={t.id} value={t.id}>{t.nombre} · {mxn(t.precio_base)}/porción</option>)}</select>
              {tipo && <p className="text-xs text-muted-foreground">De {tipo.min_porciones} a {tipo.max_porciones} porciones{tipo.requiere_montaje ? " · Requiere montaje" : ""}</p>}
            </div>
            <div className="space-y-1"><Label htmlFor="porc">Porciones (múltiplos de 10)</Label>
              <Input id="porc" type="number" step={10} min={pMin} max={pMax} value={f.porciones} onChange={set("porciones")} aria-invalid={!porcionesOk} />
              {!porcionesOk && <p className="text-xs font-bold text-destructive">⚠ {f.porciones} no es válido: {tipoSel?.nombre ?? "este pastel"} admite de {pMin} a {pMax} porciones, de 10 en 10</p>}
            </div>
            <div className="space-y-1"><Label>Sabor del pan</Label><select className={sel} value={f.sabor} onChange={set("sabor")}>{cat.sabores.map((x) => <option key={x.id} value={x.id}>{x.nombre}{x.recargo > 0 ? ` (+${mxn(x.recargo)}/porción)` : ""}</option>)}</select></div>
            <div className="space-y-1"><Label>Relleno</Label><select className={sel} value={f.relleno} onChange={set("relleno")}>{cat.rellenos.map((x) => <option key={x.id} value={x.id}>{x.nombre}{x.recargo > 0 ? ` (+${mxn(x.recargo)}/porción)` : ""}</option>)}</select></div>
            <div className="space-y-1"><Label>Cobertura</Label><select className={sel} value={f.cobertura} onChange={set("cobertura")}>{cat.coberturas.map((x) => <option key={x.id} value={x.id}>{x.nombre}{x.recargo > 0 ? ` (+${mxn(x.recargo)}/porción)` : ""}</option>)}</select></div>
            <div className="space-y-1"><Label>Nivel de diseño</Label><select className={sel} value={f.nivel} onChange={set("nivel")}>{cat.niveles.map((x) => <option key={x.id} value={x.id}>{x.nombre}{x.dias_plazo > 0 ? ` · +${x.dias_plazo} día de plazo` : ""}{x.recargo > 0 ? ` (+${mxn(x.recargo)}/porción)` : ""}</option>)}</select></div>
            <div className="space-y-1 sm:col-span-2"><Label>Descripción de referencia</Label><Textarea value={f.descripcion} onChange={set("descripcion")} placeholder="Colores, letras, pisos, foto de referencia…" /></div>
          </fieldset>

          <fieldset className="grid gap-4 sm:grid-cols-3">
            <legend className="mb-2 font-display text-lg font-bold">Entrega</legend>
            <div className="space-y-1"><Label>Modo</Label>
              <select className={sel} value={f.modo} onChange={set("modo")}>
                <option value="sucursal">Recoge en sucursal (11:15–19:00)</option><option value="zona1">Envío Zona 1 (+$90)</option><option value="zona2">Envío Zona 2 (+$160)</option><option value="zona3">Envío Zona 3 (+$260)</option><option value="montaje">Montaje de boda (+$450)</option>
              </select></div>
            <div className="space-y-1"><Label>Fecha</Label><Input type="date" value={f.fecha} onChange={set("fecha")} /></div>
            <div className="space-y-1"><Label>Hora</Label><Input type="time" value={f.hora} min={f.modo === "sucursal" ? "11:15" : undefined} max={f.modo === "sucursal" ? "19:00" : undefined} onChange={set("hora")} /></div>
            {f.modo !== "sucursal" && <div className="space-y-1 sm:col-span-3"><Label>Dirección</Label><Input value={f.direccion} onChange={set("direccion")} /></div>}
          </fieldset>
        </div>

        <aside className="space-y-4">
          <div className="sticky top-4 space-y-4 rounded-xl border-2 border-gold bg-card p-6">
            <p className="text-sm uppercase tracking-widest text-muted-foreground">Precio calculado</p>
            <p className="font-display text-4xl font-bold">{mxn(cot?.precio)}</p>
            <p className="text-sm">Anticipo 50%: <b>{mxn(cot?.anticipo)}</b></p>
            <p className="text-sm">Plazo mínimo: <b>{cot?.plazo_dias ?? "—"} días</b></p>
            {cot && (cot.error || !f.fecha ? (
              <div role="alert" className="rounded-md border border-destructive bg-destructive/10 p-3 text-sm">
                <p className="font-bold text-destructive">⚠ {f.fecha ? cot.error : "Falta elegir fecha de entrega"}</p>
                <p className="mt-1">Primera fecha posible: <b>{fechaHora(cot.primera_fecha)}</b></p>
                <Button size="sm" variant="outline" className="mt-2" onClick={() => {
                  const d = new Date(cot.primera_fecha);
                  setF((x) => ({ ...x, fecha: d.toLocaleDateString("en-CA", { timeZone: TZ }), hora: "12:00" }));
                }}>Usar esa fecha</Button>
              </div>
            ) : (
              !cap ? <p className="rounded-md border p-3 text-sm text-muted-foreground">Comprobando capacidad del obrador…</p>
              : cap.ok ? <p className="rounded-md border border-success bg-success/10 p-3 text-sm font-bold text-success">✓ Hay capacidad: se puede confirmar con anticipo.</p>
              : <div role="alert" className="rounded-md border border-destructive bg-destructive/10 p-3 text-sm"><p className="font-bold text-destructive">⚠ No se puede confirmar en esa fecha</p><p className="mt-1">{cap.motivo}</p></div>
            ))}
            <div className="grid gap-2">
              <Button variant="outline" onClick={onGuardar} disabled={ocupado || !porcionesOk}>Guardar borrador</Button>
              <Button variant="outline" onClick={compartir} disabled={!cot}>Compartir por WhatsApp</Button>
              <Button onClick={abrirConfirmar} disabled={ocupado || !porcionesOk || !!cot?.error || !f.fecha || !cap?.ok}>Confirmar con anticipo</Button>
            </div>
          </div>
        </aside>
      </div>

      <Dialog open={fichaCliente} onOpenChange={setFichaCliente}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nuevo cliente</DialogTitle></DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1 sm:col-span-2"><Label htmlFor="fc-nombre">Nombre *</Label><Input id="fc-nombre" value={ficha.nombre} onChange={(e) => setFicha({ ...ficha, nombre: e.target.value })} /></div>
            <div className="space-y-1"><Label htmlFor="fc-tel">WhatsApp (10 dígitos)</Label><Input id="fc-tel" value={ficha.telefono} onChange={(e) => setFicha({ ...ficha, telefono: e.target.value })} /></div>
            <div className="space-y-1"><Label htmlFor="fc-correo">Correo</Label><Input id="fc-correo" type="email" value={ficha.correo} onChange={(e) => setFicha({ ...ficha, correo: e.target.value })} /></div>
            <div className="space-y-1 sm:col-span-2"><Label htmlFor="fc-tipo">Tipo de cliente</Label>
              <select id="fc-tipo" className={sel} value={ficha.tipo} onChange={(e) => setFicha({ ...ficha, tipo: e.target.value })}>
                {TIPOS_CLIENTE.map((t) => <option key={t.valor} value={t.valor}>{t.nombre}</option>)}
              </select></div>
          </div>
          <DialogFooter><Button onClick={guardarCliente}>Guardar cliente</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmar} onOpenChange={setConfirmar}>
        <DialogContent>
          <DialogHeader><DialogTitle>Confirmar con anticipo</DialogTitle></DialogHeader>
          <p className="text-sm">Total {mxn(cot?.precio)} · mínimo 50%: <b>{mxn(cot?.anticipo)}</b>. Se verifican minutos libres en cada etapa e insumos.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1"><Label>Método</Label>
              <select className={sel} value={pago.metodo} onChange={(e) => setPago({ ...pago, metodo: e.target.value as typeof pago.metodo })}>
                <option value="efectivo">Efectivo</option><option value="transferencia">Transferencia</option><option value="tarjeta">Tarjeta</option>
              </select></div>
            <div className="space-y-1"><Label>Monto</Label><Input type="number" step="0.01" value={pago.monto} onChange={(e) => setPago({ ...pago, monto: Number(e.target.value) })} /></div>
          </div>
          <DialogFooter><Button onClick={onConfirmar} disabled={ocupado}>{ocupado ? "Confirmando…" : "Confirmar orden"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </Pagina>
  );
}
