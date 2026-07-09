[← Back to docs index](README.md)

# Game Packages

POKIE itself only defines game *logic* (sessions, win calculation, simulation). A **game package** is the
convention for shipping a concrete game — symbols, paytable, config, session wiring — as a standalone npm package
that a future CLI, simulator, validator, or server adapter can load without knowing anything about that game
in advance.

A game package is a regular npm package that depends on `pokie` and exports one object implementing the
`PokieGame` contract from a `pokie.entry` file declared in its `package.json`.

## The contract

```ts
type PokieGameManifest = {
    id: string;
    name: string;
    version: string;
    description?: string;
    author?: string;
};

type PokieGameContext = {
    seed?: string | number;
    options?: Record<string, unknown>;
};

interface PokieGame {
    getManifest(): PokieGameManifest;
    createSession(context?: PokieGameContext): GameSessionHandling;
}
```

- `getManifest()` — static metadata about the game (id, display name, version, ...), independent of any session.
- `createSession(context?)` — returns a **fresh** `GameSessionHandling` (e.g. a `VideoSlotSession`) ready to play.
  Called once per simulation run, per player session, or per replay. `context.seed`, if provided, is meant to be
  passed to a `SeededRandomNumberGenerator` (see [Reels & Symbol Sequences](reels-and-sequences.md#rngs)) so the
  caller can reproduce a specific run; `context.options` is a free-form bag for anything else the game needs
  (RTP variant, bonus buy mode, etc.) — the game package defines and interprets its own option keys.

## Declaring the entrypoint

The game package's `package.json` must point at the module exporting the `PokieGame` object via a `pokie.entry`
field:

```json
{
    "name": "crazy-fruits",
    "version": "1.0.0",
    "dependencies": {
        "pokie": "^1.3.0"
    },
    "pokie": {
        "entry": "./dist/index.js"
    }
}
```

`entry` is resolved relative to the package root (the directory containing this `package.json`), the same way
`main`/`exports` are.

## The entry module

The entry module's **default export** must be a `PokieGame`:

```ts
// src/index.ts, compiled to ./dist/index.js (see "pokie.entry" above)
import {PokieGame, VideoSlotConfig, VideoSlotSession} from "pokie";

const game: PokieGame = {
    getManifest() {
        return {id: "crazy-fruits", name: "Crazy Fruits", version: "1.0.0"};
    },
    createSession(context) {
        const config = new VideoSlotConfig();
        config.setAvailableSymbols(["Cherry", "Lemon", "Bell", "Seven"]);
        return new VideoSlotSession(config);
    },
};

export default game;
```

A plain `module.exports = game` (CommonJS) works the same way — the loader reads whichever module system the
entry file was built for.

## Loading a game package

`loadPokieGame(packageRoot)` reads `package.json`, resolves `pokie.entry`, imports it, and returns a validated
`PokieGame`:

```ts
import {loadPokieGame} from "pokie";

const game = await loadPokieGame("/path/to/crazy-fruits");
const session = game.createSession({seed: "regression-run-42"});

session.play();
session.getWinAmount();
```

It rejects if `package.json` has no `pokie.entry` field, or if the entry module's default export fails
`PokieGameContractValidationRule` — missing `getManifest()`/`createSession()`, `getManifest()` throwing, or a
manifest with a missing/empty `id`, `name`, or `version`. The rejection error lists every failing check by code
(e.g. `pokie-game-manifest-invalid-version`), not just the first one.

## Validating a loaded export

`isPokieGame(value)` is a plain type guard — useful for a quick runtime check without importing the validation
machinery. It's a shallower check than what `loadPokieGame` runs internally (shape only, not manifest content):

```ts
import {isPokieGame} from "pokie";

if (!isPokieGame(candidate)) {
    throw new Error("not a POKIE game");
}
```

For a fuller check — including that `getManifest()` doesn't throw and returns a well-formed manifest (non-empty
`id`/`name`/`version`) — use `PokieGameContractValidationRule`, which implements the same `ValidationRule`/
`ValidationResult` pattern used by the win evaluation pipeline's [validation rules](paytable-and-wins.md#aggregation-policy):

```ts
import {PokieGameContractValidationRule, ValidationResult} from "pokie";

const issues = new PokieGameContractValidationRule().validate(candidate);
const result = new ValidationResult(issues);

if (result.hasErrors()) {
    // reject the package
}
```

`loadPokieGame`, `isPokieGame`, and `PokieGameContractValidationRule` are the building blocks a future `pokie
validate`/`pokie sim`/`pokie create` CLI and a server adapter are expected to be built on.
