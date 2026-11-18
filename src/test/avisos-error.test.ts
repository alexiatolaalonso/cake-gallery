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

  it("explica en español que algo no se puede borrar porque tiene consumos encima", () => {
    expect(
      errMsg({
        code: "23503",
        message:
          'update or delete on table "tareas" violates foreign key constraint "consumos_tarea_id_fkey" on table "consumos"',
        details: 'Key (id)=(6ec699ae-0fa4-480c-bca5-c5aa8e20c2fd) is still referenced from table "consumos".',
      }),
    ).toBe("Hay datos ya registrados que dependen de esto, así que no se puede borrar.");
  });

  it("avisa en español cuando falta un dato obligatorio", () => {
    expect(
      errMsg({
        code: "23503",
        message: 'insert or update on table "tareas" violates foreign key constraint "tareas_equipo_id_fkey"',
        details: "Key (equipo_id)=(11111111-1111-1111-1111-111111111111) is not present in table \"equipos\".",
      }),
    ).toBe("Falta un dato obligatorio o ya no existe.");
  });

  it("traduce el fallo interno al cambiar un pedido", () => {
    expect(errMsg({ message: "DELETE requires a WHERE clause" })).toBe("Error interno al procesar el cambio. Inténtalo de nuevo.");
  });
});
