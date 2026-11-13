# Elispore

TypeScript/React static search site for GitHub-hosted Emacs packages, published on Cloudflare Worker `elispore` at `https://elispore.conao3.com`. Use the cream/coral list layout, left filters and inline accordions. Repository names copy without whitespace; slash spacing is CSS padding. Owner names add `user:` filters. The query is the source of truth for sidebar state.

Follow the shared TypeScript stack: React Aria Components for interactive UI, Tailwind CSS v4 through `@tailwindcss/vite`, React 19 and Vite+. Read the shared `notes/lang/typescript.md` and `notes/react-aria-components.md` before UI work. Use RAC state, keyboard interaction and focus management; preserve existing custom CSS and the approved design. Test keyboard and pointer interactions in the browser when changing widgets. Lockfile changes require updating the Nix dependency hash.

Validate external data with Zod. Use the real catalog for language, license, organization and topic filters. Keep row geometry fixed across accordion toggles, including scrollbar appearance. Keep GitHub and Cloudflare credentials outside client code.

Run `nix develop --command pnpm exec vp run check`, `nix develop --command pnpm run build`, and `nix build`. Linux browser checks use `nix develop .#browser --command node test/browser.mjs`. Refresh metadata with `nix develop --command pnpm run catalog`. Deployment uses `wrangler.jsonc`; the master workflow validates, deploys and updates the catalog daily.

Default installation examples to leaf `:vc` declarations using the upstream URL. Keep leaf/use-package selector buttons at the top right of the code block, and copy the displayed format.

Keep copy functional and sparse. Start with search and results. Avoid promotional heroes, eyebrow labels, repeated package names/descriptions in expanded rows, and routine active-state badges. Show exceptional archived state; put installation requirements behind a disclosure. Preserve accessible names and useful filter/column labels.
