#!/usr/bin/env bash
# Build for Cloudflare Pages.
#
# Cloudflare serves whatever is in dist/. Everything the site needs goes in;
# everything else — migrations, email templates, notes — stays in the repo
# but off the public internet.
#
# Pages settings:  build command  ./build.sh
#                  output dir     dist
set -euo pipefail

rm -rf dist
mkdir -p dist

for item in index.html portal assets css js CNAME .nojekyll robots.txt 404.html _headers; do
  [ -e "$item" ] && cp -R "$item" dist/
done

# Never publish these.
rm -rf dist/supabase dist/build.sh

echo "built dist/ — $(find dist -type f | wc -l | tr -d ' ') files"
