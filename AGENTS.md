<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

## What Lovable manages

Rules outside this block are the project's own. Change the pieces below in
Lovable, not by hand. With the [Lovable MCP](https://mcp.lovable.dev)
connected, `send_message` asks Lovable to do it; otherwise ask the user to
use the editor.

- **Database.** Do not add or edit `supabase/migrations/` or `drizzle/`.
  Ask Lovable to change the schema.
- **Generated files.** Do not edit a file whose header says it is automatically
  generated.
- **AI gateway.** Keep model calls on Lovable's gateway, and keep
  `LOVABLE_API_KEY` out of browser code.
- **Connectors.** Lovable provides native connectors. `list_connectors` shows
  which are enabled; `add_connector` only returns the dashboard link. When a
  connector is enabled, calls go through the connector gateway and need
  `LOVABLE_API_KEY`. When Lovable does not provide one, users can bring their
  own key and store it in Secrets.
- **Secrets.** Lovable manages them. Do not put secret values in the repo.
<!-- LOVABLE:END -->

## Project rules
- Business rules (pricing, lead times, backward planning, stock reservation, FEFO, invoice folios, cancellations) live in SECURITY DEFINER SQL functions with role checks; the UI only calls `rpc`, so rules cannot be bypassed from the browser.
- Roles live only in `user_roles`, assigned by the `handle_new_user` trigger; the Equipo role reads tasks via `mis_tareas()` and never touches cost or payment tables.
- `insumos_tarea` returns only the recipe of the task's stage (horneado→sabor, relleno/armado→relleno, cobertura→cobertura); consumption and the task sheet both rely on it so they never deduct the whole order.
- Ingredient availability is checked against the start of the stage that uses it (`_necesidad_fechas`); `ordenes_en_riesgo()` flags confirmed orders whose stock + on-time purchases no longer cover reservations, and also expires lots due today, since pg_cron is not available.
- Stage→team mapping lives in `_planificar` (horneado→Horno, relleno→Armado, cobertura/decoración/empaque→Decoración); change it there and re-run `_generar_plan` for pending orders.
