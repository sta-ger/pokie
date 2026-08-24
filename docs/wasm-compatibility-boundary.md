[← Back to docs index](README.md)

# WASM Compatibility Boundary

POKIE has **no WASM execution backend** — no host runtime that loads a `.wasm` file, instantiates a component,
and drives session/play/state through it — and **no package-to-WASM compiler** — no command turns a
`tsPackage` game into a `.wasm` build. This module does not add either of those. What it does add is the
compatibility *boundary* between POKIE and a hypothetical WASM component: a versioned metadata contract, a
resolver that recognizes and validates a component against that contract (read-only, never executing anything),
and an advisory preflight that names what would need to change before a package could even be considered for a
WASM target.

**Scope:** contract + validation + read-only resolution + advisory preflight. Not in scope: an execution
backend, a compiler, or any claim that a specific package can be compiled to WASM today.

## The contract — `PokieWasmComponentManifest`

A WASM component built against POKIE declares itself via a sidecar JSON manifest (see "Resolution" below for
where that file lives) shaped as `PokieWasmComponentManifest`:

```ts
type PokieWasmComponentManifest = {
    schemaVersion: string;                 // which version of *this* contract the manifest targets
    component: {id: string; version: string};
    minPokieVersion?: string;              // declared metadata only -- not enforced by anything today
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
  claims compatibility with — declared, not yet enforced by any check in this package).
- **Session/play/state serialization** — three format ids naming the wire shape the component's own host
  boundary expects for a session's config, one played round, and persisted state. POKIE places no constraint on
  the ids themselves; a future execution backend would compare them against the format ids it actually knows how
  to marshal.
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

A resolved `"wasm"` project carries exactly one capability, `WASM_MANIFEST_READ_CAPABILITY`
(`"wasm.manifest.read"`) — never `RUNTIME_EXECUTE_CAPABILITY` (POKIE cannot load/run it) and never
`WASM_EXPORT_CAPABILITY` (no `ProjectType` grants that; `ArtifactBuilderRegistry` still reports `"wasm"` as
buildable from zero source types). This is the "resolve read-only" boundary:
`readWasmComponentManifest(project)` reads the manifest's own fields back for inspection — component id/version,
serialization format ids, host bindings, declared capabilities — and nothing else. It never touches the `.wasm`
bytes, and there is no operation that loads, instantiates, simulates, replays, or serves a `"wasm"` project.

## Package-to-WASM preflight — `assessWasmPackagingPreflight`

Before anyone even considers targeting WASM from an existing POKIE `tsPackage`, `assessWasmPackagingPreflight`
runs an advisory-only scan over that package's own source: it statically finds every `import`/`require` of a
Node.js built-in module (`fs`, `path`, `child_process`, `net`, ...) — none of which exist inside a
WASM/component-model sandbox — and lists the package's own declared `package.json` runtime dependencies
verbatim, for a human to review (POKIE has no way to know whether any third-party dependency is itself portable
without actually trying to bundle it).

The scan is a plain regex over import/require specifiers, not a real parser — good enough to *name* a blocker,
never a guarantee that an empty result means a package is actually portable. `report.notes` always carries
`ArtifactBuilderRegistry.describe("wasm").unsupportedNotes` verbatim, so the report can never be read as "no
blockers found, therefore compilation works": **no POKIE command compiles a package to WASM, regardless of what
this scan finds.**

## What's explicitly deferred

- A WASM execution backend: loading, instantiating, and driving session/play/state through a `.wasm` component.
- A package-to-WASM compiler: turning an arbitrary `tsPackage` into a `.wasm` build.
- Enforcing `minPokieVersion` against the running package release — declared metadata today, not yet checked by
  anything.

None of the above is implied by a `"wasm"` project resolving successfully, or by `assessWasmPackagingPreflight`
reporting zero blocking API usages.
