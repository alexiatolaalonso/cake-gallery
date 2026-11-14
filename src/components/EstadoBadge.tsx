import { estadoOrden } from "@/lib/obrador";
import { cn } from "@/lib/utils";

const tono: Record<string, string> = {
  borrador: "bg-muted text-muted-foreground border-border",
  confirmada: "bg-secondary text-secondary-foreground border-gold",
  en_produccion: "bg-accent text-accent-foreground border-accent",
  lista: "bg-success text-success-foreground border-success",
  entregada: "bg-primary text-primary-foreground border-primary",
  cancelada: "bg-destructive text-destructive-foreground border-destructive",
};

export function EstadoBadge({ estado }: { estado: string }) {
  const e = estadoOrden[estado] ?? { label: estado, icon: "•" };
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold", tono[estado])}>
      <span aria-hidden>{e.icon}</span>
      {e.label}
    </span>
  );
}

const capTono: Record<string, { label: string; icon: string; cls: string }> = {
  con_lugar: { label: "Con lugar", icon: "○", cls: "bg-success text-success-foreground" },
  justo: { label: "Justo", icon: "◑", cls: "bg-accent text-accent-foreground" },
  saturado: { label: "Saturado", icon: "●", cls: "bg-destructive text-destructive-foreground" },
  sin_capacidad: { label: "Sin capacidad", icon: "⊘", cls: "bg-primary text-primary-foreground" },
};
export function CapacidadBadge({ estado }: { estado: string }) {
  const c = capTono[estado];
  return (
    <span className={cn("inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-bold", c?.cls)}>
      <span aria-hidden>{c?.icon}</span>
      {c?.label}
    </span>
  );
}
