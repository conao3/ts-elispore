# Elispore

Find Emacs packages and libraries hosted on GitHub. A static TypeScript/React site with instant local search, topic shortcuts, star and update sorting, archived filtering, and shareable search URLs.

## Development

```
nix develop
pnpm install --frozen-lockfile
pnpm exec vp run check
pnpm run dev
pnpm run build
```

## Catalog

`pnpm run catalog` uses authenticated GitHub CLI requests to refresh `public/catalog.json`. Authenticate `gh` locally or provide `GH_TOKEN` to the scheduled workflow. Credentials stay in the updater environment; visitors download metadata only.

Discovery combines the 100 most starred Emacs Lisp repositories, 100 repositories tagged `emacs-package`, 100 recently updated Emacs Lisp repositories, and explicit seed repositories. Results are deduplicated by GitHub ID. Common configuration distributions and dotfiles are filtered. This is a bounded discovery catalog, not a complete list or a package verification service. Names, descriptions and topics are searchable. Repository metadata links to its original GitHub source and includes the refresh timestamp.

The workflow refreshes the catalog daily and builds the static site. A failed refresh fails the build; the deployed catalog remains available. A site's catalog can grow independently of any package archive or submission process.

Code: Apache-2.0. Repository metadata remains attributed to its GitHub source. Package licenses are displayed from GitHub metadata; consult each repository for its terms.
