import { describe, expect, it } from "vitest";
import { horasExtraDesdeAviso, pideUrgencia } from "@/lib/autorizaciones";

describe("autorizaciones", () => {
  it("lee equipo, minutos y día de un aviso sin hueco (relleno = 1 día antes)", () => {
    const r = horasExtraDesdeAviso("Sin lugar para relleno en el equipo Armado (180 min) para esa fecha. Elige otra fecha o autoriza horas extra", "2026-11-25");
    expect(r).toEqual({ etapa: "relleno", equipo: "Armado", minutos: 180, fecha: "2026-11-24" });
  });
  it("detecta cuando el pedido necesita permiso de urgencia", () => {
    expect(pideUrgencia("Plazo mínimo de 4 días. Primera fecha posible: 24/11/2026. Para antes hace falta autorización de urgencia de Administración (+15 %)")).toBe(true);
    expect(pideUrgencia("Ya empezó Decoración: no se admiten cambios")).toBe(false);
  });
});
