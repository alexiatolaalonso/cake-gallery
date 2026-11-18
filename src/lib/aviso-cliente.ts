/** Teléfono a dígitos para wa.me; números de 10 dígitos se toman como México (+52). */
export function telWhatsApp(tel?: string | null): string | null {
  const d = (tel ?? "").replace(/\D/g, "");
  if (!d) return null;
  if (d.length === 10) return "52" + d;
  return d.length >= 11 ? d : null;
}

export type Cambio = { campo: string; antes: string; ahora: string };

export function mensajeCambio(o: { cliente: string; folio: number; cambios: Cambio[]; total: string; saldo: string }) {
  const nombre = o.cliente.split(" ")[0] || o.cliente;
  const lista = o.cambios.map((c) => `${c.campo}: ${c.antes} → ${c.ahora}`).join("; ");
  return `Hola ${nombre}, tu pedido #${o.folio} de Cake Gallery se ha modificado: ${lista}. Nuevo total: ${o.total} (saldo pendiente ${o.saldo}).`;
}

export const enlaceWhatsApp = (tel: string, texto: string) => `https://wa.me/${tel}?text=${encodeURIComponent(texto)}`;
