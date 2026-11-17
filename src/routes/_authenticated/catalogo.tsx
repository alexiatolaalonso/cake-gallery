import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { errMsg, mxn } from "@/lib/obrador";
import { meta, Pagina } from "@/components/Pagina";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/catalogo")({
  head: () => meta("Catálogo y recetas", "Recetas de bizcochos, rellenos y coberturas del obrador"),
  component: Catalogo,
});

type Comp = "sabor" | "relleno" | "cobertura";
const tabs: { k: Comp; t: string; tabla: "sabores" | "rellenos" | "coberturas" }[] = [
  { k: "sabor", t: "Bizcochos", tabla: "sabores" },
  { k: "relleno", t: "Rellenos", tabla: "rellenos" },
  { k: "cobertura", t: "Coberturas", tabla: "coberturas" },
];
type Rec = { id: string; componente: Comp; componente_id: string; insumo_id: string; cantidad_por_10: number };

function Catalogo() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<Comp>("sabor");
  const actual = tabs.find((x) => x.k === tab)!;
  const { data } = useQuery({
    queryKey: ["catalogo-recetas"],
    queryFn: async () => {
      const [s, r, c, i, rec] = await Promise.all([
        supabase.from("sabores").select("*").order("nombre"),
        supabase.from("rellenos").select("*").order("nombre"),
        supabase.from("coberturas").select("*").order("nombre"),
        supabase.from("insumos").select("*").order("nombre"),
        supabase.from("recetas").select("*").order("id"),
      ]);
      return { sabor: s.data ?? [], relleno: r.data ?? [], cobertura: c.data ?? [], insumos: i.data ?? [], recetas: (rec.data ?? []) as Rec[] };
    },
  });
  const refrescar = () => { qc.invalidateQueries({ queryKey: ["catalogo-recetas"] }); qc.invalidateQueries({ queryKey: ["catalogo"] }); };
  const [nuevo, setNuevo] = useState({ nombre: "", recargo: 0 });

  async function crear() {
    const { error } = await supabase.from(actual.tabla).insert({ nombre: nuevo.nombre.trim(), recargo: nuevo.recargo });
    if (error) { toast.error(errMsg(error)); return; }
    toast.success(`${nuevo.nombre} añadido`); setNuevo({ nombre: "", recargo: 0 }); refrescar();
  }

  const lista = data?.[tab] ?? [];
  return (
    <Pagina titulo="Catálogo" sub="Recetas para 10 porciones, separadas por bizcocho, relleno y cobertura">
      <div className="flex gap-2 overflow-x-auto">
        {tabs.map((x) => (
          <button key={x.k} onClick={() => setTab(x.k)} className={`shrink-0 rounded-full border px-4 py-2 font-bold ${tab === x.k ? "bg-primary text-primary-foreground" : "bg-card"}`}>
            {x.t} ({data?.[x.k].length ?? 0})
          </button>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {lista.map((c) => (
          <Tarjeta key={c.id} comp={tab} tabla={actual.tabla} item={c} insumos={data!.insumos} recetas={data!.recetas.filter((r) => r.componente === tab && r.componente_id === c.id)} refrescar={refrescar} />
        ))}
      </div>
      <section className="rounded-xl border bg-card p-4">
        <h2 className="mb-3 text-xl font-bold">Añadir {actual.t.toLowerCase().replace(/s$/, "")}</h2>
        <div className="grid gap-2 sm:grid-cols-[1fr_10rem_auto]">
          <Input className="h-12" placeholder="Nombre" value={nuevo.nombre} onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })} />
          <Input className="h-12" type="number" step="0.01" placeholder="Recargo por porción" value={nuevo.recargo} onChange={(e) => setNuevo({ ...nuevo, recargo: Number(e.target.value) })} />
          <button className="h-12 rounded-md bg-primary px-4 font-bold text-primary-foreground disabled:opacity-40" disabled={!nuevo.nombre.trim()} onClick={crear}>Añadir</button>
        </div>
      </section>
    </Pagina>
  );
}

function Tarjeta({ comp, tabla, item, insumos, recetas, refrescar }: { comp: Comp; tabla: "sabores" | "rellenos" | "coberturas"; item: { id: string; nombre: string; recargo: number }; insumos: { id: string; nombre: string; unidad: string; costo: number }[]; recetas: Rec[]; refrescar: () => void }) {
  const [nombre, setNombre] = useState(item.nombre);
  const [recargo, setRecargo] = useState(Number(item.recargo));
  const [cant, setCant] = useState<Record<string, number>>({});
  const [add, setAdd] = useState({ insumo: "", cantidad: 0 });
  const ins = (id: string) => insumos.find((i) => i.id === id);
  const costo = recetas.reduce((s, r) => s + Number(r.cantidad_por_10) * Number(ins(r.insumo_id)?.costo ?? 0), 0);
  const cambiado = nombre !== item.nombre || recargo !== Number(item.recargo);

  async function run(p: PromiseLike<{ error: unknown }>, ok: string) {
    const { error } = await p;
    if (error) { toast.error(errMsg(error)); return; }
    toast.success(ok); refrescar();
  }
  const usados = new Set(recetas.map((r) => r.insumo_id));
  return (
    <article className="space-y-3 rounded-xl border bg-card p-4">
      <div className="grid gap-2 sm:grid-cols-[1fr_10rem_auto]">
        <Input className="h-11 font-bold" value={nombre} onChange={(e) => setNombre(e.target.value)} />
        <label className="flex items-center gap-2 text-sm"><span className="shrink-0">Recargo $</span><Input className="h-11" type="number" step="0.01" value={recargo} onChange={(e) => setRecargo(Number(e.target.value))} aria-label="Recargo por porción" /></label>
        <button className="h-11 rounded-md border px-3 font-bold disabled:opacity-40" disabled={!cambiado || !nombre.trim()} onClick={() => run(supabase.from(tabla).update({ nombre: nombre.trim(), recargo }).eq("id", item.id), "Guardado")}>Guardar</button>
      </div>
      <p className="text-sm text-muted-foreground">Recargo {mxn(recargo)} por porción · costo de la receta {mxn(costo)} por 10 porciones</p>
      {recetas.length === 0 ? <p className="text-sm">Sin receta todavía.</p> : (
        <ul className="divide-y rounded-md border">
          {recetas.map((r) => {
            const i = ins(r.insumo_id);
            const v = cant[r.id] ?? Number(r.cantidad_por_10);
            return (
              <li key={r.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
                <span className="min-w-0 flex-1">{i?.nombre ?? "?"}</span>
                <Input className="h-10 w-24" type="number" step="0.001" value={v} onChange={(e) => setCant({ ...cant, [r.id]: Number(e.target.value) })} />
                <span className="w-8 text-sm">{i?.unidad}</span>
                {v !== Number(r.cantidad_por_10) && <button className="rounded bg-primary px-2 py-1 text-sm font-bold text-primary-foreground" disabled={v <= 0} onClick={() => run(supabase.from("recetas").update({ cantidad_por_10: v }).eq("id", r.id), "Cantidad guardada")}>✓</button>}
                <button className="rounded px-2 py-1 text-sm text-destructive" aria-label="Quitar" onClick={() => run(supabase.from("recetas").delete().eq("id", r.id), "Ingrediente quitado")}>✕</button>
              </li>
            );
          })}
        </ul>
      )}
      <div className="grid grid-cols-[1fr_6rem_auto] gap-2">
        <select className="h-10 min-w-0 rounded-md border bg-card px-2" value={add.insumo} onChange={(e) => setAdd({ ...add, insumo: e.target.value })}>
          <option value="">+ Ingrediente…</option>
          {insumos.filter((i) => !usados.has(i.id)).map((i) => <option key={i.id} value={i.id}>{i.nombre} ({i.unidad})</option>)}
        </select>
        <Input className="h-10" type="number" step="0.001" value={add.cantidad} onChange={(e) => setAdd({ ...add, cantidad: Number(e.target.value) })} />
        <button className="h-10 rounded-md bg-primary px-3 font-bold text-primary-foreground disabled:opacity-40" disabled={!add.insumo || add.cantidad <= 0}
          onClick={() => run(supabase.from("recetas").insert({ componente: comp, componente_id: item.id, insumo_id: add.insumo, cantidad_por_10: add.cantidad }), "Ingrediente añadido").then(() => setAdd({ insumo: "", cantidad: 0 }))}>Añadir</button>
      </div>
    </article>
  );
}
