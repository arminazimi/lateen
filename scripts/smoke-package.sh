#!/usr/bin/env bash
# Packs Lateen, installs it with the published Mizzen into an empty project, and builds the Lateen docs site with the
# installed `mizzen` command. It proves the published packages work from node_modules, not from a checkout.
# Usage: scripts/smoke-package.sh   (run from the repository root)
set -euo pipefail

lateen="$(pwd)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

mkdir "$work/tar" "$work/project"
(cd "$lateen" && npm pack --silent --pack-destination "$work/tar" >/dev/null)

cd "$work/project"
npm init -y >/dev/null
npm install --silent --no-audit --no-fund "$work"/tar/velella-lateen-*.tgz preact

cp -R "$lateen/site" site
rm -rf site/.mizzen
node -e '
  const fs = require("node:fs");
  const text = fs.readFileSync("site/mizzen.yml", "utf8");
  fs.writeFileSync("site/mizzen.yml", text.replace(/^theme:$/m, "theme:\n  name: \"@velella/lateen\""));
'

npx mizzen build site --out out
test -s out/index.html
grep -q 'class="mermaid-diagram"' out/components/mermaid/index.html
echo "packages build the Lateen site from node_modules"
