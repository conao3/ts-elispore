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

Search repository metadata and MELPA package names, or use qualifiers like `user:minad`, `topic:completion`, `license:gpl-3.0`, `pushed:>=2026-01-01`, `stars:>=1000`, and `language:"Emacs Lisp"`. Sidebar selections appear directly in the query.

Click an owner to add a user filter, or a topic in an expanded row to add a topic filter. Select an `owner/repo` label to copy it without spaces. Rows expand in place and keep their geometry, and multiple rows can stay open for comparison.

Categories show the ten most frequent informative catalog topics, plus any selected topic outside that list. Topic matching ignores case, drops a leading `emacs-` and a trailing plural `s`, folds theme variants such as `dark-theme` into `theme`, and maps `mode` and `major-mode` to `major-mode`. Category counts deduplicate aliases within each repository.

## Installation examples

Installation examples default to leaf. Buttons at the top right of each code block switch between leaf and use-package, and Copy copies the displayed snippet. Both use `:vc` with the upstream GitHub URL. For MELPA repositories, the example uses the recipe matching the search (or the first recipe), preserves its branch, and omits the Lisp directory when the layout is unclear. Leaf requires `:vc` support and Emacs 29+, and use-package `:vc` is included in Emacs 30+.

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

Interactive UI uses Adobe's `react-aria-components`: SearchField, RadioGroup, Checkbox, Select/ListBox/Popover, Disclosure, ToggleButtonGroup, Button, Link and DialogTrigger/Modal/Dialog. Components own keyboard navigation, ARIA state and focus handling. Tailwind CSS v4 is integrated through `@tailwindcss/vite`; custom CSS defines the warm palette with a coral accent and system light/dark themes. References: [React Aria](https://react-aria.adobe.com/), [Disclosure](https://react-aria.adobe.com/Disclosure), [Select](https://react-aria.adobe.com/Select).

The layout keeps search and results first:

- Search comes first.
- A sticky header shows catalog size, refresh date and the source link.
- Left filters sit beside one grouped result card with row dividers.
- Expanded rows add metadata, topic buttons and syntax-colored installation code without repeating the row title or description.
- Requirements appear on request.
- On mobile, Filters opens a modal sheet with a close control and a Show packages button.

Keep copy sparse; avoid promotional heroes, eyebrow labels and routine active-state badges.

## Catalog

`nix develop --command pnpm run catalog` uses authenticated GitHub CLI requests to refresh `public/catalog.json`. Discovery combines:

- up to 400 Emacs Lisp repositories with at least 20 stars, sorted by stars
- up to 200 repositories tagged `emacs-package`
- up to 200 Emacs Lisp repositories pushed after 2026-01-01, sorted by update
- up to 100 repositories each tagged `emacs-packages`, `emacs-theme`, `emacs-mode`, `org-mode` or `melpa`
- explicit seeds

Search uses 100 results per page and excludes forks. IDs are deduplicated; batched GraphQL tree checks require an `.el` file at the root or directly inside `lisp/`. Exclusions remove flagged forks, `mirror`/`style-guide`/`styleguide` topics, common configuration distributions, `awesome-*` lists and repositories named `emacs` or `remacs`. This is a bounded discovery heuristic, not an installation guarantee; upstream documentation determines compatibility.

GitHub Actions refreshes the discovery snapshot daily, validates and builds the site, deploys the
catalog with the Worker, and commits the refreshed discovery snapshot. GitHub credentials stay in
the updater environment.

The development server and production build combine that snapshot with the checked-in MELPA
entries in `examples/melpa/`. The browser fetches the combined `/catalog.json`; the build writes
it to `dist/catalog.json` without changing the discovery snapshot. The merge needs no network or
GitHub credentials and can also be run directly:

```sh
nix develop --command node scripts/catalog-import.ts /path/to/catalog.json
```

Each GitHub repository ID appears once. GitHub discovery supplies repository metadata when a
repository is in both inputs. For MELPA-only repositories, the first staged recipe by name
supplies the metadata. The combined entry preserves every associated recipe in `melpaRecipes`,
including package names, upstreams, branches, commits and explicit file lists. The displayed
refresh date is for GitHub discovery; MELPA-only metadata comes from the staged snapshots.

### Converting MELPA recipes

Use an authenticated GitHub CLI and pin MELPA to the same commit for every shard. The checked-in
MELPA entries come from the revision below; this example reconverts its first 20 recipes into a
separate directory.

```sh
git clone https://github.com/melpa/melpa.git ../melpa
git -C ../melpa checkout 8d525bf492f8ae18a3855775eb2e3c65e957ad10
nix develop --command node scripts/melpa.ts ../melpa/recipes .claude-dev/scratch/melpa-sample 0 20
nix develop --command pnpm exec vp fmt .claude-dev/scratch/melpa-sample
```

The last two arguments are zero-based start (inclusive) and end (exclusive) indexes into the
sorted recipe filenames, before filtering by fetcher. To split the 6,351 recipes at this
revision, use disjoint ranges such as `[0, 250)`, `[250, 500)`, …, `[6250, 6351)`.
Give each worker a fresh output directory or use one shared directory with disjoint ranges;
each converted recipe writes only `<recipe-name>.json`. Watch the authenticated API rate limit if
workers share a token. Unsupported sources are listed on stderr; malformed recipes or GitHub API
errors stop the run at the named recipe with a nonzero exit code.

- `github` recipes and generic `git` recipes with a GitHub remote use GitHub's repository ID,
  canonical name, URL and other catalog metadata. GitLab, Codeberg, SourceHut, Mercurial and other
  non-GitHub sources are skipped because the catalog only supports GitHub repositories.
- The extra `melpa` object keeps the package name, fetcher, upstream, optional branch or commit,
  and the original `:files` list. A missing list means MELPA defaults; explicit lists are not
  expanded or evaluated, and branch/commit selections do not change GitHub repository metadata.
- These are staging entries. To update the MELPA portion of the published catalog, review the
  new entries and replace the tree in `examples/melpa/` before building. The regular catalog
  refresh does not change these files or its GitHub discovery rules.

## Deployment

Cloudflare Worker `elispore`, custom domain `elispore.conao3.com`, personal account `31d70a83a3750c0fd66140fe200f2f29`. Configuration is in `wrangler.jsonc`. Static assets are built into `dist/`, and Workers' static asset serving supplies the site and HTTP security headers.

`master` pushes and scheduled/manual runs deploy after checks pass. GitHub Actions uses the repository secret `CLOUDFLARE_API_TOKEN`. Its source is 1Password “Cloudflare API token (Workers deploy, conao3@gmail.com)”.

For a local deployment, provide that token as `CLOUDFLARE_API_TOKEN` and run `nix develop --command pnpm exec wrangler deploy`. `wrangler deploy --dry-run` validates the deployment without publishing.

## License

Code: Apache-2.0. Repository metadata is attributed to its GitHub source. Refer to upstream repositories for package licenses.
