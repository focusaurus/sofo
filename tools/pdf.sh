#!/usr/bin/env bash
# Render a song JSON to PDF and page PNGs for inspection.
#
#   tools/pdf.sh songs/vibe-coding.json
#
# Caveat: WeasyPrint is a useful smoke test, not the target renderer. Chrome's
# "Save as PDF" is what players will actually use, and the two disagree on parts
# of flexbox and on `translate` (which raises chord extensions). Treat this as a
# check on content, borders, and pagination — not final typography.
set -euo pipefail

song="${1:-songs/vibe-coding.json}"
name="$(basename "${song%.json}")"
out="${TMPDIR:-/tmp}/sofo-$name"

node "$(dirname "$0")/prerender.js" "$song" > "$out.html"
weasyprint "$out.html" "$out.pdf"
rm -f "$out"-page-*.png
pdftoppm -r 100 -png "$out.pdf" "$out-page"

echo "html: $out.html"
echo "pdf:  $out.pdf"
pdfinfo "$out.pdf" | grep -E '^Pages'
ls "$out"-page-*.png
