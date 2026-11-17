import { useQuery } from "@tanstack/react-query";
import { fechaHora, riesgoQuery } from "@/lib/obrador";

/** Etiqueta corta «En riesgo» para un pedido; con `detalle` explica qué falta. */
export function EnRiesgo({ orden, detalle = false }: { orden: string; detalle?: boolean }) {
  const { data = [] } = useQuery(riesgoQuery);
  const faltas = data.filter((r) => r.orden_id === orden);
  if (!faltas.length) return null;
  if (!detalle) return <span className="inline-flex items-center rounded-full border border-destructive bg-destructive px-2 py-0.5 text-xs font-bold text-destructive-foreground">⚠ En riesgo</span>;
  return (
    <div className="rounded-lg border-2 border-destructive bg-card p-3 text-sm">
      <p className="font-bold text-destructive">⚠ En riesgo: falta ingrediente a tiempo</p>
      <ul className="mt-1 list-disc pl-5">
        {faltas.map((r) => <li key={r.insumo}>{r.insumo}: faltan {Number(r.falta)} {r.unidad} para el {fechaHora(r.necesaria_para)}</li>)}
      </ul>
    </div>
  );
}
