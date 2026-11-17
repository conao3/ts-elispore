<p align="center">
  <img src="docs/assets/banner.png" alt="Elispore: find Emacs packages hosted on GitHub" width="880">
</p>

<p align="center"><strong>Find Emacs packages hosted on GitHub</strong></p>

<p align="center">
  <a href="https://github.com/conao3/ts-elispore/actions/workflows/ci.yml"><img src="https://github.com/conao3/ts-elispore/actions/workflows/ci.yml/badge.svg?branch=master" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/conao3/ts-elispore" alt="License: Apache-2.0"></a>
  <a href="flake.nix"><img src="https://img.shields.io/badge/Node.js-26-blue" alt="Node.js 26"></a>
  <a href="https://github.com/conao3/ts-elispore/stargazers"><img src="https://img.shields.io/github/stars/conao3/ts-elispore?style=flat" alt="GitHub stars"></a>
</p>

<p align="center">
  <a href="https://elispore.conao3.com">Site</a> ·
  <a href="#search">Search</a> ·
  <a href="#installation-examples">Installation examples</a> ·
  <a href="#development">Development</a> ·
  <a href="#catalog">Catalog</a> ·
  <a href="#deployment">Deployment</a> ·
  <a href="#license">License</a>
</p>

# Elispore

[elispore.conao3.com](https://elispore.conao3.com) finds Emacs packages and libraries hosted on GitHub.

## Search

Search a GitHub metadata catalog with `user:minad`, `topic:completion`, `license:gpl-3.0`, `pushed:>=2026-01-01`, `stars:>=1000`, and `language:"Emacs Lisp"`. Sidebar selections appear directly in the query.

Click an owner to add a user filter. Select an `owner/repo` label to copy it without spaces. Rows expand in place and keep their position, and multiple rows can stay open for comparison.

## Installation examples

Installation examples default to leaf. Buttons at the top right of each code block switch between leaf and use-package, and Copy copies the displayed snippet. Both use `:vc` with the upstream GitHub URL. Leaf requires `:vc` support and Emacs 29+, and use-package `:vc` is included in Emacs 30+.

## Development

```sh
nix develop --command pnpm install --frozen-lockfile
nix develop --command pnpm exec vp run check
nix develop --command pnpm run build
nix build
nix run
```

`nix run` serves the built site at `http://127.0.0.1:4173`.

Browser validation uses `nix develop .#browser --command node test/browser.mjs` on Linux. It creates an isolated Chromium profile and checks the built `dist/` files. Screenshots go to the ignored `.claude-dev/scratch/`.

### UI

Interactive UI uses Adobe's `react-aria-components`: SearchField, RadioGroup, Checkbox, Select/ListBox/Popover, Disclosure, ToggleButtonGroup, Button and Link. Components own keyboard navigation, ARIA state and focus handling. Tailwind CSS v4 is integrated through `@tailwindcss/vite`, and existing custom styles preserve the approved design. References: [React Aria](https://react-aria.adobe.com/), [Disclosure](https://react-aria.adobe.com/Disclosure), [Select](https://react-aria.adobe.com/Select).

The interface applies [avoid-ai-design](https://github.com/funboy322/avoid-ai-design) with a surgical pass over the approved list/sidebar design:

- Search comes first.
- Expanded rows add metadata and installation code without repeating the row title or description.
- Requirements appear on request.

The promotional hero, eyebrow labels, active-state badges and repeated footer copy came from the initial design prototype and added no search or installation information. Keep the approved cream/coral palette, and review text for a concrete purpose before adding it.

## Catalog

`nix develop --command pnpm run catalog` uses authenticated GitHub CLI requests to refresh `public/catalog.json`. Discovery combines:

- the 100 most starred Emacs Lisp repositories
- 100 repositories tagged `emacs-package`
- 100 recently updated Emacs Lisp repositories
- explicit seeds

IDs are deduplicated and common configuration distributions are filtered. It's a bounded discovery catalog, and repository documentation determines installation and compatibility.

GitHub Actions refreshes it daily, validates and builds the site, deploys the catalog with the Worker, and commits the refreshed metadata. The browser fetches same-origin `/catalog.json`. GitHub credentials stay in the updater environment.

## Deployment

Cloudflare Worker `elispore`, custom domain `elispore.conao3.com`, personal account `31d70a83a3750c0fd66140fe200f2f29`. Configuration is in `wrangler.jsonc`. Static assets are built into `dist/`, and Workers' static asset serving supplies the site and HTTP security headers.

`master` pushes and scheduled/manual runs deploy after checks pass. GitHub Actions uses the repository secret `CLOUDFLARE_API_TOKEN`. Its source is 1Password “Cloudflare API token (Workers deploy, conao3@gmail.com)”.

For a local deployment, provide that token as `CLOUDFLARE_API_TOKEN` and run `nix develop --command pnpm exec wrangler deploy`. `wrangler deploy --dry-run` validates the deployment without publishing.

## License

Code: Apache-2.0. Repository metadata is attributed to its GitHub source. Refer to upstream repositories for package licenses.
