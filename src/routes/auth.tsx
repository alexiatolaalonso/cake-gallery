import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Entrar · Obrador" },
      { name: "description", content: "Acceso al sistema del obrador por rol." },
      { property: "og:title", content: "Entrar · Obrador" },
      { property: "og:description", content: "Acceso al sistema del obrador por rol." },
    ],
  }),
  component: AuthPage,
});

const cuentas: [string, string][] = [
  ["Administración", "admin@obrador.test"],
  ["Mostrador", "mostrador@obrador.test"],
  ["Producción", "produccion@obrador.test"],
  ["Equipo (Decoración)", "equipo@obrador.test"],
  ["Equipo (Armado)", "armado@obrador.test"],
];

function AuthPage() {
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [cargando, setCargando] = useState(false);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setCargando(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password: pass });
    setCargando(false);
    if (error) {
      toast.error("Correo o contraseña incorrectos");
      return;
    }
    nav({ to: "/inicio", replace: true });
  }

  return (
    <main className="grid min-h-screen md:grid-cols-2">
      <section className="pizarra hidden flex-col justify-between p-12 md:flex">
        <p className="text-sm uppercase tracking-[0.3em] text-gold">Cake Gallery</p>
        <div>
          <h1 className="text-5xl font-bold leading-tight">
            Cada pastel,
            <br />
            una obra.
          </h1>
          <p className="mt-4 max-w-sm opacity-80">
            Cotiza por porciones, planifica hacia atrás desde la entrega y lleva el betún, los pisos y el anticipo en un
            solo lugar.
          </p>
        </div>
        <p className="text-xs opacity-60">Sistema interno · No es comprobante fiscal</p>
      </section>
      <section className="flex items-center justify-center p-6">
        <form onSubmit={entrar} className="w-full max-w-sm space-y-5">
          <h2 className="text-3xl font-bold">Entrar al obrador</h2>
          <div className="space-y-2">
            <Label htmlFor="email">Correo</Label>
            <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pass">Contraseña</Label>
            <Input id="pass" type="password" required value={pass} onChange={(e) => setPass(e.target.value)} />
          </div>
          <Button className="w-full" disabled={cargando}>
            {cargando ? "Entrando…" : "Entrar"}
          </Button>
          <div className="rounded-lg border bg-card p-4 text-sm">
            <p className="mb-2 font-bold">
              Cuentas de prueba · contraseña <code>Obrador2026!</code>
            </p>
            <ul className="space-y-1">
              {cuentas.map(([r, c]) => (
                <li key={c}>
                  <button
                    type="button"
                    className="text-left underline-offset-2 hover:underline"
                    onClick={() => {
                      setEmail(c);
                      setPass("Obrador2026!");
                    }}
                  >
                    <span className="font-semibold">{r}:</span> {c}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </form>
      </section>
    </main>
  );
}
