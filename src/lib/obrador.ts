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

export const TIPOS_CLIENTE = [
  { valor: "particular", nombre: "Particular" },
  { valor: "salon", nombre: "Salón" },
] as const;

export const etiquetaTipoCliente = (t?: string | null) =>
  TIPOS_CLIENTE.find((x) => x.valor === t)?.nombre ?? t ?? "";

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

const TRADUCCIONES: [RegExp, string][] = [
  [/invalid input syntax for type (integer|bigint|numeric)/i, "Ese valor debe ser un número entero, sin decimales ni letras."],
  [/invalid input syntax for type uuid/i, "Alguna opción seleccionada ya no es válida. Vuelve a elegirla."],
  [/invalid input syntax for type (date|timestamp|time)/i, "La fecha o la hora escrita no es válida. Usá el calendario."],
  [/numeric field overflow/i, "El número escrito es demasiado grande."],
  [/value too long for type character/i, "El texto escrito es demasiado largo."],
  [/duplicate key value violates unique constraint/i, "Ese dato ya existe en el sistema."],
  [/is still referenced from table/i, "Hay datos ya registrados que dependen de esto, así que no se puede borrar."],
  [/violates foreign key constraint/i, "Falta un dato obligatorio o ya no existe."],
  [/violates check constraint/i, "El valor no cumple una regla del sistema."],
  [/violates not-null constraint|null value in column/i, "Falta un dato obligatorio."],
  [/permission denied/i, "No tenés permiso para hacer esto."],
  [/row-level security/i, "No tenés permiso para ver o modificar estos datos."],
  [/could not find the function|function .* does not exist/i, "Esta acción ya no está disponible. Recargá la página."],
  [/(failed to fetch|networkerror|fetch failed|json object request failed)/i, "No hay conexión con el servidor. Revisá el internet e intentá de nuevo."],
  [/(timeout|timed out)/i, "El servidor tardó demasiado en responder. Intentá de nuevo."],
];

export function errMsg(e: unknown) {
  const o = e && typeof e === "object" ? (e as { message?: unknown; details?: unknown }) : null;
  const msg = o && typeof o.message === "string" ? o.message : String(e);
  const detalles = o && typeof o.details === "string" ? `${msg} ${o.details}` : msg;
  for (const [patron, enEspanol] of TRADUCCIONES) if (patron.test(detalles)) return enEspanol;
  return msg;
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
  relleno: "Relleno y armado",
  cobertura: "Cobertura",
  decoracion: "Decoración",
  entrega: "Entrega",
  empaque: "Empaque",
  armado: "Armado",
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

export const secuenciaEtapas = ["horneado", "relleno", "cobertura", "decoracion", "empaque"];

export const pasosEtapa: Record<string, string[]> = {
  horneado: ["Pesar los ingredientes de la receta del sabor", "Preparar los moldes (engrasar y enharinar)", "Mezclar la masa según la receta", "Hornear y comprobar el punto con un palillo", "Desmoldar y dejar enfriar sobre rejilla"],
  relleno: ["Nivelar los bizcochos y cortarlos en capas", "Almibarar cada capa", "Untar el relleno de forma pareja", "Apilar las capas bien centradas", "Si tiene varios pisos, poner los soportes en cada piso", "Refrigerar hasta que esté firme"],
  armado: ["Nivelar los bizcochos y cortarlos en capas", "Almibarar cada capa", "Untar el relleno de forma pareja", "Apilar las capas bien centradas", "Si tiene varios pisos, poner los soportes en cada piso", "Refrigerar hasta que esté firme"],
  cobertura: ["Aplicar una capa fina de migas", "Refrigerar 20–30 minutos", "Aplicar la cobertura final", "Alisar laterales y parte de arriba", "Revisar que no queden huecos ni burbujas"],
  decoracion: ["Leer la descripción del diseño del pedido", "Preparar colores y elementos decorativos", "Decorar según el nivel de diseño", "Revisar el acabado final"],
  empaque: ["Colocar el pastel en su base de cartón", "Meterlo en caja y etiquetar con folio y cliente", "Dejarlo en refrigeración listo para entrega"],
};

export type Riesgo = { orden_id: string; folio: number; insumo: string; falta: number; unidad: string; necesaria_para: string };
/** Pedidos confirmados cuyo ingrediente no llega a tiempo (también pasa a merma los lotes que vencen hoy). */
export const riesgoQuery = queryOptions({
  queryKey: ["en_riesgo"],
  queryFn: async () => ((await supabase.rpc("ordenes_en_riesgo")).data ?? []) as Riesgo[],
});
