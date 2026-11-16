import { supabase } from "@/integrations/supabase/client";
export const TZ = "America/Mexico_City";
import { queryOptions } from "@tanstack/react-query";

export type Rol = "administracion" | "mostrador" | "produccion" | "equipo";

export const rolLabel: Record<Rol, string> = {
  administracion: "Administración",
  mostrador: "Mostrador",
  produccion: "Producción",
  equipo: "Equipo",
};

export const sesionQuery = queryOptions({
  queryKey: ["sesion"],
  queryFn: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) return null;
    const { data: rol } = await supabase.rpc("mi_rol");
    return { user: data.user, rol: (rol ?? null) as Rol | null };
  },
});

export const mxn = (n: number | null | undefined) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(Number(n ?? 0));

export const fechaHora = (s: string | null | undefined) =>
  s ? new Date(s).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short", timeZone: TZ }) : "—";
export const fecha = (s: string | null | undefined) =>
  s ? new Date(s.length === 10 ? s + "T12:00:00" : s).toLocaleDateString("es-MX", { weekday: "short", day: "numeric", month: "short", timeZone: TZ }) : "—";
export const hora = (s: string) => new Date(s).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", timeZone: TZ });

export const hoyISO = (offset = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toLocaleDateString("en-CA", { timeZone: TZ });
};

export function errMsg(e: unknown) {
  if (e && typeof e === "object" && "message" in e) return String((e as { message: string }).message);
  return String(e);
}

export const estadoOrden: Record<string, { label: string; icon: string }> = {
  borrador: { label: "Borrador", icon: "✎" },
  confirmada: { label: "Confirmada", icon: "✓" },
  en_produccion: { label: "En producción", icon: "◐" },
  lista: { label: "Lista", icon: "★" },
  entregada: { label: "Entregada", icon: "⬢" },
  cancelada: { label: "Cancelada", icon: "✕" },
};

export const etapaLabel: Record<string, string> = {
  horneado: "Horneado",
  relleno: "Relleno",
  cobertura: "Cobertura",
  decoracion: "Decoración",
  entrega: "Entrega",
};

export function descargarArchivo(nombre: string, contenido: string, tipo: string) {
  const blob = new Blob([contenido], { type: tipo });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = nombre;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function aCSV(filas: Record<string, unknown>[]) {
  if (!filas.length) return "";
  const cols = Object.keys(filas[0] ?? {});
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  return [cols.join(","), ...filas.map((f) => cols.map((c) => esc(f[c])).join(","))].join("\n");
}

const icsDate = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
export function generarICS(o: { folio: number; titulo: string; inicio: string; descripcion: string; lugar?: string | null }) {
  const ini = new Date(o.inicio);
  const fin = new Date(ini.getTime() + 60 * 60000);
  return [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Obrador//Ordenes//ES", "BEGIN:VEVENT",
    `UID:orden-${o.folio}@obrador`, `DTSTAMP:${icsDate(new Date())}`, `DTSTART:${icsDate(ini)}`, `DTEND:${icsDate(fin)}`,
    `SUMMARY:${o.titulo.replace(/[,;]/g, " ")}`, `DESCRIPTION:${o.descripcion.replace(/\n/g, "\\n").replace(/[,;]/g, " ")}`,
    o.lugar ? `LOCATION:${o.lugar.replace(/[,;]/g, " ")}` : "", "END:VEVENT", "END:VCALENDAR",
  ].filter(Boolean).join("\r\n");
}
