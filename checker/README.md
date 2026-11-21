# elispore-check

A concurrent package downloader and small, non-evaluating Emacs Lisp scanner.
The policy, metadata and a prefix theorem live in the `lean!` block in
`src/lib.rs`. leanfran compiles this to ordinary Rust; no Lean installation or
process is needed at runtime.

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

The main file carries package-level metadata, summary and Commentary. Lexical
binding, Code, provide, footer, namespace and no-cl checks apply to every
included file. Generated package/autoload files and test directories/files are
excluded. Namespace checks accept the package name or the individual file stem,
alone or followed by `-` (including `--`) or `/`. GitHub names strip `emacs-`
and `.el`; when no matching file exists, the shortest root-level file stem is
used. A license notice anywhere or a LICENSE/COPYING file suffices.

The scanner is intentionally not an Emacs reader or macro expander. It skips
strings, comments, character literals and quoted forms, recognizes literal
require/provide features, and records direct top-level definitions only.
Malformed/unbalanced input is a package parse error. Files are read lossily
as UTF-8 to accommodate legacy source encodings. Downloads and expanded
archives are limited to 64 MiB; archives are never extracted onto disk.

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
