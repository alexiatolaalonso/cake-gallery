import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { sesionQuery } from "@/lib/obrador";
import { meta } from "@/components/Pagina";

export const Route = createFileRoute("/_authenticated/inicio")({
  head: () => meta("Inicio", "Inicio del obrador"),
  component: Inicio,
});
function Inicio() {
  const { data, isLoading } = useQuery(sesionQuery);
  if (isLoading) return <p>Cargando…</p>;
  const r = data?.rol;
  if (r === "mostrador") return <Navigate to="/cotizador" />;
  if (r === "equipo" || r === "produccion") return <Navigate to="/tablero" />;
  if (r === "administracion") return <Navigate to="/ordenes" />;
  return <p>Tu cuenta no tiene rol asignado.</p>;
}
