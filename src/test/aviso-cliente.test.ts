import { describe, expect, it } from "vitest";
import { mensajeCambio, telWhatsApp, enlaceWhatsApp } from "@/lib/aviso-cliente";

describe("aviso al cliente por WhatsApp", () => {
  it("añade +52 a un número de 10 dígitos", () => expect(telWhatsApp("55 1234-5678")).toBe("525512345678"));
  it("respeta un número con prefijo", () => expect(telWhatsApp("+34 600 111 222")).toBe("34600111222"));
  it("sin teléfono devuelve null", () => expect(telWhatsApp("")).toBeNull());
  it("arma el mensaje con antes → ahora", () => {
    const m = mensajeCambio({ cliente: "Ana López", folio: 1071, cambios: [{ campo: "Porciones", antes: "30", ahora: "40" }], total: "$3,200", saldo: "$1,600" });
    expect(m).toBe("Hola Ana, tu pedido #1071 de Cake Gallery se ha modificado: Porciones: 30 → 40. Nuevo total: $3,200 (saldo pendiente $1,600).");
    expect(enlaceWhatsApp("52551", m)).toContain("https://wa.me/52551?text=Hola%20Ana");
  });
});
