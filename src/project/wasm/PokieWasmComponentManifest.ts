// The versioned identity of POKIE's own WASM component contract -- what a manifest's own "schemaVersion" is
// checked against by assessWasmComponentCompatibility. Bump the major segment only for a breaking change to
// the shape below -- a manifest whose own "schemaVersion" shares this major segment is treated as compatible
// regardless of minor/patch, the same forward-tolerant "^" range convention semver itself uses; a differing
// major is always incompatible. See that function's own doc comment for the exact rule.
export const POKIE_WASM_CONTRACT_VERSION = "1.0.0";

// What a WASM component built against POKIE needs to declare about itself for POKIE to ever recognize it as a
// "wasm" ProjectType and resolve it -- read-only -- through WasmProjectTargetAdapter. This is the metadata
// half of the WASM compatibility boundary this module defines; POKIE has no WASM execution backend (no host
// runtime that actually instantiates a component and drives session/play/state through it -- see
// docs/wasm-compatibility-boundary.md), so nothing here is wired to any loader. It exists so a future
// execution backend, and any third party building a component ahead of one, have one single versioned shape
// to target instead of each guessing at POKIE's own expectations independently.
//
// Read alongside PokieWasmComponentManifestValidator (shape) and assessWasmComponentCompatibility
// (schemaVersion match against POKIE_WASM_CONTRACT_VERSION) -- this type is deliberately just the data shape;
// validation and compatibility are each their own, separately testable step, the same split
// ExternalDeploymentTargetDescriptorValidator/ExternalDeploymentCompatibilityValidator draw for
// ExternalDeploymentTarget.
export type PokieWasmComponentManifest = {
    // Which version of POKIE's own WASM component contract (see POKIE_WASM_CONTRACT_VERSION) this manifest was
    // authored against -- compared major-only (see assessWasmComponentCompatibility).
    readonly schemaVersion: string;

    // The component's own identity -- independent of "schemaVersion" above (POKIE's own contract version): a
    // component author's own id/version for their own build, surfaced for diagnostics/logging the same way
    // ExternalDeploymentTarget.id/.version are (see that type's own doc comment).
    readonly component: {
        readonly id: string;
        readonly version: string;
    };

    // Lowest POKIE release this component declares itself compatible with -- purely declared metadata today
    // (see PokieWasmComponentManifestValidator, which only checks its shape): no execution backend exists yet
    // to actually enforce it against a running POKIE version, so a caller that needs that enforcement is
    // reading a field this contract reserves for it, not a check this module already performs.
    readonly minPokieVersion?: string;

    // Format ids identifying which wire shape this component's own host boundary expects for a session's
    // config, one played round's request/result, and its own persisted state -- e.g. "pokie.session.v1" --
    // meant to be checked against the format ids a future execution backend actually knows how to marshal,
    // never assumed compatible just because a component exists. POKIE places no constraint on these ids' own
    // shape (same "open vocabulary" convention as ProjectCapability/ExternalDeploymentCapability) beyond
    // requiring all three to be present -- a component that doesn't need one of the three still has to say so
    // explicitly rather than silently omit it.
    readonly serialization: {
        readonly session: string;
        readonly play: string;
        readonly state: string;
    };

    // What this component expects the host to provide at instantiation time. "rng" is the format/protocol id
    // for the host-provided random source the component draws through -- a component never brings, seeds, or
    // trusts its own RNG; POKIE's own fairness/provably-fair model requires every draw to be traceable to a
    // host-issued source. "services" is the open list of any other host-provided service ids the component
    // declares it needs beyond RNG. Neither is optional: a component that needs no services beyond RNG still
    // declares an empty "services" array, so an absent field is always a validation error, never "the
    // component happens to need nothing."
    readonly host: {
        readonly rng: string;
        readonly services: readonly string[];
    };

    // Open vocabulary of capability ids this component itself declares support for -- the same "capability
    // discovery" convention ExternalDeploymentCapability/ProjectCapability already use elsewhere in this
    // package: never closed to a union, since a component author can declare their own additional capability
    // ids a generic POKIE check simply never looks at.
    readonly capabilities: readonly string[];
};
