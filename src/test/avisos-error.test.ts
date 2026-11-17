import { describe, expect, it } from "vitest";

import { errMsg } from "@/lib/obrador";

describe("Avisos de error en español", () => {
  it("traduce el aviso que sale al escribir porciones con decimales", () => {
    expect(errMsg({ message: 'invalid input syntax for type integer: "30.5"' })).toBe(
      "Ese valor debe ser un número entero, sin decimales ni letras.",
    );
  });

  it("traduce el aviso de un dato que ya existe", () => {
    expect(errMsg({ message: 'duplicate key value violates unique constraint "clientes_correo_key"' })).toBe(
      "Ese dato ya existe en el sistema.",
    );
  });

  it("deja intactos los avisos que ya vienen en español", () => {
    const aviso = "Las porciones van de 10 en 10 (10, 20, 30…). 25 no es válido";
    expect(errMsg({ message: aviso })).toBe(aviso);
  });
});
