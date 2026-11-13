# Elispore

[elispore.conao3.com](https://elispore.conao3.com) — find Emacs packages and libraries hosted on GitHub.

Search a GitHub metadata catalog with `user:minad`, `topic:completion`, `license:gpl-3.0`, `pushed:>=2026-01-01`, `stars:>=1000`, and `language:"Emacs Lisp"`. Sidebar selections appear directly in the query. Click an owner to add a user filter; select an `owner/repo` label to copy it without spaces. Rows expand in place and preserve their position. Multiple rows can stay open for comparison.

## Development

```sh
nix develop --command pnpm install --frozen-lockfile
nix develop --command pnpm exec vp run check
nix develop --command pnpm run build
nix build
nix run
```

`nix run` serves the built site at `http://127.0.0.1:4173`. Browser validation uses `nix develop .#browser --command node test/browser.mjs` on Linux; it creates an isolated Chromium profile and checks the built `dist/` files. Screenshots go to ignored `.claude-dev/scratch/`.

## Catalog

`nix develop --command pnpm run catalog` uses authenticated GitHub CLI requests to refresh `public/catalog.json`. Discovery combines the 100 most starred Emacs Lisp repositories, 100 repositories tagged `emacs-package`, 100 recently updated Emacs Lisp repositories, and explicit seeds. IDs are deduplicated and common configuration distributions are filtered. This is a bounded discovery catalog; repository documentation determines installation and compatibility.

GitHub Actions refreshes it daily, validates and builds the site, deploys the catalog with the Worker, and commits the refreshed metadata. The browser fetches same-origin `/catalog.json`. GitHub credentials stay in the updater environment.

## Deployment

Cloudflare Worker `elispore`, custom domain `elispore.conao3.com`, personal account `31d70a83a3750c0fd66140fe200f2f29`. Configuration is in `wrangler.jsonc`. Static assets are built into `dist/`; Workers' static asset serving supplies the site and HTTP security headers.

`master` pushes and scheduled/manual runs deploy after checks pass. GitHub Actions uses repository secret `CLOUDFLARE_API_TOKEN`. Its source is 1Password “Cloudflare API token (Workers deploy, conao3@gmail.com)”. For a local deployment, provide that token as `CLOUDFLARE_API_TOKEN` and run `nix develop --command pnpm exec wrangler deploy`. `wrangler deploy --dry-run` validates the deployment without publishing.

Code: Apache-2.0. Repository metadata is attributed to its GitHub source. Refer to upstream repositories for package licenses.

Installation examples default to leaf. Buttons at the top right of each code block switch between leaf and use-package; Copy copies the displayed snippet. Both use `:vc` with the upstream GitHub URL. Leaf requires `:vc` support and Emacs 29+; use-package `:vc` is included in Emacs 30+.

The interface applies [avoid-ai-design](https://github.com/funboy322/avoid-ai-design) with a surgical pass over the approved list/sidebar design: search comes first, expanded rows add metadata and installation code without repeating the row title or description, and requirements appear on request. The promotional hero, eyebrow labels, active-state badges and repeated footer copy came from the initial design prototype and added no search or installation information. Keep the approved cream/coral palette; review text for a concrete purpose before adding it.
