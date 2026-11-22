# elispore-check

A concurrent package downloader and non-evaluating Emacs Lisp scanner that
applies MELPA's
[CONTRIBUTING.org](https://github.com/melpa/melpa/blob/8d525bf492f8ae18a3855775eb2e3c65e957ad10/CONTRIBUTING.org)
and [melpazoid](https://github.com/riscy/melpazoid/tree/fcf5d883c6ced74ba16963d48c9e9e0bf0a1ff37).
The required rules and their sources live in the `lean!` block in `src/lib.rs`.
leanfran compiles this to ordinary Rust; no Lean installation or process is
needed at runtime.

```sh
cd checker
LEANFRAN_OFFLINE=1 cargo build --release
target/release/elispore-check --source melpa,gnu-elpa,nongnu-elpa --output ../public/checks.json
target/release/elispore-check --source github --github-list repos.txt --only magit --output checks.json
```

GitHub lists contain one `owner/repo` per line (blank lines and `#` comments are
ignored). `--only` accepts package names or full result keys. `--jobs` defaults
to 32. `--cache` defaults to the output path. Matching successful results are
reused by source, package version and rule-set version; failed downloads are
retried. GitHub uses the codeload HEAD ETag as its version, with a HEAD request
to validate cached results. `--force` ignores the cache. Each run writes only
the selected packages, with sorted result keys and compact JSON. Errors are
reported per package and excluded from the printed rule pass-rate denominator.
Index/network/CLI errors that prevent discovery terminate the command.

## Rules

Required rules make up a package's score. Each links to the CONTRIBUTING.org
line or the melpazoid.py check it comes from:

| ID                  | Source                  | Check                                                                           |
| ------------------- | ----------------------- | ------------------------------------------------------------------------------- |
| `main-file`         | melpazoid               | `<package>.el` exists                                                           |
| `packaging-header`  | melpazoid               | every file's first line has `---` before any `-*-`                              |
| `file-prefix`       | melpazoid               | file names start with the package name (minus `-mode`/`-themes`) and `-` or `.` |
| `packaged-docs`     | CONTRIBUTING, melpazoid | MELPA packages ship no `CHANGELOG`, `README` or `LICENSE` file                  |
| `lexical-binding`   | CONTRIBUTING            | every file enables lexical binding on its first line                            |
| `license-notice`    | CONTRIBUTING, melpazoid | every file has an SPDX identifier or one of melpazoid's license excerpts        |
| `license-spdx`      | melpazoid               | no SPDX identifier is `GPL-2.0-only`                                            |
| `license-position`  | CONTRIBUTING            | the license comes before `;;; Commentary`                                       |
| `license-file`      | CONTRIBUTING, melpazoid | the repository has a LICENSE/COPYING file                                       |
| `requires-main`     | melpazoid               | the main file's Package-Requires covers every other file's                      |
| `requires-unquoted` | melpazoid               | no quoted package names in Package-Requires                                     |
| `url-unquoted`      | melpazoid               | no quotation marks in the URL/Homepage header                                   |
| `repo-clean`        | melpazoid               | no `.elc`, `~` backup or `.DS_Store` files in the repository                    |
| `sharp-quote`       | CONTRIBUTING, melpazoid | melpazoid's "sharp-quote the names of existing functions" patterns              |
| `face-inherit`      | CONTRIBUTING            | no `defface` spec combines `:inherit` with other attributes                     |

`license-file` and `repo-clean` need the repository and run only for GitHub
sources; `packaged-docs` runs only for MELPA. Results list them in `skipped`
for other sources, and the score leaves them out.

Advice rules are the checks in melpazoid's `melpazoid-check-experimentals`:
every `melpazoid-misc` pattern in `melpazoid-check-sharp-quotes` and
`melpazoid-check-misc`, plus the Author/Maintainer, Commentary and theme checks,
ported from lisp-mnt.el. Their IDs are `mz-` and the first six words of the
message. `melpazoid.json` holds the patterns with their flags and source lines;
regenerate it from a melpazoid checkout and bump `RULE_SET_VERSION`:

```sh
emacs --batch -l tools/melpazoid-patterns.el ../melpazoid/melpazoid/melpazoid.el melpazoid.json
```

The patterns are Emacs regular expressions. `src/emacs_regex.rs` translates
them, including melpazoid's "smart space", and `src/syntax.rs` marks comments
and strings the way `syntax-ppss` does so each pattern skips them unless its
flags include them.

Differences from melpazoid:

- melpazoid's checks that run Emacs (byte-compile, checkdoc, check-declare,
  package-lint, loading each file), its network checks (URL reachability, SPDX
  validity and FSF-libre status, name collisions with other archives,
  repository age and archive status) and its pull-request template checks are
  not run.
- Package-Requires for `requires-main` come from `<package>.el`, then
  `<package>-pkg.el`. Archives generate `-pkg.el` with normalized versions, so
  it is only the fallback.
- GitHub repositories are read with MELPA's default file set (`*.el` at the
  root and in `lisp/`, without tests and `-pkg.el`).
- Files where melpazoid's Package-Requires parser fails an assertion get no
  requirements.

To compare with melpazoid, extract MELPA packages into one directory per
package, then run melpazoid's `melpazoid-check-experimentals` in batch Emacs
and the scanner on the same files, and diff per file and rule:

```sh
emacs --batch -l tools/run-melpazoid.el ../melpazoid/melpazoid/melpazoid.el pkgs/* > melpazoid.tsv
LEANFRAN_OFFLINE=1 cargo run --release --example scan -- pkgs/* > elispore.tsv
python3 tools/compare-melpazoid.py melpazoid.json melpazoid.tsv elispore.tsv
```

On 44 MELPA packages (301 files) the advice and `sharp-quote` findings agree
(464 of 464), and the license, SPDX, Package-Requires and URL facts agree with
melpazoid.py except for the two files where its parser fails.

## Scanner

Generated package/autoload files and test directories/files are excluded.
GitHub names strip `emacs-` and `.el`; when no matching file exists, the
shortest root-level file stem is used. The S-expression reader is not an Emacs
reader or macro expander; it is used for `defface` specs, and malformed or
unbalanced input is a package parse error. Files are read lossily as UTF-8 to
accommodate legacy source encodings. Downloads and expanded archives are
limited to 64 MiB; archives are never extracted onto disk.

## Updating rules

Install Lean 4.35 and the leanfran CLI, then run Cargo without offline mode:

```sh
nix shell github:conao3/lean-leanfran#rust
cargo test
```

If the combined Rust tool package is too expensive to build, the same flake's
`#rust-compiler` supplies the generator; put Lean 4.35 `lean` and `lake` on PATH
separately. Commit `lean/`, `.leanfran/cache/` and `Cargo.lock` along with the
source. Bump `RULE_SET_VERSION` whenever scanner or rule semantics change.

```sh
LEANFRAN_OFFLINE=1 cargo build
cargo test
cargo clippy -- -D warnings
cargo fmt --check
```
