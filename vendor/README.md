# Vendored dependencies

## `picomatch/`

Temporary security patch for [GHSA-fc5q-39xc-vjpf](https://github.com/advisories/GHSA-fc5q-39xc-vjpf)
(CVE-2026-112366), a ReDoS in `picomatch` through 4.0.7. The advisory has no patched
release yet, and every Jest/Vite/TypeScript-ESLint dependency path reaches it through
`picomatch`, so `npm audit` reports 47 high-severity findings even though all of them
are development-time dependencies.

The directory is the published `picomatch@4.0.7` package plus the `lib/parse.js` changes
from [micromatch/picomatch#194](https://github.com/micromatch/picomatch/pull/194), with
the package version bumped to `4.0.8` so npm's advisory range (`<=4.0.7`) treats it as
fixed. It is installed as a direct devDependency from `file:vendor/picomatch`, and
`package.json` overrides every transitive `picomatch` with `$picomatch`, so all
dependents dedupe to this one patched copy.

Remove the devDependency, the override, and this directory once picomatch publishes a
fixed release (4.0.8 or later) to the npm registry.

### Regenerating

```sh
# from the repository root
work=$(mktemp -d)
npm pack picomatch@4.0.7 --pack-destination "$work" >/dev/null
tar -xzf "$work"/picomatch-4.0.7.tgz -C "$work"
rm -rf vendor/picomatch
cp -a "$work/package" vendor/picomatch
cd vendor/picomatch
git init -q
git add .
git -c user.email=vendor@invalid -c user.name=vendor commit -qm base
git apply --include='lib/parse.js' <(curl -fsSL https://github.com/micromatch/picomatch/pull/194.diff)
rm -rf .git
node -e 'const fs=require("fs");const p="package.json";const j=JSON.parse(fs.readFileSync(p));j.version="4.0.8";delete j.devDependencies;delete j.scripts;fs.writeFileSync(p,JSON.stringify(j,null,2)+"\n")'
cd ../..
npm install
```
