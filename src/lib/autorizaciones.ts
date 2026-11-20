/** Datos para pedir horas extra a partir del aviso «Sin lugar para <etapa> en el equipo <nombre> (<min> min)». */
export function horasExtraDesdeAviso(msg: string, fechaEntrega: string) {
  const m = /Sin lugar para (\S+) en el equipo (.+?) \((\d+) min\)/.exec(msg);
  if (!m) return null;
  const etapa = m[1] ?? "";
  const off = etapa === "relleno" ? 1 : etapa === "horneado" ? 2 : 0;
  const d = new Date(`${fechaEntrega}T12:00:00-06:00`);
  d.setUTCDate(d.getUTCDate() - off);
  return { etapa, equipo: m[2] ?? "", minutos: Number(m[3]), fecha: d.toISOString().slice(0, 10) };
}
export const pideUrgencia = (msg: string | null | undefined) => !!msg && /autorización de urgencia/i.test(msg);
