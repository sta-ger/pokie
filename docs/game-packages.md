[← Back to docs index](README.md)

# Game Packages

POKIE itself only defines game *logic* (sessions, win calculation, simulation). A **game package** is the
convention for shipping a concrete game — symbols, paytable, config, session wiring — as a standalone npm package
that a CLI, simulator, validator, or server adapter can load without knowing anything about that game in advance.

A game package is a regular npm package that depends on `@fromstan/pokie` and exports one object implementing the
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
        "@fromstan/pokie": "^1.3.0"
    },
    "pokie": {
        "entry": "./dist/index.js"
    }
}
```

`entry` is resolved relative to the package root (the directory containing this `package.json`), the same way
`main`/`exports` are. A package produced by `pokie build`/`pokie init` keeps all three in agreement — `main`,
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

### Retrying a failed preparation

A failed `dependencies`/`build`/`verify` phase leaves the scaffold on disk instead of cleaning it up. Calling
`prepare()` again with the same `parentDir`/`name` is the supported way to retry: `GamePackagePreparer` writes a
`.pokie-prepare-state.json` marker into the project root after `create` and after every later phase it completes,
and reads it back at the start of the next `prepare()` call. When that marker is present, `create` is skipped
entirely (the scaffold it already wrote is reused as-is) and only the phases that hadn't completed yet run —
`install` is never repeated once `dependencies` is recorded done, and `build` is never repeated once `build` is.
The marker is deleted once `verify` succeeds, so a finished package carries no trace of it.

A directory that already exists but carries no marker — a stray, pre-existing, or hand-created directory this
tool never touched — still fails `create` with its original "already exists" error, exactly as before. Retry only
ever resumes a directory `GamePackagePreparer` itself created, so it can never silently overwrite anyone else's
files.

## The entry module

The entry module's **default export** must be a `PokieGame`:

```ts
// src/index.ts, compiled to ./dist/index.js (see "pokie.entry" above)
import {PokieGame, VideoSlotConfig, VideoSlotSession} from "@fromstan/pokie";

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
import {loadPokieGame} from "@fromstan/pokie";

const game = await loadPokieGame("/path/to/sample-slot");
const session = game.createSession({seed: "regression-run-42"});

session.play();
session.getWinAmount();
```

Each load uses an isolated runtime snapshot so rebuilding the same package path cannot reuse stale
relative dependencies. If a long-lived host keeps the returned game/session, call `await game.release?.()`
after its final session is destroyed (or use `loadPokieGameRuntime()` for an explicit `{game, release}` lease).

It rejects if `package.json` has no `pokie.entry` field, or if the entry module's default export fails
`PokieGameContractValidationRule` — missing `getManifest()`/`createSession()`, `getManifest()` throwing, or a
manifest with a missing/empty `id`, `name`, or `version`. The rejection error lists every failing check by code
(e.g. `pokie-game-manifest-invalid-version`), not just the first one.

## Validating a loaded export

`isPokieGame(value)` is a plain type guard — useful for a quick runtime check without importing the validation
machinery. It's a shallower check than what `loadPokieGame` runs internally (shape only, not manifest content):

```ts
import {isPokieGame} from "@fromstan/pokie";

if (!isPokieGame(candidate)) {
    throw new Error("not a POKIE game");
}
```

For a fuller check — including that `getManifest()` doesn't throw and returns a well-formed manifest (non-empty
`id`/`name`/`version`) — use `PokieGameContractValidationRule`, which implements the same `ValidationRule`/
`ValidationResult` pattern used by the win evaluation pipeline's [validation rules](paytable-and-wins.md#aggregation-policy):

```ts
import {PokieGameContractValidationRule, ValidationResult} from "@fromstan/pokie";

const issues = new PokieGameContractValidationRule().validate(candidate);
const result = new ValidationResult(issues);

if (result.hasErrors()) {
    // reject the package
}
```

`loadPokieGame`, `isPokieGame`, and `PokieGameContractValidationRule` are the building blocks the `pokie init`/
`pokie sim`/`pokie validate`/`pokie report`/`pokie diff`/`pokie replay`/`pokie serve`/`pokie client`/
`pokie dev` [CLI](cli.md) commands are built on — `pokie validate` in particular wraps this same contract check in
`PokieGamePackageValidator`, returning a structured report instead of throwing.

## Headless runtime contract

`PokieGame` also defines the headless runtime compatibility ports `getSessionCompatibility()` and `validateSessionState()`. Generated and code-first packages use the same `SessionRuntime` / repository command semantics; see [game-session.md](game-session.md#headless-commands-and-repository-ownership) and [serialization.md](serialization.md#executable-repository-records). Existing packages exposing only `getManifest()` and `createSession(context)` need no rewrite for live
Play: direct repository commands, serve and Studio capture command/schema authority from the trusted
constructed object when it is primed. Save the initial record with the selected game and pass its committed
revision to `primeSession()`; serve and Studio do this automatically. Those captures remain `live-only`
even if the session itself has a complete codec. Persisted capability lists cannot supply authority.
After live-state loss, new commands and undeclared-package retries return `restoration-unsupported`
without constructing a replacement. Durable opt-in requires both `getSessionStateSchema()` and
`getSessionCommandCapabilities(context)`, plus a complete session codec (and a validator for a custom schema).
Declared command authority also permits validated completed live-only retries without constructing a session.

Trusted live validation follows built-in free-game and bet-mode composition node by node. An unchanged
custom decorator may omit a snapshot or emit an opaque legacy snapshot inside those wrappers. Such
snapshots stay live-only: they preserve the constructed collaborator and never authorize rebuilding it.
Complete built-in children still require their nested state, and selected modes must belong to the
trusted model before reads, retries or reconciliation publish a result. Declared codecs retain their
own strict validation requirements, including the game validator for custom payloads.

## Generated, visible and evaluated coordinates

Blueprint screenGeometry, generated packages and conversion support: see [the coordinate contract and adapter support matrix](v2-completion/V2C-03.md).

### Exact audit capability

A generated seeded game declares its model hash, compatible executable schema and
command capabilities. A hand-authored game must supply the same authorities for
exact audit replay, including a `getConfigHash` covering effective math configuration
and all custom collaborators. Manifest id/version alone cannot prove model equality.
`createSession` must return a detached executable instance, never a live serving
session. Custom state requires complete capture, restore, session validation and
selected-package validation; dynamic variants and RNG algorithms/state must be
covered by that model/codec compatibility promise. Missing authority leaves ordinary
play and legacy seed-forward replay available, with exact audit explicitly unavailable.

## Whole-sequence variants

Generated and recompiled typed packages preserve `reelSequences`, complete variant
arrays, IDs and relative weights. Public ESM and CommonJS consumers use the same
context contract; weighted-definition recognition survives that module boundary.
The model hash includes authored variants and versioned context/sampling semantics.
Existing exact-only models keep their stop draws and seeded mathematics.

`loadGameBlueprint()` checks canonical sequence definitions before runtime use.
Authoring adapters may request `{preserveInvalidAuthoredContent: true}` to retain a
broken draft for correction; this does not authorize build or runtime publication.
Studio and CLI editing use that authoring option and validate before saving the new
source. PAR and canonical WASM currently reject the `reelSequences` representation;
build a TypeScript package to preserve it. See [the reel contract](reels-and-sequences.md#weighted-whole-sequence-reels).
