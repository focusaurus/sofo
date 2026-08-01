#!/usr/bin/env bash
# Regenerate every raster icon from src/icon.svg and the social preview image
# from src/og.svg. Run after editing either SVG.
#
#   bin/icons.sh
#
# Needs rsvg-convert (librsvg) and magick (ImageMagick 7). librsvg does the
# rasterizing rather than ImageMagick's own SVG path, which ignores parts of the
# spec and would silently render the icon wrong.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
src="$root/src/icon.svg"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

for cmd in rsvg-convert magick; do
  command -v "$cmd" >/dev/null || { echo "missing: $cmd" >&2; exit 1; }
done

mkdir -p "$root/icons"

# Apple flattens onto white and applies its own rounded mask, so this one is
# opaque and square-cornered — keeping the SVG's rounding would leave
# transparent notches showing through at the corners.
rsvg-convert -w 180 -h 180 "$src" |
  magick png:- -background white -alpha remove -alpha off "$root/icons/apple-touch-icon.png"

rsvg-convert -w 192 -h 192 "$src" -o "$root/icons/icon-192.png"
rsvg-convert -w 512 -h 512 "$src" -o "$root/icons/icon-512.png"

# Legacy browsers and the implicit /favicon.ico request. One file, three sizes.
for s in 16 32 48; do
  rsvg-convert -w "$s" -h "$s" "$src" -o "$tmp/ico-$s.png"
done
magick "$tmp/ico-16.png" "$tmp/ico-32.png" "$tmp/ico-48.png" "$root/favicon.ico"

# Social preview. 1200x630 is the size every crawler wants; it must be opaque
# PNG or JPEG — several of them refuse SVG outright.
rsvg-convert -w 1200 -h 630 "$root/src/og.svg" |
  magick png:- -background "#6b7080" -alpha remove -alpha off "$root/icons/og.png"

cd "$root"
ls -l favicon.ico icons/*.png
