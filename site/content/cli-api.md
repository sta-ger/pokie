# CLI and API

## Launch and discover

```sh
pokie                    # global Studio Home
pokie PROJECT            # explicit project workspace
pokie --help             # public command list, no server
pokie --version          # installed candidate version, no server
pokie build --help       # command-specific grammar
```

Unknown commands exit unsuccessfully with a help/suggestion path. The [production registry](../../cli/registerCliCommands.ts) and [dispatcher](../../cli/dispatch.ts) are the command authority. Internal legacy handlers are not public commands.

## Public command inventory

{{commands}}

The inventory above is generated from the actual registered Commander command tree, including nested verbs, positionals and options. Use [Getting started](getting-started.md), [reproducibility](reproducibility.md), [optimization](optimization.md) and [interop](interop.md) for bounded tasks.

## Build and conversion

```sh
pokie inspect SOURCE
pokie build SOURCE --target TARGET --out NEW_DESTINATION --dry-run
pokie build SOURCE --target TARGET --out NEW_DESTINATION
```

Targets are `blueprint`, `tsPackage`, `outcomeLibrary`, `stakeAdapter`, `parWorkbook` and `wasm`. `build SOURCE --target TARGET` owns conversions and plans supported intermediates automatically. There is no top-level `export` command. A recognized source kind does not mean every model can take every path. Preview diagnostics and runtime/source capabilities decide eligibility, including partial or unsupported declared models.

The [conversion planner](../../src/project/ArtifactConversionPlanner.ts), [build matrix](../../src/project/BuildProductMatrix.ts) and [builder registry](../../src/project/ArtifactBuilderRegistry.ts) are the implementation authority. Inspect the [support matrix](mechanics.md#format-support) before choosing an output.

Dry-run is advisory: execution checks source binding and destination again. Package directories must be new/empty and files must be new; sidecar conflicts are rejected too. Artifact building does not apply authored changes. Use explicit editor Save or reviewed optimizer apply for those.

## Root ESM and CommonJS

The root is Node-oriented, with separate ESM/CommonJS JavaScript and type declarations. Installed TypeScript resolves the matching declaration branch. Use public exports, not private `dist` paths.

```ts
import {VideoSlotSession, SessionRuntime} from "@fromstan/pokie";
```

```js
const {VideoSlotSession, SessionRuntime} = require("@fromstan/pokie");
```

The complete deterministic example composes config, RNG, combinations and a session, then consumes it through the shared runtime command boundary. Compile it as TypeScript in an ESM consumer with the local package installed. Calling `seededRound("docs-28")` twice returns the same visible result and win. Release retained runtime state after use.

{{example:site/examples/session.ts}}

## Import-only browser exports

`@fromstan/pokie/browser`, `@fromstan/pokie/wasm` and `@fromstan/pokie/client/player` provide ESM imports and their own declarations. They have **no require branch**. The browser and WASM entrypoints omit Node orchestration. The player projects results; it is not another calculation engine. [Browser entry](../../src/browser.ts), [WASM entry](../../src/wasm/browser.ts), [player entry](../../cli/client/player/index.ts).

Use a browser-aware bundler and install the same local candidate. This complete module performs one bounded deterministic session command without importing the Node root:

{{example:site/examples/browser.ts}}

For portable components, import `instantiatePokieWasm` from `@fromstan/pokie/wasm`; for player presentation import from `@fromstan/pokie/client/player`. Component bytes, sidecars and declared host capabilities remain required. See [WASM](interop.md#canonical-wasm).
