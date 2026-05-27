{ pkgs ? import <nixpkgs> { } }:

let
  nativeLibraries = [
    pkgs.libuuid.lib
  ];
in
pkgs.mkShell {
  packages = [
    pkgs.nodejs_24
  ];

  LD_LIBRARY_PATH = pkgs.lib.makeLibraryPath nativeLibraries;
}
