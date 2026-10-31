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
- Word game is fully client-side; word banks are bundled in src/lib/words.ts (no AI/backend, to avoid credit use).
- Large word banks live in public/words/{lang}.json as [word,pos,def,hint] rows, fetched on game start; src/lib/words.ts is the fallback.
- Notion words load live via src/lib/notion.functions.ts: it auto-finds tables with a "definition" column and matches language by table title; built-in words are the fallback.
- Keep Notion discovery, eligibility filters, and property mapping in the browser-safe notion-dictionary helper so they can be tested without credentials; server credentials stay inside the server function. Entry metadata includes optional level, displayed with the word type.
