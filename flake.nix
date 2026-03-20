{
  description = "Millionaire LAN Game Dev Environment";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
  };

  outputs = { self, nixpkgs }:
    let
      system = "x86_64-linux";
      pkgs = nixpkgs.legacyPackages.${system};
    in
    {
      devShells.${system}.default = pkgs.mkShell {
        buildInputs = with pkgs; [
          nodejs_22
          pnpm
          yarn
          git
          glibcLocales
        ];

        shellHook = ''
          echo "Millionaire Dev Environment Loaded"
          echo "Node version: $(node -v)"
          echo "PNPM version: $(pnpm -v)"
        '';
      };
    };
}
