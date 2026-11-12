<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Project rules
- The active quote cart lives in the backend (`/api/v1/quotes`): the draft quote is recovered on load and no cart line is stored in the browser. `src/lib/cotizacion-api.ts` is its typed client and holds the pure read helpers (active lines, supplier groups, totals/pending, demand-unit linking) with tests in `src/test/cotizacion-api.test.ts`; UI components only call them. `src/lib/cotizacion.ts` (with `src/test/cotizacion.test.ts`) is the old demo cart and must not be used for the real cart.
- Demo data lives in `src/data/demo.ts`; pharmacy chains are public price references only and must never feed the supplier quote cart.
- Navigation is the collapsible shadcn sidebar (`AppSidebar`, options list in one array) mounted once in `__root`; each page renders `MenuPrincipal` (header with the sidebar trigger). Home (Cotizador) keeps the fixed section order on one page: Buscar medicamento → Grandes farmacias → Faltantes por cotizar → Proveedores → Carrito; the header shows the admin name and the access-request bell, so the layout matches the owner's spec. The active cart is part of Cotizador and «Historial de cotizaciones» shows finalized quotes only; there is no separate «Mis cotizaciones» page (`/mis-cotizaciones` redirects home).
- Missing-item reports and Google access-request rules live as pure functions in `src/lib/faltantes.ts` (tests in `src/test/faltantes.test.ts`); access-request state is a context provider mounted in `__root` so the bell is shared across pages. All IDs (report, cycle, offer, observation, request, admin) stay separate to map onto the future REST backend.
