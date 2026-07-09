[← Back to docs index](README.md)

# CLI

`pokie` ships a small CLI, installed alongside the library, for scaffolding and (eventually) operating on
[game packages](game-packages.md).

## `pokie create <name>`

Scaffolds a brand-new [game package](game-packages.md) in a new `<name>` directory.

```
npm i -g pokie
pokie create crazy-fruits
cd crazy-fruits
npm install
npm run build
```

`pokie create <name>` creates `./<name>` and writes:

- `package.json` — name `<name>`, a `pokie` dependency, `build`/`sim` scripts, and `pokie.entry` pointing at
  `./dist/index.js`;
- `tsconfig.json` (CommonJS output to `./dist`, source in `./src`);
- `src/<GameName>Game.ts` — a `PokieGame` implementation (`<GameName>` is `<name>` converted to PascalCase, e.g.
  `crazy-fruits` → `CrazyFruits`), with a manifest id/name derived from `<name>`;
- `src/<GameName>Session.ts` — a factory returning a default `VideoSlotSession`;
- `src/index.ts` — the entry module, re-exporting `<GameName>Game` as its default export.

It fails if `./<name>` already exists — pick a different name or remove the directory first.

The result is loadable like any other [game package](game-packages.md):

```ts
import {loadPokieGame} from "pokie";

const game = await loadPokieGame("./crazy-fruits");
game.createSession().play();
```

From here, replace the generated `src/<GameName>Session.ts`/`src/<GameName>Game.ts` with your own symbols,
paytable, and session wiring — see [Getting Started](getting-started.md) and
[Game Session & Configuration](game-session.md).

## `pokie init`

Turns an existing npm project into a minimal POKIE-compatible game package.

```
npm init -y
npm i pokie
npx pokie init
```

Run inside the project directory. `pokie init` reads the project's `package.json` and:

- adds/updates `pokie.entry` (pointing at `./dist/index.js`);
- adds `build` (`tsc`) and `sim` (`pokie sim`) scripts, without overwriting any scripts you already have;
- adds `typescript` to `devDependencies` and `pokie` to `dependencies` if either is missing;
- creates a minimal `tsconfig.json` (CommonJS output to `./dist`, source in `./src`);
- creates `src/index.ts`, a working entry module exporting a `PokieGame` — `getManifest()` returns an id/name
  derived from the project's package name (and its version), `createSession()` returns a default
  `VideoSlotSession`.

It never overwrites an existing `tsconfig.json` or `src/index.ts` — if either is already there, it's left alone
and reported as skipped. `package.json` is always re-written with the merged fields above.

After running it:

```
npm install
npm run build
```

The project is now loadable like any other [game package](game-packages.md):

```ts
import {loadPokieGame} from "pokie";

const game = await loadPokieGame(process.cwd());
game.createSession().play();
```

From here, replace the generated `src/index.ts` with your own symbols, paytable, and session wiring — see
[Getting Started](getting-started.md) and [Game Session & Configuration](game-session.md).

## What's next

`pokie create` and `pokie init` are the first of a planned set of subcommands built on the same
[game package](game-packages.md) primitives (`loadPokieGame`, `isPokieGame`, `PokieGameContractValidationRule`):
`pokie sim` (run a simulation against the package), `pokie validate` (check the contract without playing),
`pokie report` (RTP/volatility reporting), and `pokie serve` (a local server adapter). None of these exist yet —
running them today just prints the CLI's usage/command list.
