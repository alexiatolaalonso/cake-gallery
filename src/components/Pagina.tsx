import type { ReactNode } from "react";
export function Pagina({ titulo, sub, acciones, volver, children }: { titulo: string; sub?: string; acciones?: ReactNode; volver?: ReactNode; children: ReactNode }) {
  return (
    <div className="space-y-6">
      {volver && <div className="no-print">{volver}</div>}
      <div className="flex flex-wrap items-end justify-between gap-3 border-b pb-4">
        <div>
          <h1 className="text-3xl font-bold">{titulo}</h1>
          {sub && <p className="text-muted-foreground">{sub}</p>}
        </div>
        {acciones && <div className="no-print flex flex-wrap gap-2">{acciones}</div>}
      </div>
      {children}
    </div>
  );
}
export const meta = (t: string, d: string) => ({ meta: [{ title: `${t} · Obrador` }, { name: "description", content: d }, { property: "og:title", content: `${t} · Obrador` }, { property: "og:description", content: d }] });
