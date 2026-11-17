import { createFileRoute, Link, Outlet, redirect, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { rolLabel, sesionQuery, type Rol } from "@/lib/obrador";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
  },
  component: Layout,
});

const menu = [
  { to: "/catalogo", label: "Catálogo", roles: ["administracion"] },
  { to: "/cotizador", label: "Cotizador", roles: ["administracion", "mostrador"] },
  { to: "/ordenes", label: "Órdenes", roles: ["administracion", "mostrador", "produccion"] },
  { to: "/tablero", label: "Tablero", roles: ["administracion", "produccion", "equipo"] },
  { to: "/planificacion", label: "Planificación", roles: ["administracion", "produccion", "mostrador"] },
  { to: "/inventario", label: "Inventario y compras", roles: ["administracion", "produccion"] },
  { to: "/facturas", label: "Facturación", roles: ["administracion", "mostrador"] },
  { to: "/cobros", label: "Cobros", roles: ["administracion", "mostrador"] },
  { to: "/informes", label: "Informes", roles: ["administracion"] },
] as const;

function Layout() {
  const { data: s } = useQuery(sesionQuery);
  const qc = useQueryClient();
  const nav = useNavigate();
  const rol = s?.rol as Rol | null | undefined;
  async function salir() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    nav({ to: "/auth", replace: true });
  }
  return (
    <div className="min-h-screen">
      <header className="no-print bg-sidebar text-sidebar-foreground">
        <div className="mx-auto max-w-7xl px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <Link to="/inicio" className="font-display text-xl font-bold">Obrador<span className="text-sidebar-primary">.</span></Link>
            <div className="flex min-w-0 items-center gap-3 text-sm">
              <span className="hidden truncate opacity-80 sm:inline">{s?.user.email} · <b>{rol ? rolLabel[rol] : "Sin rol"}</b></span>
              <span className="truncate opacity-80 sm:hidden"><b>{rol ? rolLabel[rol] : "Sin rol"}</b></span>
              <button onClick={salir} className="shrink-0 rounded border border-sidebar-border px-3 py-1 hover:bg-sidebar-accent">Salir</button>
            </div>
          </div>
          <nav className="-mx-4 mt-2 flex gap-1 overflow-x-auto px-4 pb-1 text-sm">
            {menu.filter((m) => rol && (m.roles as readonly string[]).includes(rol)).map((m) => (
              <Link key={m.to} to={m.to} className="shrink-0 whitespace-nowrap rounded px-3 py-1.5 hover:bg-sidebar-accent" activeProps={{ className: "bg-sidebar-primary text-sidebar-primary-foreground font-bold" }}>
                {m.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6"><Outlet /></main>
    </div>
  );
}
