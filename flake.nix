{
  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
    flake-parts.url = "github:hercules-ci/flake-parts";
    treefmt-nix.url = "github:numtide/treefmt-nix";
  };
  outputs =
    inputs:
    inputs.flake-parts.lib.mkFlake { inherit inputs; } {
      systems = [
        "x86_64-linux"
        "aarch64-darwin"
      ];
      imports = [ inputs.treefmt-nix.flakeModule ];
      perSystem = { pkgs, ... }: {
        packages.checker = pkgs.rustPlatform.buildRustPackage {
          pname = "elispore-check";
          version = "0.1.0";
          src = ./checker;
          cargoLock.lockFile = ./checker/Cargo.lock;
          LEANFRAN_OFFLINE = "1";
          meta.mainProgram = "elispore-check";
        };
        packages.default = pkgs.stdenvNoCC.mkDerivation (final: {
          pname = "elispore";
          version = "0.1.0";
          src = ./.;
          nativeBuildInputs = [
            pkgs.nodejs_26
            pkgs.pnpm
            pkgs.pnpmConfigHook
            pkgs.makeWrapper
          ];
          pnpmDeps = pkgs.fetchPnpmDeps {
            inherit (final) pname version src;
            hash = "sha256-xaeS0VwaE53bPzUu/iorLtToDNzBqa+lW3vQ+0rJRfk=";
            fetcherVersion = 4;
          };
          buildPhase = "pnpm run build";
          installPhase = ''
            mkdir -p $out/share/elispore $out/bin
            cp -r dist/* $out/share/elispore/
            makeWrapper ${pkgs.python3}/bin/python $out/bin/elispore --add-flags "-m http.server 4173 --bind 127.0.0.1 --directory $out/share/elispore"
          '';
          meta.mainProgram = "elispore";
        });
        treefmt.programs.nixfmt.enable = true;
        devShells.browser = pkgs.mkShell {
          packages = [
            pkgs.nodejs_26
            pkgs.pnpm
            pkgs.gh
          ]
          ++ pkgs.lib.optionals pkgs.stdenv.isLinux [ pkgs.chromium ];
        };
        devShells.lean = pkgs.mkShell {
          packages = [ pkgs.lean4 ];
        };
        devShells.default = pkgs.mkShell {
          packages = [
            pkgs.nodejs_26
            pkgs.pnpm
            pkgs.gh
            pkgs.cargo
            pkgs.rustc
            pkgs.clippy
            pkgs.rustfmt
          ];
        };
      };
    };
}
