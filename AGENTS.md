# Elispore

TypeScript/React static search site for GitHub-hosted Emacs packages, published on Cloudflare Worker `elispore` at `https://elispore.conao3.com`. Use the cream/coral list layout, left filters and inline accordions. Repository names copy without whitespace; slash spacing is CSS padding. Owner names add `user:` filters. The query is the source of truth for sidebar state.

Validate external data with Zod. Use the real catalog for language, license, organization and topic filters. Keep row geometry fixed across accordion toggles, including scrollbar appearance. Keep GitHub and Cloudflare credentials outside client code.

Run `nix develop --command pnpm exec vp run check`, `nix develop --command pnpm run build`, and `nix build`. Linux browser checks use `nix develop .#browser --command node test/browser.mjs`. Refresh metadata with `nix develop --command pnpm run catalog`. Deployment uses `wrangler.jsonc`; the master workflow validates, deploys and updates the catalog daily.

Default installation examples to leaf `:vc` declarations using the upstream URL. Keep leaf/use-package selector buttons at the top right of the code block, and copy the displayed format.
