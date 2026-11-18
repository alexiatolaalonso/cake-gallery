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
      { title: "Entrar · Cake Gallery" },
      { name: "description", content: "Acceso al sistema del obrador por rol." },
      { property: "og:title", content: "Entrar · Cake Gallery" },
      { property: "og:description", content: "Acceso al sistema del obrador por rol." },
    ],
  }),
  component: AuthPage,
});

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
    <main className="flex min-h-screen flex-col md:grid md:grid-cols-2">
      <section className="pizarra flex flex-col gap-3 px-6 py-8 md:justify-between md:p-12">
        <p className="text-sm uppercase tracking-[0.3em] text-gold">CAKE GALLERY</p>
        <div>
          <h1 className="text-3xl font-bold leading-tight md:text-5xl">
            Cada pastel,
            <br />
            una obra.
          </h1>
          <p className="mt-4 hidden max-w-sm opacity-80 md:block">
            Cotiza por porciones, planifica hacia atrás desde la entrega y lleva el betún, los pisos y el anticipo en un
            solo lugar.
          </p>
        </div>
        <p className="hidden text-xs opacity-60 md:block">Sistema interno · No es comprobante fiscal</p>
      </section>
      <section className="flex flex-1 items-start justify-center px-6 py-8 md:items-center">
        <form onSubmit={entrar} className="w-full max-w-sm space-y-5">
          <h2 className="text-2xl font-bold md:text-3xl">Entrar al obrador</h2>
          <div className="space-y-2">
            <Label htmlFor="email">Correo</Label>
            <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="h-12 text-base" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pass">Contraseña</Label>
            <Input id="pass" type="password" required value={pass} onChange={(e) => setPass(e.target.value)} className="h-12 text-base" />
          </div>
          <Button className="h-12 w-full text-base" disabled={cargando}>
            {cargando ? "Entrando…" : "Entrar"}
          </Button>
        </form>
      </section>
    </main>
  );
}
