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
- Quote-cart rules (add/merge, move between suppliers, subtotal/pending logic) live as pure functions in `src/lib/cotizacion.ts` with tests in `src/test/cotizacion.test.ts`; UI components only call them, so rules stay testable.
- Demo data lives in `src/data/demo.ts`; pharmacy chains are public price references only and must never feed the supplier quote cart.
