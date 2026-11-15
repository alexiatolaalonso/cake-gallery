import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Obrador · Pastelería por encargo" },
      { name: "description", content: "Sistema de gestión de obra para pastelería por encargo." },
      { property: "og:title", content: "Obrador · Pastelería por encargo" },
      { property: "og:description", content: "Cotiza, planifica y produce cada pastel como una orden." },
    ],
  }),
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    throw redirect({ to: data.user ? "/inicio" : "/auth" });
  },
});
