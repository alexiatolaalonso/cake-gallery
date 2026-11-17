import { useState } from "react";
import { hoyISO } from "@/lib/obrador";

export type Rango = { desde: string; hasta: string };

const mes = (offset: number): Rango => {
  const [y, m] = hoyISO().split("-").map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1 + offset, 1));
  const fin = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
  return { desde: d.toISOString().slice(0, 10), hasta: fin.toISOString().slice(0, 10) };
};

export const atajos: { t: string; r: () => Rango }[] = [
  { t: "Hoy", r: () => ({ desde: hoyISO(), hasta: hoyISO() }) },
  { t: "Últimos 7 días", r: () => ({ desde: hoyISO(-6), hasta: hoyISO() }) },
  { t: "Este mes", r: () => mes(0) },
  { t: "Mes pasado", r: () => mes(-1) },
  { t: "Todo", r: () => ({ desde: "", hasta: "" }) },
];

/** Límites ISO con la zona del obrador (-06:00); null = sin límite */
export const limites = (r: Rango) => ({
  ini: r.desde ? `${r.desde}T00:00:00-06:00` : null,
  fin: r.hasta ? `${r.hasta}T23:59:59.999-06:00` : null,
});

export const enRango = (iso: string | null | undefined, r: Rango) => {
  if (!iso) return !r.desde && !r.hasta;
  const t = new Date(iso).getTime();
  const { ini, fin } = limites(r);
  return (!ini || t >= new Date(ini).getTime()) && (!fin || t <= new Date(fin).getTime());
};

export function useRango() {
  return useState<Rango>(() => mes(0));
}

export function RangoFechas({ valor, cambiar }: { valor: Rango; cambiar: (r: Rango) => void }) {
  const activo = atajos.find((a) => { const r = a.r(); return r.desde === valor.desde && r.hasta === valor.hasta; })?.t;
  return (
    <div className="no-print space-y-3 rounded-xl border bg-card p-3">
      <div className="flex gap-2 overflow-x-auto pb-1">
        {atajos.map((a) => (
          <button key={a.t} onClick={() => cambiar(a.r())} className={`shrink-0 rounded-full border px-3 py-1.5 text-sm font-bold ${activo === a.t ? "bg-primary text-primary-foreground" : "bg-background"}`}>{a.t}</button>
        ))}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="flex items-center gap-2 text-sm"><span className="w-12 shrink-0">Desde</span>
          <input type="date" className="h-11 w-full rounded-md border bg-background px-3" value={valor.desde} max={valor.hasta || undefined} onChange={(e) => cambiar({ ...valor, desde: e.target.value })} /></label>
        <label className="flex items-center gap-2 text-sm"><span className="w-12 shrink-0">Hasta</span>
          <input type="date" className="h-11 w-full rounded-md border bg-background px-3" value={valor.hasta} min={valor.desde || undefined} onChange={(e) => cambiar({ ...valor, hasta: e.target.value })} /></label>
      </div>
    </div>
  );
}
