# Sunset Riches

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

See [`pokie`'s CLI docs](https://github.com/sta-ger/pokie/blob/master/docs/cli.md) for what each
command does and every available option.
