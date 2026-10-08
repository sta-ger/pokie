[← Back to docs index](README.md)

# WASM Compatibility Boundary

POKIE WASM is a first-class, portable artifact target. `pokie build <Blueprint> --target wasm` emits a valid
`game.wasm` and an integrity-bound `game.wasm.pokie-wasm.json` manifest. The portable `pokie/wasm` runtime
instantiates only standard WebAssembly and receives randomness from its host; Node file loading, Studio state,
and process concerns stay outside that runtime. POKIE intentionally does **not** promise that an arbitrary
handwritten Node package can be compiled to WASM: Blueprint is the canonical source, and PAR reaches WASM via
the existing model-preserving Blueprint import.

The production-readable source for this boundary is `WASM_PRODUCT_CONTRACT` in
`src/project/WasmProductContract.ts`. Resolver capabilities, CLI inspection and
unsupported-operation diagnostics, conversion planning, and Studio's refreshed
WASM availability all derive from that contract; this page explains it but does
not define a second product route.

**Scope:** canonical Blueprint/PAR artifact production, integrity-checked resolution, portable runtime API,
and explicit package portability advisory. A legacy compatible sidecar remains readable for migration but is
not runnable until rebuilt as a canonical artifact.

## The contract — `PokieWasmComponentManifest`

A WASM component built against POKIE declares itself via a sidecar JSON manifest (see "Resolution" below for
where that file lives) shaped as `PokieWasmComponentManifest`:

```ts
type PokieWasmComponentManifest = {
    schemaVersion: string;                 // which version of *this* contract the manifest targets
    component: {id: string; version: string};
    minPokieVersion?: string;              // lowest POKIE release accepted by the resolver and portable runtime
    serialization: {
        session: string;                   // format id for a session's own config
        play: string;                      // format id for one played round's request/result
        state: string;                     // format id for a session's own persisted state
    };
    host: {
        rng: string;                       // format/protocol id for the host-provided RNG the component must draw through
        services: readonly string[];       // any other host-provided service ids the component needs
    };
    capabilities: readonly string[];       // open vocabulary of capability ids the component declares support for
};
```

- **Metadata** — `component.id`/`component.version` identify the component build itself, independent of
  `schemaVersion` (POKIE's own contract version) and `minPokieVersion` (the lowest package release the component
  claims compatibility with — enforced during canonical resolution and before portable runtime instantiation).
- **Session/play/state serialization** — three format ids naming the wire shape the component's own host
  boundary expects for a session's config, one played round, and persisted state. POKIE places no constraint on
  the ids themselves beyond the canonical runtime ABI it validates before execution.
- **Host RNG/services** — `host.rng` names the format/protocol id for the host-provided random source the
  component must draw through (a component never brings or seeds its own RNG — POKIE's fairness/provably-fair
  model requires every draw to be traceable to a host-issued source; see [Provably Fair](provably-fair.md)).
  `host.services` is the open list of any other host-provided service ids the component needs.
- **Capability discovery** — `capabilities` is an open vocabulary of ids the component declares support for,
  the same convention `ProjectCapability`/`ExternalDeploymentCapability` (see the
  [External Adapter SDK](external-adapter-sdk.md)) already use elsewhere in this package: never closed to a
  union, so a component author can declare ids a generic POKIE check simply never looks at.

`POKIE_WASM_CONTRACT_VERSION` (currently `"1.0.0"`) is the version of this contract the running POKIE package
understands. `PokieWasmComponentManifestValidator` checks a manifest's own shape (every field present and
correctly typed); `assessWasmComponentCompatibility` runs that validator first, then checks the manifest's own
`schemaVersion` against `POKIE_WASM_CONTRACT_VERSION` — **major-only**: a manifest with an equal-or-lower
minor/patch on the same major is compatible, a differing major is not. Shape and compatibility are deliberately
two separate, separately testable steps, the same split
[`ExternalDeploymentTargetDescriptorValidator`/`ExternalDeploymentCompatibilityValidator`](external-adapter-sdk.md)
draw for `ExternalDeploymentTarget`.

## Resolution — `WasmProjectTargetAdapter`

`ProjectTargetResolver` (see [CLI](cli.md) and the `ProjectResolving` contract) recognizes a `.wasm` file as a
`"wasm"` `PokieProject` only when it's paired with a sidecar manifest named by appending `.pokie-wasm.json` to
the `.wasm` file's own full name — e.g. `game.wasm` needs `game.wasm.pokie-wasm.json` next to it. Four possible
outcomes:

| Sidecar state | Result |
|---|---|
| No sidecar at all | `resolve()` throws `ProjectTargetUnsupportedError` naming exactly where a sidecar was looked for — an ordinary `.wasm` file is never silently treated as unrecognized *or* as a valid POKIE target. |
| Sidecar present, but unreadable JSON or fails `PokieWasmComponentManifestValidator`'s shape check | `resolve()` throws `ProjectTargetMalformedError` — the manifest signaled intent to be this type and failed a deeper read, the same convention `TsPackageProjectTargetAdapter`/`OutcomeLibraryProjectTargetAdapter` use for their own manifests. |
| Sidecar present, well-shaped, but `assessWasmComponentCompatibility` rejects its `schemaVersion` | `resolve()` throws `ProjectTargetUnsupportedError` naming exactly which contract version was declared vs. required — a clear incompatibility diagnostic. |
| Sidecar present, well-shaped, and compatible | Resolves as a `"wasm"` `PokieProject`. |

Every compatible WASM project carries `WASM_MANIFEST_READ_CAPABILITY` (`"wasm.manifest.read"`). Integrity-bound
canonical artifacts additionally carry `WASM_CANONICAL_ARTIFACT_CAPABILITY` (`"wasm.canonical"`): that proves the
module bytes and manifest have one canonical identity, but authorizes no runtime operation by itself. The manifest's
declared `runtime.play`, `runtime.serialize`, `runtime.replay`, and `artifact.inspect` operations grant their
matching capabilities independently after that integrity check. The complete portable play/serialize/replay
declaration set additionally grants `WASM_RUNTIME_EXECUTE_CAPABILITY` (`"wasm.runtime.execute"`). Consumers must
use the relevant declared per-operation capability, not treat canonical identity or the aggregate bundle as a
substitute for it.

A legacy sidecar-only component deliberately retains only manifest inspection so Studio and the CLI can explain the
migration boundary without falsely advertising execution. A resolved WASM artifact never grants
`WASM_EXPORT_CAPABILITY`, because it is an output rather than a conversion source; the authored `blueprint` and
`parWorkbook` project types grant `wasm.export` for the explicit Blueprint/PAR matrix edges.

`readWasmComponentManifest(project)` reads component id/version, serialization format ids, host bindings, and
declared capabilities. Canonical resolution also verifies the module/manifest integrity binding before runtime
operations; a swapped, stale, malformed, or incompatible sidecar is rejected before instantiation.

## Package-to-WASM preflight — `assessWasmPackagingPreflight`

For an existing POKIE `tsPackage`, `assessWasmPackagingPreflight`
runs an advisory-only scan over that package's own source: it statically finds every `import`/`require` of a
Node.js built-in module (`fs`, `path`, `child_process`, `net`, ...) — none of which exist inside a
WASM/component-model sandbox — and lists the package's own declared `package.json` runtime dependencies
verbatim, for a human to review (POKIE has no way to know whether any third-party dependency is itself portable
without actually trying to bundle it). The scan is advisory only; it is not a route into the canonical builder.

The scan is a plain regex over import/require specifiers, not a real parser — good enough to *name* a blocker,
never a guarantee that an empty result means a package is actually portable. `report.notes` explicitly says that
the canonical Blueprint/PAR builder is intentionally different from package compilation, so the report can never
be read as "no blockers found, therefore compilation works": **no POKIE command compiles an arbitrary package to
WASM, regardless of what this scan finds.**

## What's explicitly deferred

- A package-to-WASM compiler: turning an arbitrary `tsPackage` into a `.wasm` build.

No package compilation is implied by a `"wasm"` project resolving successfully, or by
`assessWasmPackagingPreflight` reporting zero blocking API usages.

## Portable continuation and explicit evidence (runtime API 1.2)

Portable session snapshots now use `pokie.state.v2`: `seed`, `sequence`,
`credits`, total `drawCount` (including unpaid initialization), and optional
JSON-safe `rngState`. No draw/round/command history is part of this snapshot.
The integrity-bound artifact declarations remain `pokie.state.v1`,
`pokie.session.v1`, `pokie.play.v1` and ABI 1.0; existing canonical artifacts
and sidecars are unchanged. The host snapshot format is independent of those
module identifiers.

`restoreSession` and `replay` accept `PokieWasmRestorableState`, including
`PokieWasmLegacySessionState`. In v1, `draws` still means complete history.
An import validates its values and count, preserves authoritative RNG/ledger
values, and emits v2 with the historical evidence intentionally omitted;
keep the input separately if it is needed as audit evidence. A legacy empty
sequence-zero seed descriptor initializes the seeded stream. Later states
without RNG continuation and unsupported/malformed versions are rejected.
Custom nextRandom-only hosts retain live execution; deterministic restoration
requires appropriate host reset/restore support. Custom `serializeState`
implementations must themselves return bounded continuation, without growing
history or queues. The runtime cannot guarantee bounded caller-owned JSON.

`BoundedPokieWasmTraceCollector(capacity)` is exported from the root,
`pokie/browser`, and `pokie/wasm`. Pass `{trace}` to create/restore/replay or
call `session.setTraceCollector(trace)` later. It captures ordered RNG evidence:
`initialization` (unpaid), `round` (settled paid play), or `replay`, plus sequence
and per-event draws. It retains the first `capacity` events, drops subsequent
events, and exposes `dropped`, detached `entries`, and lifecycle `status`.
Attachment never backfills prior evidence; restoring an existing snapshot
emits no synthetic initialization. An empty seed descriptor does initialize
and can emit its actual initialization draws. Only the concrete collector is
accepted; replaced callbacks/sinks are not invoked, and there is no asynchronous
queue. Each collector belongs to one operation/session at a time. Replay
completion closes it and transfers bounded evidence to the caller. Failed
owned initialization/replay, replacement, session/runtime disposal, and traps
clear owned buffers. Read/copy evidence before disposal if external retention
is wanted; that storage belongs to the caller.

Worker instantiate accepts either `seed` with no `draws` (ordinary bounded
seeded continuation), or an explicit finite input tape. Tape input is owned
once and remains proportional to the supplied input length; it is not a
bounded-history claim. Compact tape continuation carries a SHA-256 fingerprint,
length, cursor, seed and RNG word, never the full tape. Compatible receiving
Workers need the same tape. Old numeric and tape/cursor/seed/rng continuations
are validated on import; ordinary v2 continuation does not rescan prefixes.
An exhausted or mismatched tape reports an error and retains the settled
session snapshot. Worker `traceCapacity` opts into finite collection; `trace`
reads clone-safe evidence, and replay may return a finite `trace` field.
Restore replaces the session and ends its collector. Cancel/dispose also
invalidate pending initialization before it can publish a replacement.

CLI and Studio simulation use collector-free sessions and aggregate results,
with the existing in-process `workers=1` boundary. Replay `rounds` are explicit
request-sized output; CLI retains its requested command/result batch, while
Studio uses chunk-sized batches. Neither is cumulative continuation history.
See [P9-02 measurements](audit-corrections/compact-wasm-state.md) for bounds,
accounting and focused regression commands.
