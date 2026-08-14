# Registry Lifecycle Fixture

A POKIE game package. `src/index.ts` implements the `PokieGame` contract -- edit it (and add whatever
else your game needs under `src/`) to build out your own game logic.

## Workflow

```
npm install
npm run build

npx pokie inspect .
npx pokie validate .
npx pokie sim . --rounds 10000 --seed demo --out sim.json
npx pokie report sim.json
npx pokie replay . --seed demo --round 1
npx pokie dev .
```

`npm run build` compiles `src/index.ts` to `dist/index.js` -- the same path `package.json`'s `main`,
`exports`, and `pokie.entry` fields all point at (see `tsconfig.json`'s own `outDir`). Every command
above (and any other POKIE tool) loads this package through that compiled output, never the TypeScript
source directly, so re-run `npm run build` after every source change before reloading it.

## Moving or copying this package

`pokie init`'s own `npm install` resolves this package's `"pokie"` dependency against the exact `pokie` installation that scaffolded it (a dev checkout, an `npm link`ed target, a pre-release tarball install, or an ordinarily published copy) rather than the registry -- but only for that one install. Once it finishes, `package.json` is left with a normal version range (e.g. `"^1.3.0"`), never an absolute, machine-specific `file:` path, so this file itself is portable: safe to move or copy to another machine or environment.

Running `npm install` again afterward -- by hand, after deleting `node_modules`, or on another machine you copied this package to -- reads that version range like any other dependency: it succeeds immediately if `node_modules` travels along with it (no reinstall needed) or if `pokie` has since been published at a matching version; otherwise, re-run `pokie init` in this directory again (or against a `pokie` checkout you have available there) to re-resolve it locally.

See [`pokie`'s CLI docs](https://github.com/sta-ger/pokie/blob/master/docs/cli.md) for what each
command does and every available option.
