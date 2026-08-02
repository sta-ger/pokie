[← Back to docs index](README.md)

# Game Packages

POKIE itself only defines game *logic* (sessions, win calculation, simulation). A **game package** is the
convention for shipping a concrete game — symbols, paytable, config, session wiring — as a standalone npm package
that a CLI, simulator, validator, or server adapter can load without knowing anything about that game in advance.

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
    getSessionSerializer?(): GameSessionSerializing;
}
```

- `getManifest()` — static metadata about the game (id, display name, version, ...), independent of any session.
- `createSession(context?)` — returns a **fresh** `GameSessionHandling` (e.g. a `VideoSlotSession`) ready to play.
  Called once per simulation run, per player session, or per replay. `context.seed`, if provided, is meant to be
  passed to a `SeededRandomNumberGenerator` (see [Reels & Symbol Sequences](reels-and-sequences.md#rngs)) so the
  caller can reproduce a specific run; `context.options` is a free-form bag for anything else the game needs
  (RTP variant, bonus buy mode, etc.) — the game package defines and interprets its own option keys.
- `getSessionSerializer?()` — **optional and additive**. When implemented, returns the [`net/` session
  serializer](serialization.md) that knows how to turn this game's own session type into a rich, game-specific
  JSON payload (e.g. `new VideoSlotSessionSerializer()`, or a custom `CascadeSessionSerializer`/
  `MultiStageRoundSessionSerializer` subclass for a multi-stage mechanic). `pokie serve` uses it, when present,
  instead of its own narrow default response shape — see [`pokie serve`'s session responses](cli.md#post-sessions)
  and [Session storage & wallet](cli.md#session-storage--wallet). A game that doesn't implement this keeps getting
  exactly the response shape it always has; this is not required for `loadPokieGame`/`pokie validate`/`pokie sim`/
  any other command to work.

## Declaring the entrypoint

The game package's `package.json` must point at the module exporting the `PokieGame` object via a `pokie.entry`
field:

```json
{
    "name": "sample-slot",
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
`main`/`exports` are. A package produced by `pokie create`/`pokie init` keeps all three in agreement — `main`,
`exports`, and `pokie.entry` always point at the same compiled output (`./dist/index.js` by default), and
`scripts.build` (`tsc`, driven by the package's own `tsconfig.json`) is what produces it.

## Preparing a package end-to-end

Writing the TypeScript source is only the first step — a package isn't loadable until its dependencies are
installed and it's been compiled. The CLI-internal `GamePackagePreparer` (`cli/prepare/GamePackagePreparer.ts`)
carries a target directory through that whole lifecycle in one call: **create** the scaffold (package.json,
tsconfig.json, README.md, src/index.ts), **install** its dependencies (`npm install`, producing
package-lock.json), **build** it (`npm run build`, producing dist/index.js), then **verify** the result actually
loads as a valid `PokieGame` (via `PokieGamePackageValidating`). Each phase's failure is reported as a
`GamePackagePreparationError` naming which phase failed and a concrete recovery step — never a bare non-zero
exit code or a raw underlying error with nothing else to go on.

If a package's `dist` output is missing or stale (built from since-removed dependencies, or never built at all),
`loadPokieGame`/`resolvePokieGameEntryModule` themselves already report that as an actionable error — pointing at
`npm install && npm run build` — rather than surfacing Node's raw `Cannot find module` as the primary message.
Resolving the entry module stays a pure read: neither function ever runs an install or a build on the caller's
behalf.

## The entry module

The entry module's **default export** must be a `PokieGame`:

```ts
// src/index.ts, compiled to ./dist/index.js (see "pokie.entry" above)
import {PokieGame, VideoSlotConfig, VideoSlotSession} from "pokie";

const game: PokieGame = {
    getManifest() {
        return {id: "sample-slot", name: "Sample Slot", version: "1.0.0"};
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

const game = await loadPokieGame("/path/to/sample-slot");
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

`loadPokieGame`, `isPokieGame`, and `PokieGameContractValidationRule` are the building blocks the `pokie create`/
`pokie init`/`pokie sim`/`pokie validate`/`pokie report`/`pokie diff`/`pokie replay`/`pokie serve`/`pokie client`/
`pokie dev` [CLI](cli.md) commands are built on — `pokie validate` in particular wraps this same contract check in
`PokieGamePackageValidator`, returning a structured report instead of throwing.
